---
status: completed
priority: p3
issue_id: "013"
tags: [code-review, simplicity, mobile, react, duplication]
dependencies: []
---

# GameLayout Pattern Duplicated Across 10 Screens

## Problem Statement

Each game screen repeats the same layout pattern: `<SafeAreaView>` + `<GameHeader>` + main content + `<ChipSelector>` + `<PrimaryButton>`. This is ~30-40 lines of identical structure per screen.

**Why it matters:** ~300-400 LOC of duplication; styling changes require updating 10 files.

## Findings

**Agent:** code-simplicity-reviewer
**Severity:** MEDIUM (P3)

**Location:** All 10 game screens in `mobile/src/screens/games/`

Repeated pattern:
```typescript
// Every screen has this structure:
<SafeAreaView style={styles.container}>
  <GameHeader
    title="Game Name"
    balance={balance}
    onBack={handleBack}
  />

  {/* Game-specific content */}

  <View style={styles.controls}>
    <ChipSelector
      selectedChip={selectedChip}
      onChipSelect={setSelectedChip}
    />
    <PrimaryButton
      label={gamePhase === 'betting' ? 'DEAL' : 'CONTINUE'}
      onPress={handleAction}
    />
  </View>
</SafeAreaView>
```

## Proposed Solutions

### Option A: GameLayout Component (Recommended)
**Effort:** Medium
**Risk:** Low
**Pros:** DRY, consistent styling, easy to modify
**Cons:** Requires refactoring 10 screens

```typescript
// src/components/GameLayout.tsx
interface GameLayoutProps {
  title: string;
  balance: number;
  selectedChip: number;
  onChipSelect: (value: number) => void;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  children: React.ReactNode;
}

export function GameLayout({
  title,
  balance,
  selectedChip,
  onChipSelect,
  actionLabel,
  onAction,
  actionDisabled,
  children
}: GameLayoutProps) {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <GameHeader
        title={title}
        balance={balance}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.content}>
        {children}
      </View>

      <View style={styles.controls}>
        <ChipSelector
          selectedChip={selectedChip}
          onChipSelect={onChipSelect}
        />
        <PrimaryButton
          label={actionLabel}
          onPress={onAction}
          disabled={actionDisabled}
        />
      </View>
    </SafeAreaView>
  );
}
```

## Recommended Action

Create GameLayout component and refactor screens incrementally.

## Technical Details

**Affected files:**
- Need to create: `mobile/src/components/GameLayout.tsx`
- All 10 game screens in `mobile/src/screens/games/`

**Estimated savings:** ~300-400 LOC removed

## Acceptance Criteria

- [ ] GameLayout component created with props for customization
- [ ] All 10 game screens refactored to use GameLayout
- [ ] No duplicate SafeAreaView/Header/Controls patterns
- [ ] Styling changes only need GameLayout.tsx update

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Extract shared layouts to reduce duplication |

## Resources

- Affected screens: `mobile/src/screens/games/*.tsx`
