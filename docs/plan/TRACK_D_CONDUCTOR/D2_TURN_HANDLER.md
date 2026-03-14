# D2: Turn Handler

> **Layer**: L2
> **Dependencies**: D1（State Machine）, B2（Intent Parser + Response Gen）, C2（Card Manager）
> **Blocks**: D3（Settlement）, E2（CLI + Routes）
> **Output**: `src/conductor/turn-handler.ts` — handleTurn(); `src/conductor/rhythm.ts` — pickStrategy()

---

## Bootstrap Instructions

```bash
cat docs/plan/CONTRACT.md                    # COND-01, COND-02
cat docs/VOLVA/02_INTERACTION_MODEL.md       # 每輪處理流程、回覆策略表
cat src/conductor/state-machine.ts           # D1 產出
cat src/llm/intent-parser.ts                 # B2 產出
cat src/llm/response-gen.ts                  # B2 產出
cat src/cards/card-manager.ts                # C2 產出
bun run build
```

---

## Final Result

這是 Völva 的核心 — 把所有模組串接成一輪完整的對話處理。

```
User message
  → LLM #1: parseIntent()
  → Code: cardManager.update()
  → Code: checkTransition()
  → Code: pickStrategy()
  → LLM #2: generateReply()
  → Return: { reply, card, phase, diff }
```

CONTRACT COND-02：每輪最多 2 次 LLM 呼叫。

## Implementation

### src/conductor/rhythm.ts — pickStrategy()

```typescript
import type { Phase } from './state-machine';
import type { IntentType } from '../schemas/intent';
import type { Strategy } from '../llm/response-gen';

export function pickStrategy(phase: Phase, intentType: IntentType, hasPending: boolean): Strategy {
  if (phase === 'explore') {
    if (intentType === 'new_intent') return 'mirror';
    if (intentType === 'add_info') return 'probe';
    if (intentType === 'set_boundary') return 'mirror';  // 確認聽懂了
    return 'probe';
  }

  if (phase === 'focus') {
    if (intentType === 'confirm' && !hasPending) return 'settle';
    if (intentType === 'confirm') return 'propose';      // 還有待確認的
    if (intentType === 'modify') return 'confirm';        // 修改後重新確認
    return 'propose';
  }

  if (phase === 'settle') {
    if (intentType === 'settle_signal') return 'settle';
    if (intentType === 'confirm') return 'settle';
    return 'confirm';  // 還在猶豫，再確認一次
  }

  return 'probe';
}
```

### src/conductor/turn-handler.ts — handleTurn()

```typescript
import type { Database } from 'bun:sqlite';
import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import { checkTransition, type Phase } from './state-machine';
import { pickStrategy } from './rhythm';
import type { WorldCard } from '../schemas/card';
import type { Intent } from '../schemas/intent';

export interface TurnResult {
  reply: string;
  intent: Intent;
  phase: Phase;
  phaseChanged: boolean;
  strategy: string;
  cardVersion: number;
}

export async function handleTurn(
  llm: LLMClient,
  cardManager: CardManager,
  conversationId: string,
  userMessage: string,
  currentPhase: Phase,
): Promise<TurnResult> {
  // 1. 取得現有短卡
  const currentCard = cardManager.getLatest(conversationId);
  const cardSnapshot = currentCard ? JSON.stringify(currentCard.content, null, 2) : '{}';

  // 2. LLM #1: 理解意圖
  const intent = await parseIntent(llm, userMessage, cardSnapshot);

  // 3. 根據意圖更新短卡（程式碼邏輯，不呼叫 LLM）
  const updatedContent = applyIntentToCard(
    currentCard?.content as WorldCard ?? createEmptyWorldCard(),
    intent,
  );
  const { card } = cardManager.update(
    currentCard?.id ?? cardManager.create(conversationId, 'world', updatedContent).id,
    updatedContent,
  );

  // 4. 檢查狀態轉換
  const transition = checkTransition(currentPhase, updatedContent as WorldCard, intent.type);

  // 5. 選擇回覆策略
  const strategy = pickStrategy(
    transition.newPhase,
    intent.type,
    (updatedContent as WorldCard).pending.length > 0,
  );

  // 6. LLM #2: 生成回覆
  const reply = await generateReply(llm, strategy, JSON.stringify(updatedContent, null, 2), userMessage);

  return {
    reply,
    intent,
    phase: transition.newPhase,
    phaseChanged: transition.reason !== null,
    strategy,
    cardVersion: card.version,
  };
}

/** 根據 intent 更新 WorldCard（純程式碼，不呼叫 LLM） */
function applyIntentToCard(card: WorldCard, intent: Intent): WorldCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) updated.goal = intent.summary;
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [, value] of Object.entries(intent.entities)) {
          if (!updated.confirmed.must_have.includes(value)) {
            updated.confirmed.must_have.push(value);
          }
        }
      }
      break;
    case 'set_boundary':
      if (intent.enforcement === 'hard') {
        updated.confirmed.hard_rules.push(intent.summary);
      } else {
        updated.confirmed.soft_rules.push(intent.summary);
      }
      break;
    case 'add_constraint':
      updated.confirmed.soft_rules.push(intent.summary);
      break;
    case 'style_preference':
      if (!updated.chief_draft) {
        updated.chief_draft = { name: null, role: null, style: null };
      }
      updated.chief_draft.style = intent.summary;
      break;
    case 'confirm':
    case 'settle_signal':
      // 確認不改 card 內容
      break;
  }

  updated.version += 1;
  return updated;
}

function createEmptyWorldCard(): WorldCard {
  return {
    goal: null,
    confirmed: { hard_rules: [], soft_rules: [], must_have: [], success_criteria: [] },
    pending: [],
    chief_draft: null,
    budget_draft: null,
    current_proposal: null,
    version: 0,
  };
}
```

### Tests

```typescript
// src/conductor/turn-handler.test.ts
describe('handleTurn', () => {
  it('first turn: creates card + stays explore');
  it('set_boundary: adds hard_rule + may transition to focus');
  it('confirm with empty pending: transitions to settle');
  it('applyIntentToCard: set_boundary adds to hard_rules');
  it('applyIntentToCard: style_preference sets chief_draft');
  it('max 2 LLM calls per turn (mock count)');
});
```

## Acceptance Criteria

```bash
bun run build
bun test src/conductor/
# 確認每輪最多 2 次 LLM 呼叫
grep -c "await.*llm\.\|await.*parse\|await.*generate" src/conductor/turn-handler.ts  # Expected: 2
```

## Git Commit

```
feat(conductor): add turn handler orchestrating intent → card → strategy → reply
```
