# C1: Card Schemas

> **Layer**: L1
> **Dependencies**: A2（DB Layer）
> **Blocks**: C2（Card Manager）, D1（State Machine — 讀 card 判斷轉換）
> **Output**: `src/schemas/card.ts` — WorldCardSchema, WorkflowCardSchema, TaskCardSchema

---

## Bootstrap Instructions

```bash
cat docs/VOLVA/02_INTERACTION_MODEL.md   # 短卡 schema 定義
cat src/schemas/conversation.ts          # A2 產出
bun run build
```

---

## Implementation

完整 schema 定義見 `docs/VOLVA/02_INTERACTION_MODEL.md`「短卡 Schema」章節。

關鍵 Zod types：

```typescript
// src/schemas/card.ts
import { z } from 'zod';

export const CardType = z.enum(['world', 'workflow', 'task']);

export const WorldCardSchema = z.object({
  goal: z.string().nullable(),
  confirmed: z.object({
    hard_rules: z.array(z.string()),
    soft_rules: z.array(z.string()),
    must_have: z.array(z.string()),
    success_criteria: z.array(z.string()),
  }),
  pending: z.array(z.object({
    question: z.string(),
    context: z.string(),
  })),
  chief_draft: z.object({
    name: z.string().nullable(),
    role: z.string().nullable(),
    style: z.string().nullable(),
  }).nullable(),
  budget_draft: z.object({
    per_action: z.number().nullable(),
    per_day: z.number().nullable(),
  }).nullable(),
  current_proposal: z.string().nullable(),
  version: z.number().int().min(1),
});

// WorkflowCardSchema, TaskCardSchema 同理
```

測試：schema parse 正確、reject invalid、version 必須 ≥ 1。

## Acceptance Criteria

```bash
bun run build
bun test src/schemas/card.test.ts
```

## Git Commit

```
feat(schema): add WorldCard, WorkflowCard, TaskCard Zod schemas
```
