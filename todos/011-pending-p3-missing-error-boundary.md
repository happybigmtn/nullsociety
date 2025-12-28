---
status: completed
priority: p3
issue_id: "011"
tags: [code-review, architecture, mobile, react, error-handling]
dependencies: []
---

# Missing Error Boundary for Game Screens

## Problem Statement

There is no React Error Boundary wrapping game screens. If a game component throws during render (e.g., from malformed server data), the entire app crashes instead of showing a recoverable error state.

**Why it matters:** Users lose their session if any game has a rendering error; no graceful degradation.

## Findings

**Agent:** architecture-strategist
**Severity:** MEDIUM (P3)

**Location:** `mobile/App.tsx` and `mobile/src/navigation/RootNavigator.tsx`

No error boundaries found in the navigation structure:
```typescript
// Current: No error boundary
<GameStackNavigator />

// Should be:
<ErrorBoundary fallback={<GameErrorScreen />}>
  <GameStackNavigator />
</ErrorBoundary>
```

## Proposed Solutions

### Option A: Error Boundary per Screen (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Granular error isolation, individual game recovery
**Cons:** More boilerplate

```typescript
// src/components/GameErrorBoundary.tsx
class GameErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <GameErrorScreen onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
```

### Option B: Single App-Level Boundary
**Effort:** Small
**Risk:** Low
**Pros:** Simplest
**Cons:** Entire app resets on error

## Recommended Action

Implement Option A with error boundaries in GameScreen.tsx router.

## Technical Details

**Affected files:**
- `mobile/src/navigation/RootNavigator.tsx`
- `mobile/src/screens/GameScreen.tsx`
- Need to create: `mobile/src/components/GameErrorBoundary.tsx`

## Acceptance Criteria

- [ ] Error boundary catches game screen render errors
- [ ] Users can return to lobby from error state
- [ ] Error details logged for debugging
- [ ] App doesn't crash on game component errors

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Error boundaries prevent full app crashes |

## Resources

- React Error Boundaries: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
