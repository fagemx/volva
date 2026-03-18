# World Design Pipeline — Track 拆解

## 層級定義

- **L0 基礎設施**：Zod Schemas + DB Tables + Session Manager（型別 + 持久化 + 狀態機）
- **L1 路由層**：Intent Router + Path Check（分類意圖 + 評估路徑固定度）
- **L2 生成層**：Space Builder（expand + constrain，生成 realization candidates）
- **L3 驗證層**：Probe-Commit Shell + Regime Evaluators（驗證 candidates + commit/hold/discard）
- **L4 整合層**：Decision Routes + Forge Handoff（HTTP API + 接入 settlement builders）

## DAG

```
L0 基礎設施
  [A] Decision State DB + Shared Types
   │
   ├──────────────────┐
   ▼                  ▼
L1 路由層
  [B] Intent Router  [C] Path Check
   │                  │
   ├──────────────────┤
   ▼
L2 生成層
  [D] Space Builder
   │
   ▼
L3 驗證層
  [E] Probe-Commit
   │
   ▼
L4 整合層
  [F] Decision Routes + Forge Handoff
```

**關鍵依賴說明**：
- A 是所有 Track 的前提（Zod schema + DB 必須先存在）
- B 和 C 同屬 L1，可並行開發（runtime 是 B→C 順序但模組獨立）
- D 依賴 B + C 的 output types（IntentRoute + PathCheckResult → space-builder input）
- E 依賴 D（probe-commit 需要 RealizationCandidate 作為 input）
- F 組裝所有模組，提供 HTTP API

## Track → Step 對照

### A: Decision State DB + Shared Types（L0）
```
TRACK_A_DECISION_STATE/
  A1_ZOD_SCHEMAS.md            ← Regime, IntentRoute, PathCheckResult, RealizationCandidate, etc.
  A2_DB_SCHEMA.md              ← decision_sessions + 7 supporting tables (8 total) in initSchema()
  A3_SESSION_MANAGER.md        ← DecisionSessionManager: create/advance/query + stage validation
```

### B: Intent Router（L1）
```
TRACK_B_INTENT_ROUTER/
  B1_REGIME_CLASSIFICATION.md  ← LLM-based intent → regime classification with Zod
  B2_TESTS_AND_FOLLOWUP.md     ← Router test cases from spec + follow-up generation
```

### C: Path Check（L1）
```
TRACK_C_PATH_CHECK/
  C1_ELEMENT_ANALYSIS.md       ← Fixed/Unresolved element analysis (pure function)
  C2_ROUTE_DECISION.md         ← 3-route decision + regime-specific checks + tests
```

### D: Space Builder（L2）
```
TRACK_D_SPACE_BUILDER/
  D1_EXPAND.md                 ← LLM-based candidate generation per regime
  D2_CONSTRAIN.md              ← Kill filters + edge/constraint/reversibility pruning
  D3_REGIME_CONFIGS.md         ← Per-regime builder configs (economic, governance) + tests
```

### E: Probe-Commit（L3）
```
TRACK_E_PROBE_COMMIT/
  E1_PROBE_SHELL.md            ← Kill filters, probe packaging, signal packet handling
  E2_REGIME_EVALUATORS.md      ← Economic + Governance evaluators (v0 scope)
  E3_COMMIT_MEMO.md            ← CommitMemo generation from evaluator output + tests
```

### F: Decision Routes + Forge Handoff（L4）
```
TRACK_F_INTEGRATION/
  F1_DECISION_ROUTES.md        ← HTTP API: start, path-check, space-build, evaluate, forge
  F2_FORGE_HANDOFF.md          ← CommitMemo → settlement builder translation
  F3_E2E_TESTS.md              ← Golden path: economic + governance end-to-end
```

---

## Track Details

## Track A: Decision State DB + Shared Types

**Layer**: L0
**Goal**: 建立 decision pipeline 的型別基礎和持久化層

**Input**:
- `docs/world-design-v0/shared-types.md`（canonical types）
- `docs/storage/volva-working-state-schema-v0.md`（DB schema design）
- 現有 `src/db.ts`（initSchema pattern）

**Output**:
- `src/schemas/decision.ts` — Regime, IntentRoute, PathCheckResult, RealizationCandidate, 所有 shared types 的 Zod schema
- `src/db.ts` 擴展 — decision_sessions + 7 supporting tables (8 total)
- `src/decision/session-manager.ts` — DecisionSessionManager class

**Dependencies**:
- blocks: B, C, D, E, F
- blocked-by: none

**DoD**:
- [ ] `bun run build` zero errors
- [ ] 所有 shared-types.md 的型別都有 Zod schema
- [ ] DB tables match storage schema（7 tables）
- [ ] SessionManager: create, advanceStage, getSession, updateSession
- [ ] Stage transitions 有前置條件驗證
- [ ] `bun test src/schemas/decision.test.ts` pass
- [ ] `bun test src/decision/session-manager.test.ts` pass

**Smoke Test**:
```bash
bun run build
bun test src/schemas/decision.test.ts
bun test src/decision/session-manager.test.ts
```

**Task Count**: 3

---

## Track B: Intent Router

**Layer**: L1
**Goal**: 實作 intent-router.md — 把使用者的自然語言意圖分類成 6 regimes

**Input**:
- `docs/world-design-v0/intent-router.md`
- `docs/world-design-v0/intent-router-and-space-builder.md` Section 5
- `docs/world-design-v0/router-test-cases.md`
- Track A output（Zod schemas + session manager）

**Output**:
- `src/decision/intent-router.ts` — `classifyIntent(llm, userMessage, context): IntentRoute`
- 完整測試（含 spec 的 15+ test cases）

**Dependencies**:
- blocks: D, F
- blocked-by: A

**DoD**:
- [ ] `bun run build` zero errors
- [ ] LLM call with Zod schema validation（CONTRACT LLM-01 + LLM-02）
- [ ] Returns IntentRoute with primaryRegime, confidence, keyUnknowns, suggestedFollowups
- [ ] Fallback on LLM failure（default to low confidence + generic follow-ups）
- [ ] Test cases from `router-test-cases.md` pass
- [ ] `bun test src/decision/intent-router.test.ts` pass

**Task Count**: 2

---

## Track C: Path Check

**Layer**: L1
**Goal**: 實作 path-check.md — 評估 realization path 的固定程度，決定 3-route 分流

**Input**:
- `docs/world-design-v0/path-check.md`
- Track A output（Zod schemas）

**Output**:
- `src/decision/path-check.ts` — `checkPath(intentRoute, context): PathCheckResult`
- 完整測試

**Dependencies**:
- blocks: D, F
- blocked-by: A

**DoD**:
- [ ] `bun run build` zero errors
- [ ] Pure function — no LLM call（COND-02 friendly）
- [ ] 正確判斷 5 fixed elements（domain, form, buyer, loop, build_target）
- [ ] 正確產出 3 routes（space-builder / forge-fast-path / space-builder-then-forge）
- [ ] Regime-specific checks 實作
- [ ] `bun test src/decision/path-check.test.ts` pass

**Task Count**: 2

---

## Track D: Space Builder

**Layer**: L2
**Goal**: 實作 space-builder — expand + constrain，根據 regime 生成 realization candidates

**Input**:
- `docs/world-design-v0/intent-router-and-space-builder.md` Section 7-14
- `docs/world-design-v0/economic-regime-v0.md`（economic 的 space-builder 細節）
- `docs/world-design-v0/governance-regime-v0.md`（governance 的 space-builder 細節）
- Track B output（IntentRoute）+ Track C output（PathCheckResult）

**Output**:
- `src/decision/space-builder.ts` — `buildSpace(llm, intentRoute, pathCheck, context): RealizationCandidate[]`
- `src/decision/kill-filters.ts` — `applyKillFilters(candidates, regime, constraints): RealizationCandidate[]`
- 完整測試

**Dependencies**:
- blocks: E, F
- blocked-by: A, B, C

**DoD**:
- [ ] `bun run build` zero errors
- [ ] LLM call for expand with Zod schema（CONTRACT LLM-01 + LLM-02）
- [ ] Kill filters 是 pure function（不需 LLM）
- [ ] Economic regime: generates domain × vehicle candidates
- [ ] Governance regime: generates world form candidates
- [ ] Candidates have form, whyThisCandidate, assumptions, probeReadinessHints
- [ ] `bun test src/decision/space-builder.test.ts` pass
- [ ] `bun test src/decision/kill-filters.test.ts` pass

**Task Count**: 3

---

## Track E: Probe-Commit

**Layer**: L3
**Goal**: 實作 probe-commit — shell + regime-specific evaluators（v0: economic + governance）

**Input**:
- `docs/world-design-v0/probe-commit.md`
- `docs/world-design-v0/probe-commit-evaluators.md`
- `docs/world-design-v0/economic-regime-v0.md`（commit threshold）
- `docs/world-design-v0/governance-regime-v0.md`（commit threshold）
- Track D output（RealizationCandidate）

**Output**:
- `src/decision/probe-shell.ts` — `packageProbe()`, `recordSignal()`, `runKillFilters()`
- `src/decision/evaluators/economic.ts` — economic evaluator
- `src/decision/evaluators/governance.ts` — governance evaluator
- `src/decision/commit-memo.ts` — `buildCommitMemo(evaluatorOutput, candidate): CommitMemo`
- 完整測試

**Dependencies**:
- blocks: F
- blocked-by: A, D

**DoD**:
- [ ] `bun run build` zero errors
- [ ] Probe shell: packageProbe → ProbeableForm, recordSignal → SignalPacket
- [ ] Economic evaluator: buyer signal + payment evidence → commit/hold/discard
- [ ] Governance evaluator: world density + governance pressure → commit/hold/discard
- [ ] CommitMemo includes whatForgeShouldBuild + whatForgeMustNotBuild
- [ ] EconomicCommitMemo + GovernanceCommitMemo 特化型別
- [ ] `bun test src/decision/probe-shell.test.ts` pass
- [ ] `bun test src/decision/evaluators/*.test.ts` pass
- [ ] `bun test src/decision/commit-memo.test.ts` pass

**Task Count**: 3

---

## Track F: Decision Routes + Forge Handoff

**Layer**: L4
**Goal**: 提供 HTTP API 驅動整個 decision pipeline + 把 CommitMemo 轉成 settlement builder 的 input

**Input**:
- 現有 `src/routes/` pattern（Hono + DI）
- 現有 `src/settlement/` builders
- Track B-E output（全部 decision modules）

**Output**:
- `src/routes/decisions.ts` — 8 endpoints for decision pipeline
- `src/decision/forge-handoff.ts` — CommitMemo → settlement payload translation
- End-to-end tests

**Dependencies**:
- blocks: none
- blocked-by: B, C, D, E

**DoD**:
- [ ] `bun run build` zero errors
- [ ] 8 endpoints: start, reclassify, path-check, space-build, evaluate, retry-evaluate, forge, list/get
- [ ] 每個 endpoint ≤ 2 LLM calls（CONTRACT COND-02）
- [ ] Forge handoff: economic → task/workflow settlement, governance → village_pack settlement
- [ ] Golden path: economic regime end-to-end
- [ ] Golden path: governance regime end-to-end
- [ ] `bun test` all pass
- [ ] `bun run build && bun run lint` zero errors

**Task Count**: 3

---

## Module Import 路徑

```
src/
  schemas/
    decision.ts                  ← Regime, IntentRoute, PathCheckResult, etc.（A1）
  decision/
    session-manager.ts           ← DecisionSessionManager（A3）
    intent-router.ts             ← classifyIntent（B1）
    path-check.ts                ← checkPath（C1）
    space-builder.ts             ← buildSpace（D1）
    kill-filters.ts              ← applyKillFilters（D2）
    probe-shell.ts               ← packageProbe, recordSignal（E1）
    evaluators/
      types.ts                   ← EvaluatorInput, EvaluatorOutput interface（E2）
      economic.ts                ← evaluateEconomic（E2）
      governance.ts              ← evaluateGovernance（E2）
    commit-memo.ts               ← buildCommitMemo（E3）
    forge-handoff.ts             ← translateToSettlement（F2）
  routes/
    decisions.ts                 ← decisionRoutes（F1）
```

## 跨模組依賴圖（import 方向）

```
schemas/decision ← decision/session-manager
                 ← decision/intent-router（+ llm/client）
                 ← decision/path-check
                 ← decision/space-builder（+ llm/client）
                 ← decision/kill-filters
                 ← decision/probe-shell
                 ← decision/evaluators/*（+ llm/client）
                 ← decision/commit-memo
                 ← decision/forge-handoff

routes/decisions → decision/* + settlement/* (assembly layer)
```

**規則**：
- `decision/` 不得 import `conductor/`、`cards/`、`settlement/`、`containers/`
- `decision/` 只 import `schemas/` 和 `llm/`
- `routes/decisions.ts` 是 assembly layer，可 import 所有下層
