# D1: Conductor State Machine

> **Layer**: L2
> **Dependencies**: C1（Card Schemas — 讀 card 判斷轉換條件）
> **Blocks**: D2（Turn Handler）
> **Output**: `src/conductor/state-machine.ts` — checkTransition(), TransitionConditions

---

## Bootstrap Instructions

```bash
cat docs/VOLVA/02_INTERACTION_MODEL.md   # Conductor 狀態機章節
cat docs/plan/CONTRACT.md                # COND-01
cat src/schemas/card.ts                  # C1 產出
bun run build
```

---

## Implementation

三階段狀態機 + 明確的轉換條件：

```typescript
export type Phase = 'explore' | 'focus' | 'settle';

export interface TransitionResult {
  newPhase: Phase;
  reason: string | null;  // null = 未轉換
}

export function checkTransition(
  currentPhase: Phase,
  card: WorldCard,
  intentType: IntentType,
): TransitionResult {
  // EXPLORE → FOCUS
  if (currentPhase === 'explore') {
    if (card.confirmed.hard_rules.length > 0 && card.confirmed.must_have.length >= 3) {
      return { newPhase: 'focus', reason: 'hard_rule + must_have ≥ 3' };
    }
    if (intentType === 'set_boundary' && card.confirmed.must_have.length >= 2) {
      return { newPhase: 'focus', reason: 'boundary set + must_have ≥ 2' };
    }
  }

  // FOCUS → SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
  }

  // SETTLE → EXPLORE (new cycle)
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS → EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}
```

測試（CONTRACT COND-01 — 每個轉換都有明確條件測試）：
- explore → focus: hard_rule + must_have ≥ 3
- focus → settle: pending empty + confirm
- settle → explore: new_intent
- focus → explore: rollback on new_intent
- 不轉換：條件不滿足時維持原 phase

## Acceptance Criteria

```bash
bun run build
bun test src/conductor/state-machine.test.ts
# 確認每個轉換都有 if 條件
grep -n "newPhase:" src/conductor/state-machine.ts
```

## Git Commit

```
feat(conductor): add state machine with explicit transition conditions
```
