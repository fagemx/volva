# Völva Phase 1 — Planning Pack

## Goal

Völva Phase 1 的最小可用後端：一個可以在 CLI 模式下對話、引導使用者收斂意圖、產出 Village Pack YAML 並呼叫 Thyra API 建立 village 的系統。

- **可理解（understandable）** 的 LLM intent parsing — 把使用者自然語言翻譯成結構化意圖
- **可追蹤（trackable）** 的短卡系統 — 每輪對話更新結構化摘要，帶版本追蹤
- **可收斂（convergeable）** 的對話導演 — explore → focus → settle 三階段狀態機
- **可沉澱（settleable）** 的分流路由 — 穩定的設定沉澱成 Village Pack，呼叫 Thyra API

## Dependency DAG

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
- A 是所有 Track 的前提（DB + schemas 必須先存在）
- B 和 C 同屬 L1，無互相依賴，可完全並行
- D 依賴 B（LLM 呼叫）和 C（短卡操作），是核心業務邏輯
- E 整合所有模組，加上 Thyra HTTP client 和 CLI 入口

## Track Summary

| Track | Name | Layer | Tasks | Dependencies | Status |
|-------|------|-------|-------|-------------|--------|
| A | Foundation | L0 | 2 | — | ☐ |
| B | LLM Layer | L1 | 2 | A | ☐ |
| C | Card System | L1 | 2 | A | ☐ |
| D | Conductor + Settlement | L2 | 3 | B, C | ☐ |
| E | Thyra Client + CLI | L3 | 2 | D | ☐ |

**Total: 5 Tracks, 11 Tasks**

## Parallel Execution Timeline

```
Batch 1（無依賴）：
  Agent 1 → Track A: A1 → A2

Batch 2（依賴 A，可並行）：
  Agent 1 → Track B: B1 → B2
  Agent 2 → Track C: C1 → C2

Batch 3（依賴 B + C）：
  Agent 1 → Track D: D1 → D2 → D3

Batch 4（依賴 D）：
  Agent 1 → Track E: E1 → E2
```

## Progress Tracking

### Batch 1
- [ ] Track A: Foundation
  - [ ] A1: Project Skeleton
  - [ ] A2: DB Layer + Schema

### Batch 2（可並行）
- [ ] Track B: LLM Layer
  - [ ] B1: LLM Client Wrapper
  - [ ] B2: Intent Parser + Response Generator
- [ ] Track C: Card System
  - [ ] C1: Card Schemas (Zod)
  - [ ] C2: Card Manager

### Batch 3
- [ ] Track D: Conductor + Settlement
  - [ ] D1: Conductor State Machine
  - [ ] D2: Turn Handler
  - [ ] D3: Settlement Router + Village Pack Builder

### Batch 4
- [ ] Track E: Thyra Client + CLI
  - [ ] E1: Thyra HTTP Client
  - [ ] E2: CLI Entry + Routes + End-to-End

## Module Map

| Module | Introduced | Responsibility |
|--------|-----------|----------------|
| `src/db.ts` | A2 | createDb, initSchema (conversations, messages, cards, settlements) |
| `src/schemas/` | A2, C1 | Zod schemas for all domain types |
| `src/llm/` | B1, B2 | Claude API client, intent parser, response generator |
| `src/cards/` | C1, C2 | Card schemas, CardManager CRUD + versioning + diff |
| `src/conductor/` | D1, D2 | State machine, turn handler, rhythm control |
| `src/settlement/` | D3 | Settlement router, village pack builder |
| `src/thyra-client/` | E1 | HTTP client wrapper for Thyra API |
| `src/routes/` | E2 | Hono API routes |
| `src/cli.ts` | E2 | CLI entry point (stdin/stdout conversation) |
| `src/index.ts` | E2 | Hono app, mount routes, start server |

## Data File Layout

```
volva/
  src/
    db.ts                          ← createDb, initSchema
    schemas/
      conversation.ts              ← ConversationSchema, MessageSchema
      card.ts                      ← WorldCardSchema, WorkflowCardSchema, TaskCardSchema
      settlement.ts                ← SettlementSchema, SettlementTarget enum
      intent.ts                    ← IntentSchema (LLM output format)
    llm/
      client.ts                    ← LLMClient (Anthropic SDK wrapper)
      intent-parser.ts             ← parseIntent() — user message → structured intent
      response-gen.ts              ← generateReply() — strategy + card → response text
      prompts.ts                   ← System prompts for each LLM call
    cards/
      card-manager.ts              ← CardManager class (CRUD + version + diff)
    conductor/
      state-machine.ts             ← ConductorPhase, checkTransition()
      turn-handler.ts              ← handleTurn() — orchestrate one conversation turn
      rhythm.ts                    ← pickStrategy() — decide mirror/probe/propose/settle
    settlement/
      router.ts                    ← classifySettlement() — card → target type
      village-pack-builder.ts      ← buildVillagePack() — WorldCard → YAML
    thyra-client/
      client.ts                    ← ThyraClient (HTTP wrapper)
      schemas.ts                   ← Copied Thyra response schemas
    routes/
      conversations.ts             ← conversation CRUD + message handling
      cards.ts                     ← card queries
      settlements.ts               ← settlement operations
    cli.ts                         ← CLI entry (stdin/stdout)
    index.ts                       ← Hono app
```
