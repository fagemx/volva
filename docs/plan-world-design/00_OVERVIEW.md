# World Design Pipeline — Planning Pack

## Goal

在 Völva 現有的 conductor 之上，建構完整的 pre-world decision pipeline：
- **可分流（routable）** 的 intent-router（6 regime 分類、confidence、follow-up）
- **可判定（assessable）** 的 path-check（certainty 評估、3-route 分流）
- **可生成（generatable）** 的 space-builder（expand + constrain、regime-specific candidate 生成）
- **可驗證（provable）** 的 probe-commit（shell + regime evaluator、signal → verdict）
- **可追蹤（traceable）** 的 decision state（DB schema、Edda event logging）

## Architecture Context

```text
現有 conductor:
  parseIntent → applyIntent → checkTransition → generateReply
  (explore → focus → settle)

新 pipeline（在 Shape/World container 內執行）:
  intent-router → path-check → space-builder → probe-commit → forge handoff
  (routing → path-check → space-building → probe-design → commit-review → done)
```

**Coexistence 策略：** 新 pipeline 透過新 API endpoints 觸發，現有 `/api/conversations/:id/messages` 不改。
Shape container（from deepskill plan）在內部呼叫 world-design pipeline。兩者不衝突。

## Dependency DAG

```
L0 基礎設施
  [A] Decision State DB + Shared Types
   │
   ├─────────────────────┐
   ▼                     ▼
L1 路由層
  [B] Intent Router     [C] Path Check
   │                     │
   ├─────────────────────┤
   ▼
L2 生成層
  [D] Space Builder
   │
   ▼
L3 驗證層
  [E] Probe-Commit (Shell + Evaluators)
   │
   ▼
L4 整合層
  [F] Decision Routes + Forge Handoff
```

**關鍵依賴說明**：
- A 是所有 Track 的前提（DB schema + Zod types 必須先存在）
- B 依賴 A（intent-router 寫入 DecisionSession）
- C 依賴 A（path-check 讀寫 DecisionSession）；可與 B 並行開發但 runtime 依序執行
- D 依賴 B + C（space-builder 需要 IntentRoute + PathCheckResult 作為輸入）
- E 依賴 D（probe-commit 需要 RealizationCandidate 作為輸入）
- F 整合 B + C + D + E，提供 HTTP API + forge handoff

**Pre-existing dependencies（不由本 plan 建立）：**
- `src/llm/client.ts` — LLMClient（B, D, E 使用）
- `src/db.ts` — initSchema（A 擴展）
- `src/settlement/` — existing settlement builders（F 的 forge handoff target）

## Track Summary

| Track | Name | Layer | Tasks | Dependencies | Status |
|-------|------|-------|-------|-------------|--------|
| A | Decision State DB + Shared Types | L0 | 3 | — | ☐ |
| B | Intent Router | L1 | 2 | A | ☐ |
| C | Path Check | L1 | 2 | A | ☐ |
| D | Space Builder | L2 | 3 | A, B, C | ☐ |
| E | Probe-Commit | L3 | 3 | A, D | ☐ |
| F | Decision Routes + Forge Handoff | L4 | 3 | B, C, D, E | ☐ |

**Total: 6 Tracks, 16 Tasks**

## Parallel Execution Timeline

```
Batch 1（無依賴）：
  Agent 1 → Track A: A1 → A2 → A3

Batch 2（依賴 A，可並行）：
  Agent 1 → Track B: B1 → B2
  Agent 2 → Track C: C1 → C2

Batch 3（依賴 B + C）：
  Agent 1 → Track D: D1 → D2 → D3

Batch 4（依賴 D）：
  Agent 1 → Track E: E1 → E2 → E3

Batch 5（依賴 B + C + D + E）：
  Agent 1 → Track F: F1 → F2 → F3
```

## Progress Tracking

### Batch 1
- [ ] Track A: Decision State DB + Shared Types
  - [ ] A1: Zod Schemas (Regime, IntentRoute, PathCheckResult, RealizationCandidate, etc.)
  - [ ] A2: DB Schema (decision_sessions + 7 supporting tables = 8 new tables)
  - [ ] A3: Decision Session Manager (CRUD + stage transitions)

### Batch 2
- [ ] Track B: Intent Router
  - [ ] B1: Regime Classification (LLM + Zod)
  - [ ] B2: Router Tests + Follow-up Generation
- [ ] Track C: Path Check
  - [ ] C1: Fixed/Unresolved Element Analysis
  - [ ] C2: Route Decision Logic + Tests

### Batch 3
- [ ] Track D: Space Builder
  - [ ] D1: Expand — Candidate Generation (LLM + Zod)
  - [ ] D2: Constrain — Kill Filters + Pruning
  - [ ] D3: Regime-Specific Builder Configs + Tests

### Batch 4
- [ ] Track E: Probe-Commit
  - [ ] E1: Shell — Probe Packaging + Signal Packets
  - [ ] E2: Regime Evaluators (Economic + Governance)
  - [ ] E3: Commit Memo Generation + Tests

### Batch 5
- [ ] Track F: Decision Routes + Forge Handoff
  - [ ] F1: Decision API Routes
  - [ ] F2: Forge Handoff → Settlement Builders
  - [ ] F3: End-to-End Tests + Golden Path

## Module Map

| Module | Introduced | Responsibility |
|--------|-----------|----------------|
| `src/schemas/decision.ts` | A1 | Zod schemas for all world-design shared types |
| `src/decision/session-manager.ts` | A3 | DecisionSession CRUD + stage transitions |
| `src/decision/intent-router.ts` | B1 | Regime classification via LLM |
| `src/decision/path-check.ts` | C1 | Path certainty assessment (pure function) |
| `src/decision/space-builder.ts` | D1 | Candidate generation via LLM |
| `src/decision/kill-filters.ts` | D2 | Candidate pruning logic |
| `src/decision/probe-shell.ts` | E1 | Probe packaging + signal handling |
| `src/decision/evaluators/economic.ts` | E2 | Economic regime evaluator |
| `src/decision/evaluators/governance.ts` | E2 | Governance regime evaluator |
| `src/decision/commit-memo.ts` | E3 | CommitMemo generation from evaluator output |
| `src/decision/forge-handoff.ts` | F2 | CommitMemo → settlement builder translation |
| `src/routes/decisions.ts` | F1 | Decision pipeline HTTP API |

## Data File Layout

```
src/
  schemas/
    decision.ts              # Zod schemas — Regime, IntentRoute, etc. (A1)
  decision/
    session-manager.ts       # DecisionSession CRUD (A3)
    intent-router.ts         # Regime classification (B1)
    path-check.ts            # Path certainty (C1)
    space-builder.ts         # Candidate generation (D1)
    kill-filters.ts          # Candidate pruning (D2)
    probe-shell.ts           # Probe packaging (E1)
    evaluators/
      economic.ts            # Economic evaluator (E2)
      governance.ts          # Governance evaluator (E2)
      types.ts               # EvaluatorInput/Output interface (E2)
    commit-memo.ts           # CommitMemo generation (E3)
    forge-handoff.ts         # → settlement builders (F2)
  routes/
    decisions.ts             # Decision API routes (F1)
```

## Scope Exclusions

| Feature | Spec 位置 | Reason for deferral |
|---------|-----------|-------------------|
| **4 regime evaluators** (capability/leverage/expression/identity) | `probe-commit-evaluators.md` | v0 只做 economic + governance；其他 4 個 regime doc 是 stub |
| **Edda event recording** | `edda-decision-spine-v0.md` | v0 用 local `decision_events` table；Edda API 尚未就緒 |
| **Semantic intent classification** | `intent-router.md` | v0 用 LLM structured output；不用 embedding |
| **Canonical cycle runtime** | `canonical-cycle-types-note.md` | 行為規格屬 Thyra，本 plan 只做型別定義 |
| **Forge internal build logic** | `forge-handoff-v0.md` | v0 Forge 是 pass-through：CommitMemo → existing settlement builders |

## COND-02 Compliance

Pipeline 跨多個 HTTP request，每個 request 最多 2 次 LLM call：

| Request | LLM calls | Endpoint |
|---------|-----------|----------|
| Start decision session + classify intent | 1 (intent-router) | `POST /api/decisions/start` |
| Re-classify after follow-up | 1 (intent-router) | `POST /api/decisions/:id/reclassify` |
| Path check | 0 (pure function) | `POST /api/decisions/:id/path-check` |
| Generate candidates | 1 (space-builder) | `POST /api/decisions/:id/space-build` |
| Evaluate + commit | 1 (evaluator) | `POST /api/decisions/:id/evaluate` |
| Retry evaluate (hold verdict) | 1 (evaluator) | `POST /api/decisions/:id/retry-evaluate` |
| Forge handoff | 0 (pure function) | `POST /api/decisions/:id/forge` |
| List / get sessions | 0 | `GET /api/decisions`, `GET /api/decisions/:id` |

每個 request 最多 1 次 LLM call（遠低於 COND-02 上限 2 次）。
使用者在每個階段確認後推進下一步，滿足 SETTLE-01 精神。

**Forge-fast-path：** 當 path-check 判定 `route === 'forge-fast-path'` 時，
forge endpoint 接受 `stage === 'path-check'` 並用 `fastPathToDone()` 跳過中間 stages。
同時生成 synthetic CommitMemo（從 fixedElements 組裝），不需走 space-build + evaluate。
