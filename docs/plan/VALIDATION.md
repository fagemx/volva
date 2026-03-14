# Validation Plan

## Track Acceptance Criteria

### Track A: Foundation

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| DB schema | 4 tables created in :memory: | `bun test src/db.test.ts` |
| Conversations | table with id, mode, phase, village_id, created_at, updated_at | SQL schema check |
| Messages | table with id, conversation_id, role, content, turn, created_at | SQL schema check |
| Cards | table with id, conversation_id, type, version, content (JSON), created_at | SQL schema check |
| Settlements | table with id, conversation_id, card_id, target, payload, status, created_at | SQL schema check |

### Track B: LLM Layer

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| LLMClient | Anthropic SDK wrapper with error handling | `bun test src/llm/client.test.ts` |
| Intent parser | Returns IntentSchema-valid JSON | `bun test src/llm/intent-parser.test.ts` |
| Response gen | Returns string given strategy + card | `bun test src/llm/response-gen.test.ts` |
| Graceful failure | LLM timeout/error → fallback, no crash | Error path tests |
| Structured output | Every LLM call passes Zod safeParse | Code review |

### Track C: Card System

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| WorldCard schema | Zod validates correct structure | `bun test src/schemas/card.test.ts` |
| CardManager create | Returns card with version=1 | Unit test |
| CardManager update | version increments, content changes | Unit test |
| CardManager diff | Returns changed fields between versions | Unit test |
| DB persistence | Cards survive DB round-trip (JSON serialize/deserialize) | Integration test |

### Track D: Conductor + Settlement

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| State machine | explore → focus when hard_rule appears + must_have ≥ 3 | `bun test src/conductor/state-machine.test.ts` |
| State machine | focus → settle when pending empty + user confirms | State machine test |
| State machine | settle → explore on new topic | State machine test |
| Turn handler | parseIntent → card update → pickStrategy → generateReply | `bun test src/conductor/turn-handler.test.ts` |
| Strategy | EXPLORE phase → mirror/probe strategy | Strategy test |
| Strategy | FOCUS phase → propose/confirm strategy | Strategy test |
| Settlement router | has hard_rules + chief_draft → VILLAGE_PACK | `bun test src/settlement/router.test.ts` |
| Village Pack builder | WorldCard → valid YAML string | Builder test |

### Track E: Thyra Client + CLI

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| ThyraClient | Can POST to Thyra API (mock) | `bun test src/thyra-client/client.test.ts` |
| CLI start | stdin prompt appears | Manual test |
| CLI turn | User input → assistant response printed | Manual test |
| Routes | POST /api/conversations returns { ok, data } | `bun test src/routes/` |
| E2E | Full W1 scenario completes (mock LLM + mock Thyra) | Integration test |

---

## Golden Path Scenarios

### GP-1: Minimum Closed Loop（Track A + B + C + D）

**Description**: 從空白開始，使用者說一句話，系統回覆並更新短卡。

**Steps**:
1. 建立 in-memory DB
2. 建立 conversation（mode: world_design, phase: explore）
3. 使用者輸入：「我想做一個自動化客服」
4. handleTurn() 執行：
   - parseIntent → `{ type: "new_intent", domain: "customer_service" }`
   - CardManager.create(WorldCard) → version 1
   - checkTransition → stays EXPLORE
   - pickStrategy → mirror + probe
   - generateReply → 回覆文字
5. 短卡 version = 1，confirmed.must_have = []

**Verification**: conversation 存在、message 有 2 筆（user + assistant）、card version = 1、phase = explore。

---

### GP-2: Full W1 Scenario（Track A-E）

**Description**: 完整的 W1 walkthrough — 從零建客服 village，8 輪對話收斂到 Village Pack。

**Steps**:
1. 建立 conversation
2. 8 輪 handleTurn() 呼叫（模擬 W1 的 8 輪對話）
3. Phase transitions: explore(T1-T2) → focus(T3) → settle(T7)
4. 短卡 version 遞增到 6
5. Settlement router: VILLAGE_PACK
6. buildVillagePack() → YAML string
7. ThyraClient.applyVillagePack() → 呼叫 Thyra API
8. Settlement status: draft → confirmed → applied

**Verification**:
- 8 輪 messages 各有 user + assistant
- Card final version = 6
- Card has hard_rules, must_have, chief_draft
- Village Pack YAML 包含 constitution rules + chief + skills
- Settlement status = applied

---

### GP-3: Quick Task（Track A-D, no Thyra）

**Description**: 使用者問「幫我查上週數據」，2 輪就完成，不需要 Village Pack。

**Steps**:
1. 建立 conversation（mode: task）
2. 使用者輸入：「幫我看一下上週客服數據」
3. handleTurn() → mode detection: task → TaskCard
4. 使用者輸入：「全部都看」
5. handleTurn() → 快速通道 → settle → 直接回覆結果

**Verification**: conversation mode = task、card type = task、只有 2 輪、沒有 settlement（直接回覆）。

---

## Quality Benchmarks

| CONTRACT Rule | Metric | Baseline | Verification |
|--------------|--------|----------|-------------|
| TYPE-01 | tsc error count | 0 | `bun run build` |
| LLM-01 | LLM calls with Zod validation | 100% | Code review: grep safeParse |
| CARD-01 | card version increments on update | 100% | Unit tests |
| COND-01 | transitions with explicit conditions | 100% | State machine tests |
| COND-02 | LLM calls per turn | ≤ 2 | handleTurn test: mock count |
| API-01 | routes returning { ok, data/error } | 100% | Route tests |
| TEST-01 | test pass rate | 100% | `bun test` |
