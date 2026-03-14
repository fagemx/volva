# E2: CLI Entry + Hono Routes + End-to-End

> **Layer**: L3
> **Dependencies**: E1（Thyra Client）, D2（Turn Handler）, D3（Settlement）
> **Blocks**: none（Phase 1 終點）
> **Output**: `src/cli.ts`, `src/routes/*.ts`, `src/index.ts`

---

## Bootstrap Instructions

```bash
cat docs/plan/CONTRACT.md            # API-01
cat docs/plan/VALIDATION.md          # GP-1, GP-2
cat src/conductor/turn-handler.ts    # D2 產出
cat src/settlement/router.ts         # D3 產出
cat src/thyra-client/client.ts       # E1 產出
bun run build
```

---

## Implementation

### src/cli.ts — CLI 入口

```typescript
import { createDb, initSchema } from './db';
import { LLMClient } from './llm/client';
import { CardManager } from './cards/card-manager';
import { handleTurn } from './conductor/turn-handler';
import { classifySettlement } from './settlement/router';
import { buildVillagePack } from './settlement/village-pack-builder';
import { ThyraClient } from './thyra-client/client';

async function runCli() {
  const db = createDb();
  initSchema(db);
  const llm = new LLMClient();
  const cardManager = new CardManager(db);
  const thyra = new ThyraClient();

  // 建立 conversation
  const conversationId = crypto.randomUUID();
  db.run("INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'explore')",
    [conversationId]);

  let phase: 'explore' | 'focus' | 'settle' = 'explore';

  console.log('Völva CLI — 輸入你的想法，輸入 q 離開\n');

  for await (const line of console) {
    const input = line.trim();
    if (input === 'q' || input === 'exit') break;
    if (!input) continue;

    const result = await handleTurn(llm, cardManager, conversationId, input, phase);
    phase = result.phase;

    console.log(`\n[${result.strategy}] ${result.reply}\n`);

    if (result.phase === 'settle' && result.intent.type === 'settle_signal') {
      // 觸發沉澱
      const card = cardManager.getLatest(conversationId);
      if (card) {
        const target = classifySettlement(card);
        if (target === 'village_pack') {
          const yaml = buildVillagePack(card.content);
          console.log('\n--- Village Pack YAML ---\n');
          console.log(yaml);
          console.log('\n套用到 Thyra? (y/n)');
          // ... 等待確認後呼叫 thyra.applyVillagePack(yaml)
        }
      }
    }
  }

  db.close();
}
```

### src/routes/ — Hono API routes

- `POST /api/conversations` — 建立新對話
- `POST /api/conversations/:id/messages` — 送出訊息（觸發 handleTurn）
- `GET /api/conversations/:id/card` — 查詢最新短卡
- `POST /api/conversations/:id/settle` — 觸發沉澱
- 統一 response format: `{ ok, data/error }` (CONTRACT API-01)

### src/index.ts

```typescript
import { Hono } from 'hono';
import { conversationRoutes } from './routes/conversations';
// ... mount routes

const app = new Hono();
app.route('/', conversationRoutes(...));
export default { port: 3460, fetch: app.fetch };
```

### End-to-end test

用 mock LLM + mock Thyra 跑完 GP-1 場景：
1. 建立 conversation
2. 送一輪 user message
3. 驗證 reply 存在、card version = 1、phase = explore

## Acceptance Criteria

```bash
bun run build
bun test
# CLI 可啟動（手動）
ANTHROPIC_API_KEY=test bun run src/cli.ts
```

### Phase 1 完成確認清單

- [ ] A1: Project Skeleton — `bun run build` 通過
- [ ] A2: DB Layer — 4 張表 + 基礎 schema
- [ ] B1: LLM Client — Anthropic SDK wrapper
- [ ] B2: Intent + Response — 結構化 LLM 呼叫
- [ ] C1: Card Schemas — WorldCard/WorkflowCard/TaskCard
- [ ] C2: Card Manager — CRUD + version + diff
- [ ] D1: State Machine — explore/focus/settle 轉換
- [ ] D2: Turn Handler — 完整的一輪對話處理
- [ ] D3: Settlement — router + Village Pack builder
- [ ] E1: Thyra Client — HTTP wrapper
- [ ] E2: CLI + Routes — 端到端可用

## Git Commit

```
feat: add CLI entry + Hono routes + end-to-end integration
```
