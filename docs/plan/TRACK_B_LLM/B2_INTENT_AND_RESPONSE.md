# B2: Intent Parser + Response Generator

> **Layer**: L1
> **Dependencies**: B1（LLM Client）, A2（DB Layer — schemas）
> **Blocks**: D2（Turn Handler）
> **Output**: `src/llm/intent-parser.ts`, `src/llm/response-gen.ts`, `src/llm/prompts.ts`, `src/schemas/intent.ts`

---

## Bootstrap Instructions

```bash
cat docs/plan/CONTRACT.md                    # LLM-01, LLM-02, COND-02
cat docs/VOLVA/02_INTERACTION_MODEL.md       # 每輪處理流程、回覆策略
cat docs/VOLVA/walkthroughs/W1_NEW_VILLAGE.md  # intent parsing 範例
cat src/llm/client.ts                        # B1 產出
bun run build
```

---

## Final Result

- `src/schemas/intent.ts`: IntentType enum + IntentSchema (Zod)
- `src/llm/prompts.ts`: INTENT_SYSTEM_PROMPT + REPLY_SYSTEM_PROMPT
- `src/llm/intent-parser.ts`: parseIntent() — user message + card → Intent
- `src/llm/response-gen.ts`: generateReply() — strategy + card + context → reply string
- 所有 LLM 輸出通過 Zod safeParse (CONTRACT LLM-01)
- LLM 失敗時有 fallback (CONTRACT LLM-02)

## Implementation Steps

### Step 1: src/schemas/intent.ts

從 W1 walkthrough 萃取出的 intent 類型：

```typescript
import { z } from 'zod';

export const IntentType = z.enum([
  'new_intent',       // 全新的意圖表達（「我想做一個客服」）
  'add_info',         // 補充資訊（「主要是產品介紹和庫存查詢」）
  'set_boundary',     // 設定邊界/規則（「退款一定轉人工」）
  'add_constraint',   // 增加約束（「每天不超過 10 筆」）
  'style_preference', // 風格偏好（「親切但不隨便」）
  'confirm',          // 確認/同意（「可以」「好」）
  'modify',           // 修改之前的決定（「其實我想改成...」）
  'settle_signal',    // 沉澱信號（「生成吧」「套用」）
  'question',         // 反問系統（「這樣會怎樣？」）
  'off_topic',        // 離題
]);
export type IntentType = z.infer<typeof IntentType>;

export const IntentSchema = z.object({
  type: IntentType,
  summary: z.string(),                        // 一句話摘要
  entities: z.record(z.string()).optional(),   // 萃取的實體 (key-value)
  enforcement: z.enum(['hard', 'soft']).optional(), // 規則嚴格程度
  signals: z.array(z.string()).optional(),     // 關鍵詞信號
});
export type Intent = z.infer<typeof IntentSchema>;
```

### Step 2: src/llm/prompts.ts

```typescript
export const INTENT_SYSTEM_PROMPT = `你是一個意圖理解專家。分析使用者的話語，提取結構化意圖。

你必須回傳有效的 JSON，格式如下：
{
  "type": "new_intent|add_info|set_boundary|add_constraint|style_preference|confirm|modify|settle_signal|question|off_topic",
  "summary": "一句話摘要使用者的意圖",
  "entities": { "key": "value" },  // 可選：萃取的實體
  "enforcement": "hard|soft",      // 可選：規則嚴格程度（僅 set_boundary/add_constraint 時）
  "signals": ["keyword1"]          // 可選：關鍵情緒或主題信號
}

重要規則：
- set_boundary：使用者明確說「一定要」「不能」「必須」→ enforcement: "hard"
- set_boundary：使用者說「最好」「盡量」「建議」→ enforcement: "soft"
- confirm：使用者說「好」「可以」「沒問題」「OK」
- settle_signal：使用者說「生成」「套用」「建立」「開始」
- 只回傳 JSON，不要加任何其他文字`;

export function buildReplyPrompt(strategy: string, cardSnapshot: string): string {
  return `你是 Völva，一個友善的對話導演。你的任務是引導使用者逐步收斂想法。

當前策略：${strategy}

策略說明：
- mirror：重述使用者的話確認理解，不加新東西
- probe：問一個小問題，幫助使用者想更清楚（最多問 1 個問題）
- propose：提出一個具體的小提案，讓使用者確認或修改
- confirm：摘要目前已確認的內容，問要不要繼續
- settle：展示最終摘要，問要不要生成/套用
- redirect：溫和地引導回主題

當前短卡狀態：
${cardSnapshot}

重要規則：
- 用繁體中文回覆
- 語氣親切自然，不要太正式
- 不要一次問太多問題（最多 1 個）
- 不要主動提到「短卡」「schema」「Village Pack」等技術術語
- 簡短回覆，不超過 3 句話`;
}
```

### Step 3: src/llm/intent-parser.ts

```typescript
import type { LLMClient } from './client';
import { IntentSchema, type Intent } from '../schemas/intent';
import { INTENT_SYSTEM_PROMPT } from './prompts';

export async function parseIntent(
  llm: LLMClient,
  userMessage: string,
  cardSnapshot: string,
): Promise<Intent> {
  const result = await llm.generateStructured({
    system: INTENT_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `短卡現狀：\n${cardSnapshot}\n\n使用者說：${userMessage}` },
    ],
    schema: IntentSchema,
    schemaDescription: 'Intent object with type, summary, optional entities/enforcement/signals',
  });

  if (result.ok) return result.data;

  // Fallback: 無法 parse 時回傳安全的 off_topic
  console.warn('[parseIntent] fallback:', result.error);
  return { type: 'off_topic', summary: userMessage };
}
```

### Step 4: src/llm/response-gen.ts

```typescript
import type { LLMClient } from './client';
import { buildReplyPrompt } from './prompts';

export type Strategy = 'mirror' | 'probe' | 'propose' | 'confirm' | 'settle' | 'redirect';

export async function generateReply(
  llm: LLMClient,
  strategy: Strategy,
  cardSnapshot: string,
  userMessage: string,
): Promise<string> {
  const system = buildReplyPrompt(strategy, cardSnapshot);

  const reply = await llm.generateText({
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 500,
  });

  return reply;
}
```

### Step 5: Tests

```typescript
// src/llm/intent-parser.test.ts
import { describe, it, expect } from 'vitest';
import { IntentSchema } from '../schemas/intent';

describe('IntentSchema', () => {
  it('accepts valid new_intent', () => {
    const result = IntentSchema.safeParse({
      type: 'new_intent',
      summary: '使用者想做自動化客服',
      entities: { domain: 'customer_service' },
      signals: ['automation'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts set_boundary with enforcement', () => {
    const result = IntentSchema.safeParse({
      type: 'set_boundary',
      summary: '退款必須轉人工',
      enforcement: 'hard',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = IntentSchema.safeParse({
      type: 'invalid_type',
      summary: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('accepts minimal intent (type + summary only)', () => {
    const result = IntentSchema.safeParse({
      type: 'confirm',
      summary: '好',
    });
    expect(result.success).toBe(true);
  });
});
```

## Acceptance Criteria

```bash
bun run build
bun test src/llm/ src/schemas/intent.test.ts
grep -r "safeParse\|generateStructured" src/llm/intent-parser.ts  # 確認有 Zod 驗證
```

## Git Commit

```
feat(llm): add intent parser + response generator with structured prompts
```
