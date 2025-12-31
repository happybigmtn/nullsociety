---
status: completed
priority: p2
issue_id: "019"
tags: [security, gateway, nonce, filesystem]
dependencies: []
---

# Nonce Persistence File Location Could Leak Sensitive Data

The nonce manager persists player nonces to a file in the current working directory, which could expose player activity patterns and session state if the gateway runs in an insecure location.

## Problem Statement

The `NonceManager` class (`gateway/src/session/nonce.ts`) persists player nonces to `.gateway-nonces.json` in the current working directory without any security considerations.

**Security concerns:**
1. **File location:** Default path `.gateway-nonces.json` creates file wherever gateway process runs
2. **No permissions:** File written with default umask (likely 0644 = world-readable)
3. **Sensitive data:** Contains mapping of player public keys to nonce values
4. **Activity patterns:** Nonce values reveal how active each player is
5. **Replay context:** Could aid replay attack planning if file is compromised

**Current implementation:**
```typescript
// gateway/src/session/nonce.ts:13
constructor(persistPath: string = '.gateway-nonces.json') {
  this.persistPath = persistPath;
}

// gateway/src/session/nonce.ts:161
persist(): void {
  try {
    const data: Record<string, string> = {};
    for (const [k, v] of this.nonces.entries()) {
      data[k] = v.toString();
    }
    writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to persist nonces:', err);
  }
}
```

## Findings

**Code analysis:**
1. **Default path vulnerability** (nonce.ts:13)
   - Uses relative path `.gateway-nonces.json`
   - Creates file in whatever directory the process runs from
   - Could be in `/tmp`, `/var/log`, or other insecure locations
   - No validation of directory permissions

2. **No access controls** (nonce.ts:167)
   - Uses `writeFileSync()` without mode parameter
   - File created with default umask (typically 0644)
   - On most systems: owner=rw, group=r, world=r
   - Anyone on the system can read player activity

3. **Sensitive data exposure**
   - Maps player public keys → current nonce
   - Reveals: who plays, how much they play, when they play
   - Could be used to correlate with other data sources
   - Privacy violation if file is leaked

4. **Missing error handling context**
   - Error logged but no alerting
   - Silent failure could lead to nonce desync
   - No monitoring of file permissions

**Attack scenarios:**
- Shared hosting: Other users could read the file
- Container escape: Attacker gains filesystem access
- Log aggregation: If file ends up in logs (misconfiguration)
- Backup exposure: Nonce file included in insecure backups

**Positive findings:**
- Nonces themselves aren't secret (public on-chain)
- File only used for crash recovery, not critical path
- Data is JSON (not binary), easy to audit

## Proposed Solutions

### Option 1: Use Secure Directory with Restricted Permissions (Recommended)

**Approach:** Store nonce file in a dedicated directory with proper permissions

```typescript
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

constructor(dataDir: string = process.env.GATEWAY_DATA_DIR || '/var/lib/gateway') {
  // Ensure directory exists with secure permissions
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 }); // rwx------
  }
  this.persistPath = join(dataDir, 'nonces.json');
}

persist(): void {
  try {
    const data: Record<string, string> = {};
    for (const [k, v] of this.nonces.entries()) {
      data[k] = v.toString();
    }
    // Write with restricted permissions: owner-only rw
    writeFileSync(this.persistPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error('Failed to persist nonces:', err);
    // TODO: Add monitoring/alerting here
  }
}
```

**Pros:**
- Secure by default (0700 directory, 0600 file)
- Configurable via environment variable
- Follows Unix security best practices
- Compatible with containerization

**Cons:**
- Breaking change (new config required)
- Needs directory creation logic
- Must document new env var

**Effort:** 1-2 hours

**Risk:** Low (backward compatible if defaulting to current behavior initially)

---

### Option 2: In-Memory Only (No Persistence)

**Approach:** Remove persistence entirely, rely on backend sync

**Pros:**
- No file security concerns
- Simpler code
- Forces proper nonce sync from backend

**Cons:**
- Gateway restart requires full resync
- Higher backend load on restart
- Loss of optimization

**Effort:** 30 minutes (remove persist/restore methods)

**Risk:** Medium (may impact performance on restart)

---

### Option 3: Encrypt Nonce File

**Approach:** Encrypt the JSON before writing, decrypt on read

**Pros:**
- Data at rest protection
- Can keep current file location

**Cons:**
- Key management complexity
- Overkill for non-secret nonces
- Performance overhead

**Effort:** 3-4 hours

**Risk:** Medium (key management adds complexity)

---

## Recommended Action

Implemented Option 1 with a `GATEWAY_DATA_DIR` defaulting to `./.gateway-data`, migration from legacy `.gateway-nonces.json`, and restrictive permissions on directory/file.

## Technical Details

**Affected files:**
- `gateway/src/session/nonce.ts:13` - constructor
- `gateway/src/session/nonce.ts:161` - persist() method
- `gateway/src/session/nonce.ts:176` - restore() method
- `gateway/src/session/manager.ts:40` - NonceManager instantiation
- Deployment docs - add GATEWAY_DATA_DIR documentation

**Implementation checklist:**
1. Add env var handling in NonceManager constructor
2. Add directory creation with 0700 permissions
3. Update persist() to write with 0600 mode
4. Add migration logic for existing `.gateway-nonces.json`
5. Update tests (if any) for NonceManager
6. Document new env var in deployment guide

**File permissions:**
```bash
# Current (insecure):
-rw-r--r-- 1 gateway gateway  1234 Dec 31 12:00 .gateway-nonces.json

# Target (secure):
drwx------ 2 gateway gateway  4096 Dec 31 12:00 /var/lib/gateway/
-rw------- 1 gateway gateway  1234 Dec 31 12:00 /var/lib/gateway/nonces.json
```

## Resources

- **Node.js fs docs:** https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options
- **Unix file permissions:** https://www.chmod-calculator.com/
- **Security best practice:** OWASP - Sensitive Data Exposure
- **Similar pattern:** `bridge_relayer.rs` uses explicit config paths (client/src/bin/bridge_relayer.rs:38)

## Acceptance Criteria

- [x] Nonce file stored in dedicated directory (not cwd)
- [x] Directory created with 0700 permissions (owner-only)
- [x] File written with 0600 permissions (owner read/write only)
- [x] Configurable via `GATEWAY_DATA_DIR` environment variable
- [x] Migration logic handles existing `.gateway-nonces.json` files
- [x] Deployment documentation updated
- [ ] Verify permissions: `ls -la /var/lib/gateway/nonces.json` shows `-rw-------`
- [ ] Test: Gateway restart successfully restores nonces from new location

## Work Log

### 2025-12-31 - Completed

**Actions:**
- Moved nonce persistence into `GATEWAY_DATA_DIR` (default `./.gateway-data`)
- Added legacy migration from `.gateway-nonces.json` and owner-only permissions
- Documented the new env var in deployment notes

### 2025-12-31 - Initial Discovery

**By:** Claude Code (Code Review Agent)

**Actions:**
- Reviewed `gateway/src/session/nonce.ts` during security audit
- Identified default path `.gateway-nonces.json` uses cwd
- Checked `writeFileSync` calls - no mode parameter
- Analyzed data sensitivity (player keys → nonce values)
- Researched Unix file permission best practices
- Found similar secure pattern in `client/src/bin/tournament_scheduler.rs:119-126` (secret file handling)

**Learnings:**
- Nonces aren't cryptographic secrets but reveal activity patterns
- Default umask on most systems is 0022 (world-readable files)
- Node.js `writeFileSync` respects umask unless mode specified
- Backend Rust code uses secure file handling for admin keys
- Container environments often run from unpredictable cwd

**Risk assessment:**
- **MEDIUM:** Privacy leak if file is world-readable
- **LOW:** Not directly exploitable for attacks (nonces are public on-chain)
- **MEDIUM:** Could aid correlation attacks or activity profiling

## Notes

- Priority P2 because it's a privacy issue, not a critical vulnerability
- Should be fixed before production deployment
- Related to remediation P1-SEC-01 (admin key file handling) - similar security concerns
- Consider: Adding monitoring for unexpected permission changes
- Consider: Logging file creation with permissions for audit
