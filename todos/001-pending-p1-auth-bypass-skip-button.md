---
status: completed
priority: p1
issue_id: "001"
tags: [code-review, security, mobile, authentication]
dependencies: []
---

# Authentication Bypass - Skip Button Allows Unauthenticated Access

## Problem Statement

The AuthScreen contains a "Skip (Demo Mode)" button that allows users to bypass biometric authentication entirely and access the casino lobby with full functionality. There is no environment check to disable this in production builds.

**Why it matters:** An attacker can access the application without any authentication, potentially accessing wallet functionality and placing bets without proving device ownership.

## Findings

**Agent:** security-sentinel
**Severity:** CRITICAL (P1) - BLOCKS MERGE

**Location:** `mobile/src/screens/AuthScreen.tsx:41-45`

```typescript
const handleSkip = useCallback(() => {
  // Allow skipping in development/demo mode
  haptics.buttonPress();
  navigation.replace('Lobby');
}, [navigation]);
```

The skip function is always available and navigates directly to the Lobby without any authentication.

## Proposed Solutions

### Option A: Remove Skip Button Entirely (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Most secure, no bypass possible
**Cons:** Harder local development

Remove the "Skip (Demo Mode)" button and `handleSkip` function completely.

### Option B: Gate Behind __DEV__ Flag
**Effort:** Small
**Risk:** Low
**Pros:** Enables dev convenience, stripped in production
**Cons:** Still technically possible to re-enable by modifying bundle

```typescript
{__DEV__ && (
  <PrimaryButton label="Skip (Demo Mode)" onPress={handleSkip} variant="ghost" />
)}
```

### Option C: Environment Variable Check
**Effort:** Small
**Risk:** Medium (env vars can be bundled)
**Pros:** Configurable per build
**Cons:** EXPO_PUBLIC vars are in the JS bundle

## Recommended Action

Implement Option A (remove entirely) or Option B (gate with __DEV__).

## Technical Details

**Affected files:**
- `mobile/src/screens/AuthScreen.tsx`

## Acceptance Criteria

- [ ] Skip button is not available in production builds
- [ ] Users must authenticate with biometrics or PIN to access the app
- [ ] Development builds can optionally retain skip functionality

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Authentication bypass is a critical security flaw |

## Resources

- File: `mobile/src/screens/AuthScreen.tsx:41-45`
