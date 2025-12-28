---
status: completed
priority: p1
issue_id: "002"
tags: [code-review, security, mobile, storage, encryption]
dependencies: []
---

# Cached Balance Stored in Unencrypted MMKV Storage

## Problem Statement

MMKV storage is used without encryption to cache user balance data. MMKV stores data in plaintext files on the device filesystem. On rooted/jailbroken devices, this data is trivially accessible.

**Why it matters:** User financial balance data is exposed to any app or attacker with filesystem access. This could enable targeted phishing or inform attackers about high-value targets.

## Findings

**Agent:** security-sentinel
**Severity:** CRITICAL (P1) - BLOCKS MERGE

**Location:** `mobile/src/services/storage.ts:7-9, 35-36`

```typescript
export const storage = new MMKV({
  id: 'nullspace-storage',
  // No encryption configured
});

// Storing sensitive financial data unencrypted
CACHED_BALANCE: 'cache.balance',
```

## Proposed Solutions

### Option A: Enable MMKV Encryption (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Protects data at rest
**Cons:** Requires key management

```typescript
import * as SecureStore from 'expo-secure-store';

// Generate or retrieve encryption key from SecureStore
const getEncryptionKey = async () => {
  let key = await SecureStore.getItemAsync('mmkv_key');
  if (!key) {
    key = crypto.getRandomValues(new Uint8Array(32)).join('');
    await SecureStore.setItemAsync('mmkv_key', key);
  }
  return key;
};

export const storage = new MMKV({
  id: 'nullspace-storage',
  encryptionKey: await getEncryptionKey(),
});
```

### Option B: Don't Cache Financial Data
**Effort:** Small
**Risk:** Low
**Pros:** No sensitive data at rest
**Cons:** Requires network for balance

Remove `CACHED_BALANCE` and always fetch balance from server via WebSocket.

### Option C: Use expo-secure-store for Balance
**Effort:** Small
**Risk:** Low
**Pros:** Uses OS keychain
**Cons:** Slower access, limited capacity

## Recommended Action

Implement Option A (enable MMKV encryption) with a key stored in SecureStore.

## Technical Details

**Affected files:**
- `mobile/src/services/storage.ts`

## Acceptance Criteria

- [ ] MMKV storage is encrypted at rest
- [ ] Encryption key is stored in SecureStore
- [ ] Financial data (balance) is protected
- [ ] No plaintext sensitive data on filesystem

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | MMKV encryption is supported but not enabled by default |

## Resources

- File: `mobile/src/services/storage.ts:7-9`
- MMKV encryption docs: https://github.com/mrousavy/react-native-mmkv#encryption
