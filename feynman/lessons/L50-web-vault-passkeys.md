# L50 - Web vault (passkey + password) storage (from scratch)

Focus file: `website/src/security/keyVault.ts`

Goal: explain how the web app creates a local vault using passkeys or passwords, and how secrets are encrypted/decrypted on the device. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Local key vault
The web client stores private keys locally in the browser. The vault encrypts those keys so they are not stored in plain text.

### 2) Passkey-based vault
Modern authenticators can produce a secret (PRF/hmac-secret/largeBlob). This secret is used to derive an AES key for encryption.

### 3) Password-based vault
If passkeys are not available, the vault can derive an AES key using PBKDF2 and a user password.

### 4) IndexedDB + localStorage
- Encrypted vault records are stored in IndexedDB.
- Non-secret metadata (kind, public key) is stored in localStorage for fast access.

---

## Limits & management callouts (important)

1) **Password min length = 10**
- `PASSWORD_MIN_LENGTH` enforces a baseline.
- Consider raising this for production security.

2) **PBKDF2 iterations = 310,000**
- This is a CPU cost knob for password vaults.
- Higher values improve security but can slow low-end devices.

3) **Passkey fallback mode (v2) stores a key in IndexedDB**
- If PRF/largeBlob are not supported, it falls back to a non-extractable AES key.
- This is device-local and not portable across devices.

---

## Vault record formats (deep dive)

There are three on disk record formats, all stored in IndexedDB under the
`vaults` object store. The record version tells you how to derive the AES key.

### 1) Version 1 (passkey PRF)
`VaultRecordV1` includes:

- `credentialId` (base64url)
- `prfSalt` (base64url, 32 bytes)
- `cipher` with `iv` and `ciphertext`
- `nullspacePublicKeyHex`

The AES key is derived on demand by calling WebAuthn, extracting PRF output,
then running HKDF with the stored salt.

### 2) Version 2 (passkey fallback)
`VaultRecordV2` uses the same cipher shape but stores a `keystoreKey` which is
an opaque `CryptoKey` stored in IndexedDB. This is used when PRF, hmac-secret,
or largeBlob are unavailable on the authenticator.

The key is non extractable and therefore device local. It cannot be exported
or synced to another device.

### 3) Version 3 (password)
`VaultRecordV3` stores:

- a PBKDF2 config (iterations, hash)
- a salt
- the same AES GCM cipher

This is the non passkey fallback for devices without WebAuthn support.

---

## Key derivation and encryption (deep dive)

### 1) Passkey PRF path
The passkey path tries in order:

1) PRF output via `prf.results.first`
2) `hmacGetSecret.output1`
3) `largeBlob` read or write

If any of these return bytes, they are used as PRF output. The PRF output is
converted into an AES 256 key via HKDF with:

- salt = `prfSalt`
- info = `nullspace-vault-v1`
- hash = SHA-256

The resulting AES key is non extractable and only used for encrypt/decrypt.

### 2) Password path
The password path uses PBKDF2 with:

- normalized password (`NFKC`)
- `PASSWORD_KDF_ITERATIONS` (310,000)
- SHA-256
- 32 byte random salt

The derived AES key is also non extractable and used for AES GCM.

### 3) AES GCM details
Secrets are encrypted with AES GCM using:

- a 12 byte random IV
- additional authenticated data (AAD) = `nullspace:{vaultId}:v1`

The AAD binds the ciphertext to the vault id and version string so that
cross vault swaps are detected by the decrypt operation.

---

## Secret contents (what is actually protected)

The encrypted payload (`VaultSecretsV1`) contains:

- `nullspaceEd25519PrivateKey` (base64url, 32 bytes)
- `chatEvmPrivateKey` (base64url, 32 bytes)

These keys are generated via `WasmWrapper` and `crypto.getRandomValues`. The
public key is derived and stored in plaintext metadata for quick access.

Because the secrets are JSON encoded, the decrypt path verifies `version === 1`
to avoid silently using a future incompatible schema.

---

## Metadata vs secrets (why two stores)

Secrets are encrypted and stored in IndexedDB, but metadata is stored in
`localStorage`:

- vault enabled flag
- vault kind (passkey or password)
- vault id
- public key hex
- credential id (passkey only)

This split allows the app to quickly know whether a vault exists and which
unlock flow to run, without touching IndexedDB on every load.

The tradeoff is that localStorage is not confidential. That is why only public
metadata is stored there, never private key material.

---

## Vault creation flow (deep dive)

### 1) Passkey vault creation
`createPasskeyVault` performs these steps:

1) Create a passkey credential (WebAuthn).
2) Generate a PRF salt.
3) Derive an AES key via PRF or fall back to a local key (v2).
4) Generate vault secrets and a nullspace keypair (Wasm).
5) Encrypt secrets and store the record in IndexedDB.
6) Store metadata in localStorage.
7) Set the in memory unlocked vault for immediate use.

If a legacy casino private key exists and `migrateExistingCasinoKey` is true,
the function will migrate that key into the vault and clear old metadata.

### 2) Password vault creation
`createPasswordVault` mirrors the passkey flow but uses PBKDF2 to derive the
AES key. It enforces `PASSWORD_MIN_LENGTH` and stores a version 3 record.

Both flows update the in memory vault cache so the UI can immediately use the
keys without forcing an extra unlock call.

---

## Unlock flow (deep dive)

### 1) Passkey unlock
`unlockPasskeyVault`:

1) Loads the vault record from IndexedDB.
2) Calls WebAuthn to get PRF output or uses the stored keystore key (v2).
3) Decrypts the secrets.
4) Stores an `UnlockedVault` in memory (not persistent).

The unlocked vault is stored via `setUnlockedVault` and is cleared on logout
or when `deleteVault` is called.

### 2) Password unlock
`unlockPasswordVault`:

1) Loads the record.
2) Derives the AES key with the stored salt and iteration count.
3) Decrypts secrets and populates the in memory vault.

If decryption fails (wrong password), it throws an error and does not unlock.

---

## Migration and cleanup details

The vault code includes migration helpers:

- `migrateRegistrationFlag` copies old registration flags keyed by a legacy
  private key hex to the new public key hex.
- `clearPendingNonceAndTxs` resets local nonce tracking and removes old tx
  records from localStorage.

These functions are important because they prevent stale client state from
corrupting a newly created vault.

---

## Security tradeoffs to understand

1) **Passkey fallback (v2) is device bound.**
   It improves compatibility but makes cross device recovery impossible.
2) **Password vault security depends on the password.**
   PBKDF2 helps, but a weak password is still weak.
3) **localStorage metadata is not confidential.**
   Only public data should live there, and that rule is followed here.
4) **Unlocked vault is memory only.**
   This is good: keys are not stored unencrypted after unlock.

If you ever change the AAD or the vault record schema, you must also update
the decrypt path or you will break existing vaults.

---

## Passkey verification nuances

For v2 vaults (fallback mode), the unlock path calls
`assertPasskeyUserVerification`. This ensures the authenticator still verifies
the user even though PRF output is not available. The AES key is stored in
IndexedDB, but user verification is still required to unlock the vault.

For v1 vaults, user verification is implied by the WebAuthn PRF / assertion
flow. In both cases, the goal is the same: require a live authenticator
interaction for unlock.

---

## LargeBlob and PRF compatibility

The vault tries to use PRF first, then hmac-secret, then largeBlob. This is a
pragmatic compatibility strategy:

- Some authenticators support PRF.
- Some support hmac-secret.
- Some support largeBlob but not PRF.

By supporting all three, the vault works across a wider range of devices.
The tradeoff is complexity: you must preserve these branches if you want old
vaults to remain unlockable.

---

## Browser support realities

Passkeys are not uniformly supported across browsers and devices. The code
checks for:

- `PublicKeyCredential`
- `navigator.credentials`
- WebCrypto APIs
- IndexedDB

If any of these are missing, the passkey flow is disabled and the UI should
fall back to password vaults. This is why the status check exposes both
`passkeySupported` and `passwordSupported`.

---

## Runtime state and UX implications

The vault has two layers of state:

1) Persistent state in IndexedDB and localStorage.
2) In memory unlocked state in `vaultRuntime`.

The unlocked state is intentionally not persisted. It exists only for the
current page session. When the page reloads, the user must unlock again.

This is a security feature: it narrows the window in which decrypted keys are
present in memory and prevents background tabs from silently retaining access.

---

## Lock and delete behavior

### 1) Locking
`lockPasskeyVault` simply clears the in memory unlocked state. It does not
delete anything from IndexedDB. It is equivalent to "log out" from a key
standpoint.

### 2) Deleting
`deleteVault` removes the record from IndexedDB and clears metadata in
localStorage. It also clears the unlocked state. This is a destructive action:
once deleted, the keys are gone unless the user has backed them up elsewhere.

---

## Status checks and fast path UX

The function `getVaultStatusSync` summarizes the vault state without any
asynchronous operations. It returns:

- whether the browser supports vault storage
- whether a vault is enabled
- whether it is unlocked
- the current public key
- the vault kind (passkey or password)

This is the primary API the UI uses to decide whether to show "Create vault",
"Unlock vault", or "Vault ready" states. Because it is synchronous, it can be
used during initial render without waiting for IndexedDB.

---

## Why the Wasm wrapper is used

`createVaultSecrets` uses `WasmWrapper` to generate the ed25519 keypair. This
keeps key generation consistent with the rest of the stack and avoids subtle
differences in key formatting. The wasm module is initialized, used to create
the keypair, and then cleared. The private key bytes are then encrypted into
the vault.

This is a clean separation: wasm handles crypto, the vault handles storage.

---

## Migration logic (why it exists)

Older versions of the app stored a raw `casino_private_key` in localStorage.
When a vault is created, the code can migrate that legacy key:

- If a legacy key exists and migration is enabled, it is imported and then
  removed from localStorage.
- If there is no legacy key, the vault generates a new keypair.

This prevents stale state from surviving after the vault is introduced. It
also avoids nonce mismatches by clearing cached nonces and tx records when
creating a new identity.

---

## Failure modes to keep in mind

1) **PRF not supported**
If PRF and largeBlob are not supported by the authenticator, vault creation
falls back to v2. This is safe but device locked. Users should be warned that
their vault will not sync across devices.

2) **Wrong password**
Password vaults return `password-invalid` on decrypt failure. The data remains
encrypted, so repeated failures do not corrupt the record.

3) **Missing keystoreKey**
If a v2 record is missing `keystoreKey`, unlock will fail. This can happen if
IndexedDB is cleared or a browser bug drops the CryptoKey reference.

4) **Version mismatch**
If the record version does not match the expected kind, the unlock functions
throw `vault-kind-mismatch`. This protects against accidental misuse.

---

## Why AES GCM with AAD

AES GCM provides confidentiality and integrity in one step. The vault uses a
12 byte IV and binds the ciphertext to the vault id via AAD:

`nullspace:{vaultId}:v1`

This means you cannot copy a ciphertext from one vault id to another and have
it decrypt. The AAD is part of the authentication tag.

If you ever change the AAD format, you must also support legacy values or
existing vaults will fail to decrypt. That is why the string includes a
version tag (`v1`) even though the secrets are also versioned. It gives you a
migration path without ambiguity.

---

## Versioning strategy (why it is layered)

There are two layers of versioning:

1) The vault record version (1, 2, 3) which defines how to derive the AES key.
2) The secrets payload version (currently `version: 1`) which defines the JSON
   schema of decrypted secrets.

This separation is intentional. You can change key derivation without changing
the secrets schema, or vice versa. It also lets you deprecate old derivation
methods while still reading existing secrets.

If you ever add a new secrets version, update both `encryptVaultSecrets` and
`decryptVaultSecrets` to support it, and make sure the unlock flows validate
the new version explicitly.

---

## Timestamps and update semantics

Each vault record stores `createdAtMs` and `updatedAtMs`. These are not used
for cryptography; they are metadata for UX and debugging. When you update a
vault (for example, on a future key rotation), you should update `updatedAtMs`
to reflect the change. That makes it easier to reason about whether a vault is
stale or newly created.

Because these timestamps are stored in IndexedDB, they persist across reloads
and can be displayed in a settings screen without unlocking the vault.

This is useful for "last updated" UX and support troubleshooting.
It also gives you a hook for future audits or user prompts.
For example, you can prompt users to rotate keys after long inactivity.
That reduces the risk of stale credentials lingering on shared devices.
It is a small but meaningful safeguard.
Use it.

---

## Walkthrough with code excerpts

### 1) Passkey support detection
```rust
export function isPasskeyVaultSupported(): boolean {
  if (!isVaultStorageSupported()) return false;
  return typeof window.PublicKeyCredential !== 'undefined' && !!navigator?.credentials;
}
```

Why this matters:
- The UI needs to know whether passkey flows can even work on this device.

What this code does:
- Checks for browser crypto and WebAuthn support.
- Returns true only if passkeys are likely supported.

---

### 2) Creating a passkey credential
```rust
async function createPasskeyCredential(): Promise<{ credentialId: string }> {
  if (!isPasskeyVaultSupported()) throw new Error('passkey-vault-unsupported');

  const rpId = normalizeRpId(window.location.hostname);
  const challenge = randomBytes(32);
  const userId = randomBytes(32);

  const publicKey: any = {
    rp: { name: 'null/space', id: rpId },
    user: { id: userId, name: 'nullspace', displayName: 'nullspace' },
    challenge,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'required',
    },
    extensions: {
      prf: {},
      hmacCreateSecret: true,
      largeBlob: { support: 'preferred' },
    },
  };

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey-create-failed');

  const credentialId = bytesToBase64Url(new Uint8Array(cred.rawId));
  return { credentialId };
}
```

Why this matters:
- This is how the browser creates a passkey identity for the vault.

What this code does:
- Builds a WebAuthn request with PRF/hmac-secret/largeBlob extensions.
- Creates a passkey and stores its credential ID.

---

### 3) Deriving an AES key from PRF output
```rust
async function deriveAesKeyFromPrf(prfOutput: Uint8Array, prfSalt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', prfOutput as BufferSource, 'HKDF', false, ['deriveKey']);
  const info = new TextEncoder().encode('nullspace-vault-v1');
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: prfSalt as BufferSource, info: info as BufferSource },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
```

Why this matters:
- The PRF output is not used directly; it is stretched into a stable AES key.

Syntax notes:
- `HKDF` derives a key from raw bytes using salt + info.
- `AES-GCM` is used for authenticated encryption.

What this code does:
- Imports the PRF output as an HKDF key.
- Derives a 256-bit AES-GCM key for encryption/decryption.

---

### 4) Creating a passkey vault with fallback
```rust
export async function createPasskeyVault(options?: { migrateExistingCasinoKey?: boolean }): Promise<VaultRecord> {
  if (!isPasskeyVaultSupported()) throw new Error('passkey-vault-unsupported');
  const vaultId: VaultId = 'default';

  const { credentialId } = await createPasskeyCredential();
  const prfSalt = randomBytes(32);

  let aesKey: CryptoKey;
  let recordVersion: 1 | 2 = 1;
  try {
    const largeBlobSeed = randomBytes(32);
    const prfOutput = await getPrfOutput(credentialId, prfSalt, { largeBlobWrite: largeBlobSeed });
    aesKey = await deriveAesKeyFromPrf(prfOutput, prfSalt);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg !== 'passkey-prf-unsupported') throw e;

    aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    recordVersion = 2;
  }

  const { secrets, nullspacePublicKeyHex, bettingPrivateKeyBytes, chatEvmPrivateKey } = await createVaultSecrets(options);
  const cipher = await encryptVaultSecrets(aesKey, vaultId, secrets);
  const now = Date.now();

  const record: VaultRecord = recordVersion === 1
    ? { id: vaultId, version: 1, credentialId, prfSalt: bytesToBase64Url(prfSalt), cipher, nullspacePublicKeyHex, createdAtMs: now, updatedAtMs: now }
    : { id: vaultId, version: 2, credentialId, keystoreKey: aesKey, cipher, nullspacePublicKeyHex, createdAtMs: now, updatedAtMs: now };

  await idbPutVault(record);
  setVaultMeta({ kind: VAULT_KIND_PASSKEY, vaultId, publicKeyHex: nullspacePublicKeyHex, credentialId });

  const unlocked: UnlockedVault = {
    vaultId,
    credentialId,
    unlockedAtMs: now,
    nullspaceEd25519PrivateKey: bettingPrivateKeyBytes,
    chatEvmPrivateKey,
    nullspacePublicKeyHex,
  };
  setUnlockedVault(unlocked);

  return record;
}
```

Why this matters:
- This is the core flow that creates a passkey-protected vault.

What this code does:
- Creates a passkey and derives an AES key from PRF output.
- Falls back to a device-local AES key if PRF is unsupported.
- Encrypts secrets, stores the vault, and marks it unlocked in memory.

---

### 5) Password-based vault creation
```rust
export async function createPasswordVault(
  password: string,
  options?: { migrateExistingCasinoKey?: boolean },
): Promise<VaultRecord> {
  if (!isPasswordVaultSupported()) throw new Error('password-vault-unsupported');
  if (!password || password.length < PASSWORD_MIN_LENGTH) throw new Error('password-too-short');

  const vaultId: VaultId = 'default';
  const salt = randomBytes(32);
  const aesKey = await deriveAesKeyFromPassword(password, salt, PASSWORD_KDF_ITERATIONS);

  const { secrets, nullspacePublicKeyHex, bettingPrivateKeyBytes, chatEvmPrivateKey } = await createVaultSecrets(options);
  const cipher = await encryptVaultSecrets(aesKey, vaultId, secrets);
  const now = Date.now();

  const record: VaultRecordV3 = {
    id: vaultId,
    version: 3,
    kind: 'password',
    kdf: { name: 'PBKDF2', iterations: PASSWORD_KDF_ITERATIONS, hash: 'SHA-256' },
    salt: bytesToBase64Url(salt),
    cipher,
    nullspacePublicKeyHex,
    createdAtMs: now,
    updatedAtMs: now,
  };

  await idbPutVault(record);
  setVaultMeta({ kind: VAULT_KIND_PASSWORD, vaultId, publicKeyHex: nullspacePublicKeyHex });
  setUnlockedVault({ vaultId, unlockedAtMs: now, nullspaceEd25519PrivateKey: bettingPrivateKeyBytes, chatEvmPrivateKey, nullspacePublicKeyHex });

  return record;
}
```

Why this matters:
- Password vaults provide a non-passkey fallback for devices without WebAuthn support.

What this code does:
- Derives an AES key via PBKDF2.
- Encrypts and stores secrets in IndexedDB.
- Stores metadata in localStorage for quick access.

---

## Key takeaways
- The vault encrypts private keys on-device using passkeys or passwords.
- Passkey PRF is preferred; IndexedDB keystore is the fallback.
- Password vaults rely on PBKDF2 with a high iteration count.

## Next lesson
E16 - Limits inventory + tuning: `feynman/lessons/E16-limits-inventory.md`
