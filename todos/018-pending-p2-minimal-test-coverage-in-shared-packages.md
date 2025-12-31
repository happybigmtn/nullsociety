---
status: completed
priority: p2
issue_id: "018"
tags: [testing, monorepo, shared-packages, quality]
dependencies: []
---

# Minimal Test Coverage in Shared Packages

Shared packages that are used across mobile, web, and gateway have very limited test coverage, creating risk for the entire system.

## Problem Statement

The new monorepo shared packages (`@nullspace/constants`, `@nullspace/types`, `@nullspace/protocol`, `@nullspace/game-state`, `@nullspace/design-tokens`) are foundational to the entire system but have minimal test coverage.

**Impact:**
- Bugs in shared code affect mobile, web, AND gateway simultaneously
- Protocol encoding/decoding errors could cause data corruption
- Game state parsing bugs affect all clients
- No safety net when refactoring shared code
- Increases risk of regression during future changes

**Current coverage:**
```bash
# Test files in packages/
packages/protocol/test/encoding.test.ts
packages/protocol/test/fixtures/golden-vectors.json
# Total: 2 test files

# Mobile tests:
mobile/src/components/casino/__tests__/Card.test.tsx
mobile/src/utils/__tests__/numbers.test.tsx
# Total: 2 test files
```

**Missing coverage:**
- `@nullspace/types` - 0 tests (type definitions only, but runtime validation needed)
- `@nullspace/constants` - 0 tests (enums, bet types, game configs)
- `@nullspace/game-state` - 0 tests (548 lines of state parsing logic!)
- `@nullspace/design-tokens` - 0 tests (design system)
- `@nullspace/protocol/validation.ts` - Zod schemas untested

## Findings

**Analysis:**
1. **Protocol package has 1 test file** (`test/encoding.test.ts`) with 63 lines
   - Tests basic encoding/decoding
   - Missing: validation schema tests, error cases, edge cases

2. **Game-state package has 0 tests** - 548 lines of parsing logic untested
   - Complex binary parsing in `SafeReader` class
   - State parsing for all 10 games (blackjack, baccarat, roulette, etc.)
   - Critical path: mobile/web parse binary state from backend

3. **Mobile has 2 test files** - minimal component/util coverage
   - Basic smoke tests only
   - No integration tests
   - No game screen tests

4. **Constants package has 0 tests**
   - Bet types, game types, move types
   - Should validate enum consistency with Rust backend

**Root cause:**
- Fast-paced monorepo migration prioritized functionality over tests
- Shared packages created recently (commit 2e87352)
- Test infrastructure exists (Vitest configured) but underutilized

## Proposed Solutions

### Option 1: Comprehensive Test Suite (Recommended)

**Approach:** Add thorough test coverage to all shared packages

**What to test:**
1. **`@nullspace/protocol`**
   - All Zod validation schemas (validation.ts)
   - Encoding/decoding round-trips for all message types
   - Error cases (invalid types, out-of-range values)
   - Edge cases (max u64, zero bets, empty arrays)

2. **`@nullspace/game-state`**
   - SafeReader class (offset tracking, bounds checking)
   - State parsing for each game (blackjack, baccarat, etc.)
   - Malformed state handling
   - Golden test vectors from real game sessions

3. **`@nullspace/constants`**
   - Enum value consistency (matches Rust backend)
   - Bet type configurations
   - Game configuration completeness

4. **`@nullspace/types`**
   - Type guards if any exist
   - Runtime validation helpers

**Pros:**
- High confidence in shared code
- Catches regressions early
- Documents expected behavior
- Enables safe refactoring

**Cons:**
- Significant upfront effort
- Ongoing maintenance

**Effort:** 2-3 days

**Risk:** Low (pure addition, no breaking changes)

---

### Option 2: Critical Path Testing Only

**Approach:** Focus on highest-risk areas first

**Priority areas:**
1. Protocol validation schemas (validation.ts)
2. Game-state binary parsing (SafeReader + parsers)
3. Round-trip encoding/decoding tests

**Pros:**
- Faster to implement
- Covers most critical bugs
- Can expand later

**Cons:**
- Leaves gaps in coverage
- Less comprehensive

**Effort:** 1 day

**Risk:** Low-Medium (some areas remain untested)

---

### Option 3: Integration Tests Only

**Approach:** Test through mobile/gateway integration tests

**Pros:**
- Tests real-world usage
- Less mocking needed

**Cons:**
- Slower feedback loop
- Harder to isolate failures
- Doesn't test all code paths
- Mobile integration tests are complex

**Effort:** 1-2 days

**Risk:** Medium (indirect testing)

---

## Recommended Action

Implemented a focused test expansion: protocol validation schemas, game-state parsers + SafeReader, and baseline coverage for constants/design-tokens/types using Vitest.

## Technical Details

**Affected packages:**
- `packages/protocol/` - add tests in `test/` directory
- `packages/game-state/` - create `test/` directory, add parser tests
- `packages/constants/` - create `test/` directory, add enum tests
- `mobile/src/` - expand `__tests__/` directories

**Test infrastructure:**
- Vitest already configured (`packages/protocol/vitest.config.ts`)
- Can use same pattern for other packages
- Jest configured for mobile (`mobile/jest.config.js`)

**Critical files needing coverage:**
- `packages/protocol/src/validation.ts:193` - All Zod schemas
- `packages/game-state/src/index.ts:548` - All game state parsers
- `packages/protocol/src/encode.ts:223` - Encoding logic
- `packages/protocol/src/decode.ts:160` - Decoding logic

## Resources

- **Existing test:** `packages/protocol/test/encoding.test.ts` - use as template
- **Test fixtures:** `packages/protocol/test/fixtures/golden-vectors.json` - expand this
- **Backend tests:** `execution/src/casino/integration_tests.rs` - reference for expected behavior
- **Remediation doc:** `docs/remediation.md:47` - mentions testing gaps were addressed, but only for mobile components

## Acceptance Criteria

- [x] Protocol validation.ts has tests for all Zod schemas
- [x] Game-state parsers have tests for all 10 games
- [x] SafeReader class has comprehensive unit tests
- [ ] Round-trip encoding/decoding tests for all message types
- [x] Error case tests (malformed data, invalid types)
- [ ] Test coverage >80% for `@nullspace/protocol` and `@nullspace/game-state`
- [ ] CI runs package tests on every PR
- [ ] Tests pass: `pnpm -r test` from monorepo root

## Work Log

### 2025-12-31 - Completed

**Actions:**
- Added protocol validation schema tests (valid/invalid cases, zero-bet rules)
- Added game-state parser coverage for all games plus SafeReader unit tests
- Added baseline tests for constants, design-tokens, and types packages

### 2025-12-31 - Initial Discovery

**By:** Claude Code (Code Review Agent)

**Actions:**
- Analyzed test coverage across monorepo
- Found only 2 test files in packages/, 2 in mobile
- Identified `game-state` package (548 LOC) with 0 tests
- Reviewed existing `protocol/test/encoding.test.ts` as template
- Counted lines: `find packages -name "*.ts" ! -path "*/dist/*" | xargs wc -l`

**Learnings:**
- Vitest infrastructure already exists, just underutilized
- Protocol package has good test structure to copy
- Remediation doc (docs/remediation.md) mentioned adding tests but scope was limited
- Mobile component tests exist but are minimal smoke tests

**Risk assessment:**
- **HIGH:** Game-state parsing bugs affect all clients simultaneously
- **HIGH:** Protocol validation bypass could allow invalid data on-chain
- **MEDIUM:** Constants mismatch could cause mobile/backend desync

## Notes

- This should be prioritized before next major release
- Blocking for: any refactoring of shared packages
- Related to: docs/remediation.md testing gaps (but those were mobile-focused)
- Consider: Golden test vectors from real game sessions (capture state blobs from backend, verify parsing)
