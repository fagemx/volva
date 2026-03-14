# Völva Phase 1 — Track 拆解

## 層級定義

- **L0 基礎設施**：Project Init + DB + Schemas（骨架 + 資料層 + 型別定義）
- **L1 能力層**：LLM Layer + Card System（兩個獨立的核心能力模組）
- **L2 業務層**：Conductor + Settlement（狀態機 + 沉澱分流，整合 L1 兩個能力）
- **L3 整合層**：Thyra Client + CLI + Routes（外部橋接 + 使用者入口 + API）

## DAG

```
L0 基礎設施
  [A] Foundation: Project Init + DB + Schemas
   │
   ├────────────────┐
   ▼                ▼
L1 能力層
  [B] LLM Layer    [C] Card System
   │                │
   ├────────────────┤
   ▼                ▼
L2 業務層
  [D] Conductor + Settlement
   │
   ▼
L3 整合層
  [E] Thyra Client + CLI + Integration
```

**關鍵依賴說明**：
- A 是所有 Track 的前提（DB schema + Zod types 必須先存在）
- B（LLM）和 C（Card）同屬 L1，無互相依賴，可完全並行
- D 依賴 B（handleTurn 需呼叫 intent parser + response gen）和 C（handleTurn 需更新短卡）
- E 依賴 D（CLI 和 routes 需呼叫 conductor 的 handleTurn）

## Track → Step 對照

### A: Foundation（L0）
```
TRACK_A_FOUNDATION/
  A1_PROJECT_SKELETON.md       ← package.json + tsconfig + deps + folder structure
  A2_DB_LAYER.md               ← SQLite schema + createDb + initSchema + base Zod schemas
```

### B: LLM Layer（L1）
```
TRACK_B_LLM/
  B1_LLM_CLIENT.md             ← Anthropic SDK wrapper + streaming + error handling
  B2_INTENT_AND_RESPONSE.md    ← Intent parser + response generator + prompt templates
```

### C: Card System（L1）
```
TRACK_C_CARDS/
  C1_CARD_SCHEMAS.md            ← WorldCard + WorkflowCard + TaskCard Zod schemas
  C2_CARD_MANAGER.md            ← CardManager class (CRUD + version + diff)
```

### D: Conductor + Settlement（L2）
```
TRACK_D_CONDUCTOR/
  D1_STATE_MACHINE.md           ← ConductorPhase enum + checkTransition() + transition conditions
  D2_TURN_HANDLER.md            ← handleTurn() orchestration + pickStrategy()
  D3_SETTLEMENT.md              ← Settlement router + Village Pack builder + TaskCard builder
```

### E: Thyra Client + CLI（L3）
```
TRACK_E_INTEGRATION/
  E1_THYRA_CLIENT.md            ← ThyraClient HTTP wrapper + copied response schemas
  E2_CLI_AND_ROUTES.md          ← CLI stdin/stdout + Hono routes + end-to-end integration
```

## Module Import 路徑

```
src/
  db.ts                          ← createDb, initSchema（A2）
  schemas/
    conversation.ts              ← ConversationSchema, MessageSchema（A2）
    card.ts                      ← WorldCardSchema, WorkflowCardSchema, TaskCardSchema（C1）
    settlement.ts                ← SettlementSchema, SettlementTarget（D3）
    intent.ts                    ← IntentSchema, IntentType enum（B2）
  llm/
    client.ts                    ← LLMClient class（B1）
    intent-parser.ts             ← parseIntent()（B2）
    response-gen.ts              ← generateReply()（B2）
    prompts.ts                   ← INTENT_SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT（B2）
  cards/
    card-manager.ts              ← CardManager class（C2）
  conductor/
    state-machine.ts             ← ConductorPhase, checkTransition(), TransitionConditions（D1）
    turn-handler.ts              ← handleTurn(), TurnResult（D2）
    rhythm.ts                    ← pickStrategy(), Strategy enum（D2）
  settlement/
    router.ts                    ← classifySettlement(), SettlementTarget（D3）
    village-pack-builder.ts      ← buildVillagePack(), WorldCard → YAML string（D3）
  thyra-client/
    client.ts                    ← ThyraClient class（E1）
    schemas.ts                   ← Thyra API response Zod schemas（E1）
  routes/
    conversations.ts             ← conversationRoutes（E2）
    cards.ts                     ← cardRoutes（E2）
    settlements.ts               ← settlementRoutes（E2）
  cli.ts                         ← CLI entry, runCli()（E2）
  index.ts                       ← Hono app, mount routes（E2）
```

## 跨模組依賴圖（import 方向）

```
db.ts + schemas/ ← 共用基礎，所有模組可 import

llm/client ← llm/intent-parser + llm/response-gen

cards/card-manager ← schemas/card

conductor/state-machine ← schemas/card（檢查 card 狀態做轉換判斷）
conductor/turn-handler ← llm/intent-parser + llm/response-gen + cards/card-manager + conductor/state-machine

settlement/router ← schemas/card + conductor/state-machine
settlement/village-pack-builder ← schemas/card

thyra-client/ ← 獨立（只依賴自己的 schemas）

routes/ → conductor/turn-handler + cards/card-manager + settlement/（組裝層）
cli.ts → conductor/turn-handler + db（入口層）
```

**規則**：下層不得 import 上層。`db.ts` 和 `schemas/` 是共用基礎，所有模組可 import。

---

## Track Details

### Track A: Foundation

**Layer**: L0
**Goal**: 建立 Völva 的專案骨架和資料層 — package.json、TypeScript 配置、SQLite schema、基礎 Zod types

**Input**:
- docs/VOLVA/01_ARCHITECTURE.md（技術棧、資料模型）
- docs/VOLVA/02_INTERACTION_MODEL.md（conversation/message/card/settlement 結構）

**Output**:
- 可編譯的 TypeScript 專案
- SQLite schema（conversations, messages, cards, settlements 四張表）
- `createDb()` + `initSchema()`
- ConversationSchema, MessageSchema Zod types
- `bun run build` zero errors

**Dependencies**:
- blocks: B, C, D, E
- blocked-by: none（可立即開始）

**DoD**:
- [ ] `bun run build` zero errors
- [ ] `bun test` baseline pass（至少 DB schema 測試）
- [ ] SQLite `:memory:` 建立四張表成功
- [ ] Zod schema 可正常 parse 合法輸入

**Smoke Test**:
```bash
bun run build
bun test src/db.test.ts
```

**Task Count**: 2

---

### Track B: LLM Layer

**Layer**: L1
**Goal**: 封裝 Claude API 呼叫，提供結構化的 intent parsing 和 response generation

**Input**:
- Track A 產出（db.ts, schemas/）
- docs/VOLVA/walkthroughs/W1_NEW_VILLAGE.md（intent parsing 範例）
- ANTHROPIC_API_KEY 環境變數

**Output**:
- `LLMClient` class（Anthropic SDK wrapper）
- `parseIntent()` — user message + card → IntentSchema JSON
- `generateReply()` — strategy + card + history → response text
- 所有 LLM 輸出通過 Zod safeParse 驗證

**Dependencies**:
- blocks: D
- blocked-by: A

**DoD**:
- [ ] `bun run build` zero errors
- [ ] LLMClient 可建立連線（unit test with mock）
- [ ] parseIntent 回傳 IntentSchema 合法 JSON
- [ ] generateReply 回傳自然語言字串
- [ ] LLM 呼叫失敗時 graceful fallback（不 crash）

**Smoke Test**:
```bash
bun run build
bun test src/llm/
```

**Task Count**: 2

---

### Track C: Card System

**Layer**: L1
**Goal**: 實作短卡系統 — Zod schema + CRUD + 版本追蹤 + diff 計算

**Input**:
- Track A 產出（db.ts）
- docs/VOLVA/02_INTERACTION_MODEL.md（WorldCard / WorkflowCard / TaskCard schema 定義）

**Output**:
- WorldCardSchema, WorkflowCardSchema, TaskCardSchema（Zod）
- `CardManager` class（create / update / get / diff）
- 每次 update 遞增 version，記錄 diff

**Dependencies**:
- blocks: D
- blocked-by: A

**DoD**:
- [ ] `bun run build` zero errors
- [ ] WorldCard 可建立、更新、查詢
- [ ] 每次更新 version +1
- [ ] diff 函數正確計算欄位變更
- [ ] 測試覆蓋：建立、更新、diff、edge cases

**Smoke Test**:
```bash
bun run build
bun test src/cards/
```

**Task Count**: 2

---

### Track D: Conductor + Settlement

**Layer**: L2
**Goal**: 實作對話導演狀態機和沉澱分流器 — 把 LLM 和 Card 兩個能力串成完整的對話流程

**Input**:
- Track B 產出（parseIntent, generateReply）
- Track C 產出（CardManager）
- docs/VOLVA/02_INTERACTION_MODEL.md（conductor 狀態機、分流規則）
- docs/VOLVA/walkthroughs/W1-W4（每輪對話的 phase transition 範例）

**Output**:
- `ConductorPhase` enum + `checkTransition()` — 狀態轉換引擎
- `handleTurn()` — 串接 intent parse → card update → strategy → response gen
- `pickStrategy()` — 根據 phase 和 card 狀態選擇回覆策略
- `classifySettlement()` — 判斷沉澱目標
- `buildVillagePack()` — WorldCard → Village Pack YAML

**Dependencies**:
- blocks: E
- blocked-by: B, C

**DoD**:
- [ ] `bun run build` zero errors
- [ ] 狀態轉換：explore → focus 在 hard_rule 出現時觸發
- [ ] 狀態轉換：focus → settle 在 pending 清空時觸發
- [ ] handleTurn 正確串接：parse → update → strategy → reply
- [ ] Settlement router 正確分流：有 hard_rules → VILLAGE_PACK
- [ ] buildVillagePack 產出合法 YAML
- [ ] 測試：狀態轉換、turn 處理、settlement routing

**Smoke Test**:
```bash
bun run build
bun test src/conductor/ src/settlement/
```

**Task Count**: 3

---

### Track E: Thyra Client + CLI + Integration

**Layer**: L3
**Goal**: 連接 Thyra API 並提供 CLI 入口，完成端到端的對話 → 沉澱 → 建立 village 流程

**Input**:
- Track D 產出（handleTurn, settlement router）
- Thyra API 可用（localhost:3462）
- docs/VOLVA/walkthroughs/W1_NEW_VILLAGE.md（完整場景）

**Output**:
- `ThyraClient` class — HTTP wrapper for Thyra API
- CLI 模式 — stdin/stdout 逐輪對話
- Hono routes — conversations, cards, settlements
- 端到端測試：CLI 完成 W1 場景

**Dependencies**:
- blocks: none（Phase 1 終點）
- blocked-by: D

**DoD**:
- [ ] `bun run build` zero errors
- [ ] ThyraClient 可呼叫 Thyra API（mock 測試）
- [ ] CLI 可啟動、接受輸入、回傳回覆
- [ ] Hono routes 回傳正確的 `{ ok, data }` 格式
- [ ] 端到端：CLI 模式下完成 W1 場景（mock LLM + mock Thyra）

**Smoke Test**:
```bash
bun run build
bun test
THYRA_URL=http://localhost:3462 bun run src/cli.ts
```

**Task Count**: 2
