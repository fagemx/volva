# Völva — 技術架構

## 技術棧

| 層 | 選擇 | 理由 |
|----|------|------|
| 語言 | TypeScript 5.x | 和 Thyra 一致，共用 Zod 設計語言 |
| Runtime | Bun（優先）/ Node 22+ | 同棧 |
| Web Framework | Hono | 輕量、TS-first、跨 runtime |
| 資料庫 | SQLite (bun:sqlite) → Postgres | session/card 狀態 |
| Schema | Zod | runtime validation + type inference |
| LLM | Claude API (@anthropic-ai/sdk) | structured output, streaming |
| 即時通訊 | SSE（Phase 1）→ WebSocket（按需） | Hono 原生支援 SSE |
| 前端 | React + Vite（Phase 2） | 三欄佈局 |
| 測試 | Vitest | 和 Thyra 一致 |

## 與 Thyra 的關鍵差異

| | Thyra | Völva |
|---|---|---|
| LLM 依賴 | 零 | 核心依賴 |
| 狀態性質 | 持久治理狀態 | 會話級暫態 |
| 用戶接觸 | API only | 直接面對用戶 |
| 變更頻率 | 慢（法律級） | 快（UX 迭代） |
| 通訊模式 | request-response | streaming (SSE) |

## 跨 Repo 通訊

```
Völva → Thyra：HTTP REST（操作治理層）
Völva → Karvi：不直接通訊（透過 Thyra 間接）
Völva → Edda：不直接通訊（透過 Thyra 間接）
```

原則：**Völva 只認識 Thyra。Karvi 和 Edda 對 Völva 是透明的。**

Schema 共享策略：
- Phase 0-1：直接複製 Thyra 的 Zod schema（Village Pack、API response）
- 之後如果痛了：抽 `@thyra/contracts` npm package

## 模組結構

```
volva/
├── src/
│   ├── conductor/               ← 對話導演核心
│   │   ├── state-machine.ts         ← 對話階段管理
│   │   ├── turn-handler.ts          ← 每輪對話處理
│   │   └── rhythm.ts                ← 節奏控制
│   │
│   ├── cards/                   ← 短卡系統
│   │   ├── schemas.ts               ← WorldCard, WorkflowCard, TaskCard
│   │   ├── card-manager.ts          ← CRUD + 版本追蹤
│   │   └── diff.ts                  ← 每輪更新 diff
│   │
│   ├── settlement/              ← 沉澱分流
│   │   ├── router.ts                ← 分流判斷邏輯
│   │   ├── village-pack-builder.ts  ← 短卡 → Village Pack YAML
│   │   └── task-builder.ts          ← 短卡 → Task Card
│   │
│   ├── llm/                     ← LLM 整合
│   │   ├── intent-parser.ts         ← 用戶話語 → structured intent
│   │   ├── proposal-gen.ts          ← 生成小提案
│   │   └── mirror.ts                ← 鏡像理解回覆
│   │
│   ├── thyra-client/            ← Thyra API client
│   │   ├── client.ts                ← HTTP client wrapper
│   │   └── schemas.ts               ← 複製的 response schemas
│   │
│   ├── routes/                  ← API routes
│   │   ├── conversations.ts         ← 對話 CRUD + 訊息
│   │   ├── cards.ts                 ← 短卡查詢
│   │   └── settlements.ts          ← 沉澱操作
│   │
│   ├── schemas/                 ← 共用 schema
│   │   ├── conversation.ts
│   │   ├── card.ts
│   │   ├── settlement.ts
│   │   └── message.ts
│   │
│   ├── db.ts                    ← createDb, initSchema
│   └── index.ts                 ← Hono app, mount routes
│
├── app/                         ← React 前端（Phase 2）
│   ├── chat/                        ← 聊天面板
│   ├── card-panel/                  ← 短卡面板
│   └── settlement-view/             ← 沉澱區
│
├── docs/                        ← 規劃文件
│   ├── 00_OVERVIEW.md
│   ├── 01_ARCHITECTURE.md
│   ├── 02_INTERACTION_MODEL.md
│   ├── 03_PHASES.md
│   └── walkthroughs/
│
└── tests/
```

## 層級依賴規則

```
db.ts + schemas/ 是共用基礎，所有模組可 import

conductor ← cards ← settlement
              ↑
llm ──────────┘

thyra-client 獨立，任何模組可呼叫

routes → conductor + cards + settlement（組裝層）
```

下層不得 import 上層。和 Thyra 同原則。

## 資料模型（概略）

### conversations

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | TEXT PK | 對話 ID |
| mode | TEXT | 'world_design' / 'world_operation' / 'task' |
| phase | TEXT | conductor 當前階段 |
| village_id | TEXT? | 關聯的 village（可選） |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### messages

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | TEXT PK | 訊息 ID |
| conversation_id | TEXT FK | 所屬對話 |
| role | TEXT | 'user' / 'assistant' / 'system' |
| content | TEXT | 訊息內容 |
| turn | INTEGER | 輪次編號 |
| created_at | TEXT | ISO timestamp |

### cards

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | TEXT PK | 短卡 ID |
| conversation_id | TEXT FK | 所屬對話 |
| type | TEXT | 'world' / 'workflow' / 'task' |
| version | INTEGER | 版本號（每輪更新 +1） |
| content | TEXT (JSON) | 結構化內容 |
| created_at | TEXT | ISO timestamp |

### settlements

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | TEXT PK | 沉澱記錄 ID |
| conversation_id | TEXT FK | 來源對話 |
| card_id | TEXT FK | 來源短卡 |
| target | TEXT | 'village_pack' / 'workflow' / 'task' |
| payload | TEXT (JSON) | 沉澱內容 |
| status | TEXT | 'draft' / 'confirmed' / 'applied' |
| thyra_response | TEXT (JSON)? | Thyra API 回應 |
| created_at | TEXT | ISO timestamp |
