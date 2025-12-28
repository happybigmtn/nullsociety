---
status: completed
priority: p2
issue_id: "006"
tags: [code-review, security, mobile, crypto]
dependencies: []
---

# Private Key Returned from getOrCreateKeyPair Function

## Problem Statement

The `getOrCreateKeyPair` function returns the raw private key to calling code. This means the private key exists in memory outside of cryptographic operations, increasing the attack surface.

**Why it matters:** The private key can be captured via memory dumps, logged accidentally, or exposed through debugging tools.

## Findings

**Agent:** security-sentinel
**Severity:** HIGH (P2)

**Location:** `mobile/src/services/crypto.ts:34-52`

```typescript
export async function getOrCreateKeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;  // Private key exposed in return value
}> {
  // ...
  const privateKey = hexToBytes(privateKeyHex);
  return { publicKey, privateKey };  // Private key leaves secure context
}
```

## Proposed Solutions

### Option A: Internal Signing Only (Recommended)
**Effort:** Medium
**Risk:** Low
**Pros:** Private key never leaves crypto module
**Cons:** Requires API changes

```typescript
// Don't export private key, only signing operations
export async function signMessage(message: Uint8Array): Promise<Uint8Array> {
  const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  if (!privateKeyHex) throw new Error('No key pair');
  const privateKey = hexToBytes(privateKeyHex);
  const signature = ed25519.sign(message, privateKey);
  // Clear from memory if possible
  return signature;
}

// Only export public key
export async function getPublicKey(): Promise<Uint8Array> {
  const { publicKey } = await getOrCreateKeyPair();
  return publicKey;
}
```

### Option B: Minimize Private Key Exposure
**Effort:** Small
**Risk:** Medium (still exposed)
**Pros:** Quick fix
**Cons:** Doesn't fully solve problem

Refactor callers to only request public key when private key isn't needed.

## Recommended Action

Implement Option A - refactor crypto module to never export private key.

## Technical Details

**Affected files:**
- `mobile/src/services/crypto.ts`
- Callers of `getOrCreateKeyPair`

## Acceptance Criteria

- [ ] Private key never returned from any exported function
- [ ] Signing happens internally in crypto module
- [ ] Only public key is accessible outside crypto.ts
- [ ] Existing functionality preserved

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Key material should have minimal exposure time |

## Resources

- File: `mobile/src/services/crypto.ts:34-52`
