---
status: completed
priority: p2
issue_id: "016"
tags: [monorepo, build, gitignore, cleanup]
dependencies: []
---

# TypeScript Build Info Files Not Gitignored

Build artifacts (*.tsbuildinfo) are currently tracked in git, creating unnecessary churn in version control.

## Problem Statement

TypeScript incremental build cache files (`*.tsbuildinfo`) are appearing as untracked files in git status and some are being committed to the repository. These are build artifacts that should never be in version control.

**Impact:**
- Pollutes git status with build artifacts
- Creates merge conflicts on incremental build state
- Increases repository size unnecessarily
- Violates clean separation of source vs. build artifacts

**Current state:**
```bash
packages/types/dist/tsconfig.test.tsbuildinfo
packages/types/tsconfig.test.tsbuildinfo
packages/types/tsconfig.build.tsbuildinfo
packages/constants/tsconfig.build.tsbuildinfo
packages/protocol/tsconfig.build.tsbuildinfo
packages/design-tokens/tsconfig.build.tsbuildinfo
packages/game-state/tsconfig.build.tsbuildinfo
```

## Findings

**Investigation results:**
- Found 10+ `*.tsbuildinfo` files across packages/ directory
- Current `.gitignore` does not include `*.tsbuildinfo` pattern
- Some tsbuildinfo files appear to be committed (need to verify with `git ls-files`)
- The remediation doc (docs/remediation.md:51) mentions "Generated types remain tracked" but this refers to TypeScript `.d.ts` files, NOT `.tsbuildinfo` files
- `.tsbuildinfo` files are incremental compilation cache, not distributable artifacts

**Root cause:**
- `.gitignore` missing `*.tsbuildinfo` pattern globally
- Possibly `.gitignore` missing `tsconfig*.tsbuildinfo` pattern for safety

## Proposed Solutions

### Option 1: Add Global Pattern to Root .gitignore

**Approach:** Add `*.tsbuildinfo` to root `.gitignore` file

**Pros:**
- Simple, single-line change
- Catches all tsbuildinfo files across all packages
- Standard practice for TypeScript monorepos

**Cons:**
- None

**Effort:** 2 minutes

**Risk:** Low

---

### Option 2: Add Per-Package .gitignore Files

**Approach:** Create `.gitignore` in each package with `*.tsbuildinfo`

**Pros:**
- More granular control per package
- Follows decentralized approach

**Cons:**
- More files to maintain
- Unnecessary duplication
- Higher maintenance burden

**Effort:** 10 minutes

**Risk:** Low

---

## Recommended Action

Add a global `*.tsbuildinfo` ignore entry and remove tracked cache files from git.

## Technical Details

**Affected files:**
- `.gitignore:1` - add `*.tsbuildinfo` pattern
- Possibly need to run `git rm --cached packages/**/*.tsbuildinfo` if any are already committed

**Verification:**
```bash
# Check if any tsbuildinfo files are tracked
git ls-files | grep tsbuildinfo

# After fix, verify pattern works
echo "test.tsbuildinfo" >> test.tsbuildinfo
git status | grep -q tsbuildinfo && echo "FAIL: still tracked" || echo "PASS: ignored"
rm test.tsbuildinfo
```

## Resources

- **TypeScript docs:** https://www.typescriptlang.org/tsconfig#incremental
- **Similar pattern:** `node_modules/` already in `.gitignore`
- **Monorepo best practice:** Turbo/pnpm workspaces documentation

## Acceptance Criteria

- [x] `*.tsbuildinfo` pattern added to root `.gitignore`
- [x] All existing `.tsbuildinfo` files are untracked by git
- [x] `git status` shows no `.tsbuildinfo` files
- [x] Verify with: `git ls-files | grep tsbuildinfo` returns nothing
- [ ] Rebuild packages confirms files are still generated but ignored

## Work Log

### 2025-12-31 - Completed

**Actions:**
- Added `*.tsbuildinfo` to root `.gitignore`
- Removed tracked `.tsbuildinfo` files from git index

### 2025-12-31 - Initial Discovery

**By:** Claude Code (Code Review Agent)

**Actions:**
- Found 10+ `.tsbuildinfo` files during monorepo review
- Checked `.gitignore` - pattern missing
- Verified these are build artifacts, not distributable code
- Researched TypeScript incremental compilation behavior

**Learnings:**
- `.tsbuildinfo` files are purely local build cache
- Should never be committed to version control
- Standard TypeScript monorepo practice to gitignore them
- Different from `.d.ts` files which ARE distributable

## Notes

- This is a cleanup/hygiene issue, not a blocker
- Should be fixed before next release to avoid confusion
- Priority P2 because it affects developer experience but not runtime
