# S05 - Auth flows + threat model (from scratch, with code walkthroughs)

Focus files: `services/auth/src/server.ts`, `website/src/security/authSigning.ts`, `website/src/services/authClient.ts`, `website/convex/auth.ts`, plus UI hooks and components that call them.

Goal: explain the full authentication model, the exact challenge and verification flows, and the threat model. This is a deep dive into how the system proves identity, ties identities to keys, and prevents replay or phishing.

---

## Learning map

If you want the fastest usable understanding:

1) Read Sections 1 to 4 for the basic security model.
2) Read Sections 5 to 8 for the concrete request flows.
3) Read Sections 9 to 12 for threat analysis and pitfalls.

If you only read one section, read Section 6 (Ed25519 challenge flow) and Section 10 (threat model).

---

## 1) The auth system in one paragraph

The auth server is a separate service that issues short-lived challenges. The client signs the challenge with the user's Ed25519 private key. The server verifies the signature with the public key and then creates a session (cookie) tied to that public key. The session is used to access protected endpoints (profile, billing, linking EVM addresses, etc.). This binds "web identity" to "chain identity" without ever sending private keys over the network.

---

## 2) Who are the actors in this model?

We care about four roles:

- User: holds a private key (ed25519). May also hold an EVM wallet.
- Client: web or mobile app that manages keys and signs challenges.
- Auth server: `services/auth` that issues challenges and verifies signatures.
- Convex: stores challenges and user records (source of truth for auth data).

The chain is separate. The auth server does not validate or execute on-chain transactions. It only proves that a user controls a specific public key. That public key is also the chain identity for account actions.

---

## 3) Why challenge-response instead of passwords?

Passwords are weak and easy to leak. Challenge-response with signatures has several advantages:

- The private key never leaves the device.
- The server never needs to store a secret for verification.
- A leaked database does not reveal keys.
- The same key can sign chain transactions and auth challenges, so identity is unified.

In short: the auth system is wallet-based, not password-based.

---

## 4) Domain separation for auth signatures

Auth signatures must never be confused with transaction signatures. That is why the auth system uses a separate prefix.

In `services/auth/src/server.ts`:

- `AUTH_CHALLENGE_PREFIX = "nullspace-auth:"`.

In `website/src/security/authSigning.ts`:

- The same prefix is used to build the signed message.

This means auth signatures cannot be reused as transaction signatures, because the signed bytes are different.

If you change this prefix in one place but not the other, all signatures break. That is why the code comments explicitly say "Keep in sync".

---

## 5) The data store for challenges

Challenges are stored in Convex (`website/convex/auth.ts`). There are two mutations:

- `createAuthChallenge`: inserts a challenge with ID, publicKey, and expiry.
- `consumeAuthChallenge`: marks it used, checks expiry, and returns it.

Important checks in `consumeAuthChallenge`:

- Challenge exists.
- Public key matches.
- Challenge not already used.
- Challenge not expired.

This is how replay attacks are prevented. Even if an attacker captures a challenge, it can only be used once and must be used before expiry.

---

## 6) Ed25519 challenge flow: the core login

This is the main flow for linking a public key to a session.

### Step 1: Request a challenge

Client sends:

`POST /auth/challenge`

Body includes:

- `publicKey` (hex, 32 bytes => 64 hex chars)

Server behavior (see `services/auth/src/server.ts`):

- Validates hex length.
- Generates `challengeId` (UUID) and `challenge` (32 random bytes, hex).
- Stores challenge in Convex with expiry.
- Returns `{ challengeId, challenge, expiresAtMs }`.

### Step 2: Build auth message

Client uses `website/src/security/authSigning.ts`:

- `buildAuthMessage` concatenates prefix bytes + challenge bytes.
- The result is a byte array.

### Step 3: Sign

Client uses the vault to retrieve the private key, then signs the message with Ed25519.

In `signAuthChallenge`:

- Uses WASM Signer to sign message bytes.
- Returns signature as hex string.

### Step 4: Submit proof

To link the key to the session, the client calls:

`POST /profile/link-public-key`

Body includes:

- `publicKey`
- `signature`
- `challengeId`

Server behavior:

- Reads challenge from Convex using `consumeAuthChallenge`.
- Verifies signature with `verifySignature`.
- Links public key to the user in Convex.
- Returns success.

Once linked, the session knows which chain public key belongs to this user.

---

## 7) How signature verification works on the server

In `services/auth/src/server.ts`, signature verification uses Node's `crypto` module. Ed25519 public keys are expected to be in raw 32-byte form, so the server converts them into an SPKI DER format using a prefix:

- `ED25519_SPKI_PREFIX = 302a300506032b6570032100` (hex)
- `spki = prefix || publicKeyBytes`

This allows `crypto.createPublicKey` to parse it correctly. Then `crypto.verify` checks the signature.

This is a subtle implementation detail that matters because Node's crypto expects structured keys. If you pass raw bytes directly without the prefix, verification fails.

---

## 8) Session handling and cookies

The auth server uses `@auth/express` and `Credentials` provider. Once the credentials are verified, it issues a session (typically a secure HTTP-only cookie).

On the client side, `authFetch` in `website/src/services/authClient.ts` sets `credentials: "include"`. This ensures cookies are sent with each request, which is required for session auth.

Important detail: if you forget `credentials: "include"`, the browser will not send cookies, and every profile request will look unauthorized.

---

## 9) EVM linking flow

In addition to Ed25519 keys, the system can link an EVM wallet to a user. This is a separate challenge flow with its own prefix and message format.

### Step 1: Request EVM challenge

`POST /profile/evm-challenge`

Body:

- `address`: EVM address
- `chainId`: chain id (must be allowed)

Server behavior:

- Ensures the user has already linked a public key.
- Creates a challenge and stores it in Convex (`website/convex/evm.ts`).
- Builds a message with `buildEvmLinkMessage`, including origin, address, chainId, userId, and challenge.
- Returns `{ challengeId, message, expiresAtMs, address, chainId }`.

### Step 2: Sign with EVM wallet

The user signs the message using their wallet (personal_sign). The signature is a standard Ethereum signature, not Ed25519.

### Step 3: Submit EVM link

`POST /profile/link-evm`

Body:

- `address`
- `chainId`
- `signature`
- `challengeId`

Server behavior:

- Consumes challenge from Convex.
- Rebuilds the message to verify.
- Uses `ethers.verifyMessage` to recover the address.
- Links the EVM address to the user.

This flow ensures that an EVM link can only be created by someone who controls the wallet and is already authenticated with a public key.

---

## 10) Mobile auth flow

Mobile uses a similar challenge-response system but with a different endpoint:

- `POST /mobile/challenge` for challenge issuance.
- `POST /mobile/entitlements` for signed proof and entitlements lookup.

The mobile flow is intentionally simpler. It verifies the Ed25519 signature and then returns entitlements. It does not create a full session like the web flow. This is useful for native apps that want a quick, stateless proof of identity.

There is also a mobile-side biometric layer (`mobile/src/services/auth.ts`) that controls local access to the app, but that is separate from the server auth flow.

---

## 11) Rate limiting and origin checks

Auth endpoints are high-value targets, so the server includes several protections:

- Rate limits on challenges and profile endpoints.
- Allowed origin checks (`AUTH_ALLOWED_ORIGINS`).
- Separate mobile enable flag (`AUTH_MOBILE_ENABLED`).

`requireAllowedOrigin` uses the request `Origin` or `Referer` and checks it against `AUTH_ALLOWED_ORIGINS`. If the origin is not allowed, the request fails with `403`.

This reduces the risk of malicious websites using a user's browser to hit auth endpoints.

---

## 12) Threat model: what we protect against

### 12.1 Replay attacks

Threat: attacker captures a signed challenge and reuses it.

Mitigation:

- Challenges are single-use (`consumeAuthChallenge` sets `usedAtMs`).
- Challenges expire (`expiresAtMs`).

### 12.2 Phishing and origin abuse

Threat: a malicious site asks the user to sign a challenge or sends the signed challenge to the auth server.

Mitigation:

- Allowed origins list.
- Prefix-based domain separation (`nullspace-auth:`) so signatures are not reusable elsewhere.

### 12.3 Token theft

Threat: attacker steals session cookies.

Mitigation:

- Use secure, HTTP-only cookies (handled by the auth framework).
- Keep sessions short and rotate as needed (framework-level behavior).

### 12.4 Public key mismatch

Threat: user signs with one key but requests challenge for another.

Mitigation:

- The server stores publicKey with the challenge and requires that same publicKey when consuming.

### 12.5 EVM replay

Threat: reuse EVM signature on a different chain or for a different user.

Mitigation:

- EVM message includes `origin`, `chainId`, `userId`, and challenge.
- Challenge is single-use and stored server-side.

### 12.6 Key exfiltration and local device compromise

Threat: attacker steals the user's private key from the device or browser storage.

Mitigation:

- Keys are stored in vaults (web passkey vault, password vault, mobile secure store).
- Vaults can be locked and require explicit user action to unlock.
- The signing path uses WASM and never sends the private key over the network.

This does not eliminate the risk of device compromise, but it reduces accidental exposure and makes it harder to steal keys through casual attacks or logs. The most important control remains: do not expose private keys in logs or telemetry, and ensure the vault stays locked when not in use.

---

## 13) Walkthrough: linking a public key from the UI

This is a concrete UI to server trace:

1) UI gets the user public key from the vault (`website/src/security/keyVault.ts` and `vaultRuntime`).
2) UI calls `requestAuthChallenge` (in `authClient.ts`) with the public key.
3) UI receives `{ challengeId, challenge }`.
4) UI calls `signAuthChallenge` (in `authSigning.ts`), which uses WASM Signer to sign `AUTH_CHALLENGE_PREFIX || challenge`.
5) UI sends `linkPublicKey` with `publicKey`, `signature`, and `challengeId`.
6) Auth server consumes the challenge, verifies signature, and links the key to the user.
7) UI now has a session that includes `authSubject` (the public key).

From this point on, the UI can call `/profile` and other authenticated endpoints.

---

## 14) Walkthrough: EVM link from the UI

1) UI calls `requestEvmChallenge` with address and chainId.
2) Auth server generates a message, including the userId and challenge.
3) User signs message in wallet.
4) UI calls `linkEvmAddress` with address, signature, challengeId.
5) Auth server verifies signature and stores the link.

Notice the user must already be authenticated (session cookie). That is enforced by `requireSession` in the auth server.

---

## 15) Session data and profiles

`/profile` returns:

- The current session (including authProvider and authSubject).
- The user's entitlements.
- Any EVM links.

The UI uses `useAuthSession` and related hooks to keep this state current. If the session is missing, the UI treats the user as unauthenticated and may prompt to sign in.

---

## 16) Monitoring and ops hooks

The auth service includes:

- `/healthz` for basic health checks.
- `/metrics` and `/metrics/prometheus` for counters and timings.
- Request IDs for logging (`x-request-id`).

These are not directly related to authentication correctness, but they are essential for production operations. If auth is broken, these endpoints help triage quickly.

---

## 17) Common mistakes and debugging tips

### 17.1 Incorrect hex formatting

Public keys and signatures are expected as lowercase hex without `0x` and with exact lengths. If you send wrong lengths, the server rejects with `invalid publicKey` or `invalid signature`.

### 17.2 Missing credentials in fetch

If your auth requests are unauthenticated even after login, check that `authFetch` includes `credentials: "include"`.

### 17.3 Prefix mismatch

If signatures are always invalid, check that the prefix in `authSigning.ts` matches `AUTH_CHALLENGE_PREFIX` in the server.

### 17.4 Expired challenges

If the client delays too long between requesting and signing, the challenge can expire. The server returns `invalid challenge` in that case. Retry by requesting a new challenge.

---

## 18) Code walkthrough: verifySignature on the server

Open `services/auth/src/server.ts` and look at `verifySignature`. This is one of the most important functions in the auth system because it is the cryptographic gatekeeper.

The core steps are:

1) Convert the hex public key to bytes (`Buffer.from(publicKeyHex, "hex")`).
2) Convert the hex signature to bytes.
3) Build an SPKI wrapper for the raw Ed25519 public key using a constant prefix.
Node's `crypto` module expects public keys in a structured format (SubjectPublicKeyInfo). Ed25519 raw public keys are just 32 bytes, so the code prepends `ED25519_SPKI_PREFIX` (a fixed DER header) to those bytes. The result is a valid DER-encoded SPKI public key, which `crypto.createPublicKey` can parse.

Then the code calls `crypto.verify` with:
- Algorithm: `null` (Ed25519 in Node does not require specifying a hash algorithm).- Message: the challenge prefix plus challenge bytes (from `buildAuthMessage`).- Public key: the SPKI key.- Signature bytes.

If any part is malformed (wrong length, invalid DER, invalid signature), the function returns `false`. This is intentionally strict. It is better to fail closed and require a new challenge than to accept malformed signatures.

This is a good example of an implementation detail that would be easy to get wrong in another language. If you are adding another client (say, a CLI), you must ensure that you are signing the exact same message bytes that `buildAuthMessage` produces.

## 19) Code walkthrough: client-side auth signing

On the client side, the relevant code is in `website/src/security/authSigning.ts`. The steps are:

1) Normalize the hex string (strip `0x`, ensure even length).
2) Convert the challenge hex to bytes.
3) Build a message by concatenating the prefix bytes and the challenge bytes.
4) Use the vault private key to sign the message.
5) Return the signature as a lowercase hex string.

One subtle detail: the signer used here is the WASM `Signer` from the transaction layer. This is intentional. It ensures the exact same Ed25519 implementation is used for both transaction signing and auth signing in the browser. The only difference is the namespace (auth prefix versus transaction namespace).

Another subtle detail: the private key is fetched from the vault runtime (`getUnlockedVault`). If the vault is locked, the function throws. This is deliberate: the user must explicitly unlock their key before signing anything.

The output signature is a hex string because the server expects hex. If you accidentally send base64 or raw bytes, the server will reject the request as an invalid signature.

## 20) CORS, CSRF, and session details

The auth server uses CORS and origin validation. CORS (`cors` middleware) determines which browser requests are allowed to carry cookies. Origin validation (`requireAllowedOrigin`) is an additional check that ensures only known frontends can hit sensitive endpoints.

On the client, the `authFetch` function always sets `credentials: \"include\"`. This is required because sessions are stored in cookies. If you omit this flag, the browser will not send cookies, and every profile request will appear unauthenticated.

The auth system also exposes a CSRF endpoint (`/auth/csrf`). The `getCsrfToken` function in `authClient.ts` fetches this token when needed. Depending on your frontend framework and auth provider configuration, this token may be required when you submit certain forms or callbacks. Even if you are not using it directly, it is part of the standard auth flow and should remain functional.

In short: CORS and CSRF are not secondary. They are the web security envelope around the signature system. A strong signature scheme is not enough if a browser can be tricked into sending requests to the wrong origin.

One practical check: if sign-in works but sign-out fails or callbacks error, inspect CSRF token handling and cookie settings. These issues usually look like generic 403 or \"unauthorized\" responses, but the root cause is often missing cookies or an invalid CSRF token, not a bad signature.

## 21) Entitlements, freeroll sync, and why auth is more than login

In this stack, authentication is not only about proving identity. It is also how we gate product access. That is why the auth server talks to Convex for entitlements and why it performs a freeroll sync.

Key flow:
- `/profile` returns entitlements and EVM links alongside the session.- When a user has entitlements, the server calls `syncFreerollLimit` to update on-chain or off-chain state for tournament limits.- This ties auth to gameplay: a verified identity can unlock freeroll participation or higher limits.
From the code in `services/auth/src/server.ts`, you can see that `/profile` fetches entitlements and then tries to sync. The result is logged with counters and timing metrics. If sync fails, the profile endpoint still returns the session, but the ops logs capture the failure.

This matters for operations because it means login can be used as a trigger for downstream consistency. Instead of forcing the user to manually sync, the system tries to reconcile entitlements as part of the profile call. That reduces friction but also means that profile endpoints must be resilient: failure to sync should not prevent the user from accessing their profile.

From a security perspective, this also means entitlements are not purely UI state. They are authoritative records in Convex, tied to a session, and used to adjust gameplay constraints. If the session is compromised, entitlements can be read. That is another reason why strong session handling and origin enforcement matter: entitlements are effectively privileges.

## 22) Feynman recap: explain it like I am five

- The server gives you a random puzzle (challenge).
- You sign the puzzle with your secret key.
- The server checks the signature with your public key.
- If it matches, you are logged in.
- The puzzle can only be used once and expires quickly.

---

## 23) Exercises (to build mastery)

1) Use `authClient.ts` to request a challenge and log the hex bytes. Ensure the challenge length is 64 hex chars (32 bytes).

2) In a dev environment, change the `AUTH_CHALLENGE_PREFIX` in the client and observe that signatures become invalid. Undo the change.

3) Link an EVM address, then attempt to link the same address with a different chainId. Confirm it is rejected.

4) Inspect the Convex `auth_challenges` table and confirm that `usedAtMs` is set when a challenge is consumed.

---

## Next primer

S06 - Payments + webhook idempotency: `feynman/lessons/S06-payments-primer.md`
