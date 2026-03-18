# World Design Pipeline — Validation Plan

## Track Acceptance Criteria

### Track A: Decision State DB + Shared Types

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| Zod schemas | All shared-types.md types covered | `grep -c "Schema = z.object\|Schema = z.enum" src/schemas/decision.ts` ≥ 15 |
| DB tables | 8 new tables in initSchema | `grep -c "CREATE TABLE" src/db.ts` ≥ 13 (5 existing + 8 new) |
| Session manager | CRUD + stage transitions | `bun test src/decision/session-manager.test.ts` |
| Stage validation | Invalid transitions rejected | `bun test src/decision/session-manager.test.ts` (error path) |
| No any | Zero `as any` | `grep -c "as any" src/schemas/decision.ts src/decision/session-manager.ts` = 0 |

### Track B: Intent Router

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Classify | 6 regimes correctly classified | `bun test src/decision/intent-router.test.ts` |
| Zod output | IntentRoute validated | Code review: generateStructured with IntentRouteSchema |
| Fallback | LLM failure → low confidence fallback | `bun test src/decision/intent-router.test.ts` (fallback case) |
| Test cases | ≥ 15 cases from router-test-cases.md | `grep -c "it(" src/decision/intent-router.test.ts` ≥ 15 |

### Track C: Path Check

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Pure function | Zero LLM calls | `grep -c "llm\|generateStructured" src/decision/path-check.ts` = 0 |
| 5 elements | domain/form/buyer/loop/build_target analyzed | `bun test src/decision/path-check.test.ts` |
| 3 routes | space-builder / forge-fast-path / space-builder-then-forge | `bun test src/decision/path-check.test.ts` |
| Regime checks | Governance needs worldForm for fast-path | `bun test src/decision/path-check.test.ts` |

### Track D: Space Builder

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Expand | LLM generates candidates with Zod | `bun test src/decision/space-builder.test.ts` |
| Kill filters | Pure function, returns pruneReasons | `bun test src/decision/kill-filters.test.ts` |
| Economic | domain × vehicle candidates generated | `bun test src/decision/space-builder.test.ts` |
| Governance | WorldForm candidates generated | `bun test src/decision/space-builder.test.ts` |
| Candidate shape | form + whyThisCandidate + assumptions | `bun test src/decision/space-builder.test.ts` |

### Track E: Probe-Commit

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Probe shell | packageProbe → ProbeableForm | `bun test src/decision/probe-shell.test.ts` |
| Signal | recordSignal → SignalPacket | `bun test src/decision/probe-shell.test.ts` |
| Economic eval | buyer signal → commit/hold/discard | `bun test src/decision/evaluators/economic.test.ts` |
| Governance eval | world density → commit/hold/discard | `bun test src/decision/evaluators/governance.test.ts` |
| CommitMemo | whatForgeShouldBuild + whatForgeMustNotBuild | `bun test src/decision/commit-memo.test.ts` |

### Track F: Decision Routes + Forge Handoff

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| 8 endpoints | start, reclassify, path-check, space-build, evaluate, retry-evaluate, forge, list/get | `bun test src/routes/decisions.test.ts` |
| COND-02 | Each endpoint ≤ 2 LLM calls | Code review |
| Forge handoff | Economic → task/workflow, Governance → village_pack | `bun test src/decision/forge-handoff.test.ts` |
| E2E | Golden paths pass | `bun test` |
| Full build | Zero errors + warnings | `bun run build && bun run lint` |

---

## Golden Path Scenarios

### GP-1: Economic Regime End-to-End (Track A + B + C + D + E + F)

**Description**: "我想賺錢" → regime classification → path check → candidates → evaluate → commit → forge handoff

**Steps**:
1. `POST /api/decisions/start` with `{ userMessage: "我想賺錢，給你1000美金" }`
   - → IntentRoute: primaryRegime=economic, confidence ≥ 0.8
   - → DecisionSession created, stage=routing→path-check
2. `POST /api/decisions/:id/path-check`
   - → PathCheckResult: certainty=low, route=space-builder
   - → stage=path-check→space-building
3. `POST /api/decisions/:id/space-build`
   - → RealizationCandidate[] (≥ 2 candidates, e.g., "影片生成 × workflow install")
   - → stage=space-building→probe-design
4. User selects candidate → `POST /api/decisions/:id/evaluate` with candidateId
   - → EvaluatorOutput: verdict=commit
   - → EconomicCommitMemo with buyerHypothesis
   - → stage=commit-review→done
5. `POST /api/decisions/:id/forge`
   - → Settlement payload compatible with existing builders

**Verification**: DecisionSession reaches stage=done. CommitMemo has whatForgeShouldBuild populated. Settlement payload is structurally valid.

---

### GP-2: Governance Regime End-to-End (Track A + B + C + D + E + F)

**Description**: "我想開一個會自己運作的地方" → governance → space-build → evaluate → village_pack

**Steps**:
1. `POST /api/decisions/start` with `{ userMessage: "我想開一個會自己運作的地方，讓AI管它" }`
   - → IntentRoute: primaryRegime=governance
2. `POST /api/decisions/:id/path-check`
   - → PathCheckResult: certainty=low, route=space-builder
3. `POST /api/decisions/:id/space-build`
   - → GovernanceWorldCandidate[] with worldForm values (market, commons, etc.)
4. User selects candidate → `POST /api/decisions/:id/evaluate`
   - → GovernanceCommitMemo with selectedWorldForm, minimumWorldShape
5. `POST /api/decisions/:id/forge`
   - → village_pack settlement payload

**Verification**: GovernanceCommitMemo has thyraHandoffRequirements. Settlement target is village_pack.

---

### GP-3: Forge Fast-Path (Track A + B + C + F)

**Description**: "幫我部署 checkout-service 到 staging" → high certainty → skip space-builder → forge directly

**Steps**:
1. `POST /api/decisions/start` with `{ userMessage: "幫我部署checkout-service到staging" }`
   - → IntentRoute: primaryRegime=leverage, confidence ≥ 0.9
2. `POST /api/decisions/:id/path-check`
   - → PathCheckResult: certainty=high, route=forge-fast-path
   - → fixedElements: domain, form, build_target all fixed
   - → Session stays at stage=path-check (route endpoint does NOT auto-advance)
3. `POST /api/decisions/:id/forge` (skip space-build and evaluate)
   - → Forge endpoint detects `routeDecision === 'forge-fast-path'` + `stage === 'path-check'`
   - → Generates **synthetic CommitMemo** from fixedElements (no evaluator needed)
   - → Calls `sessionManager.fastPathToDone(id)` to jump directly to `done`
   - → Returns settlement payload

**Verification**: No space-builder or evaluate steps. Forge uses `fastPathToDone()` not `advanceStage()`. Synthetic CommitMemo has whatForgeShouldBuild populated from fixedElements.

---

### GP-4: Low Confidence + Follow-up (Track B)

**Description**: Ambiguous input → low confidence → follow-up questions → re-classify

**Steps**:
1. `POST /api/decisions/start` with `{ userMessage: "我想做點什麼" }`
   - → IntentRoute: confidence < 0.5, suggestedFollowups non-empty
2. Session stays at stage=routing (not auto-advanced)
3. User answers follow-up → re-submit with more context
4. → IntentRoute: confidence ≥ 0.7, clear primaryRegime

**Verification**: Low confidence does NOT auto-advance. Follow-up questions are actionable. Reclassify endpoint accepts the same session, doesn't create a new one.

---

### GP-5: Hold Verdict → Retry with New Evidence (Track E + F)

**Description**: Evaluator returns `hold` → user provides additional signals → re-evaluate

**Steps**:
1. Complete GP-1 through evaluate step → EvaluatorOutput: verdict=hold
2. Session stage is `commit-review` with hold CommitMemo
3. `POST /api/decisions/:id/forge` → **rejected** (verdict is not 'commit')
4. User provides new signals → `POST /api/decisions/:id/retry-evaluate` with `{ additionalSignals: [...] }`
5. Session resets to `space-building` via `sessionManager.resetToStage()`
6. Re-evaluate with merged signals → new verdict (commit or discard)

**Verification**: Hold verdict does not dead-end the session. `resetToStage` allows controlled backward movement. New evaluation uses accumulated signals.

---

### GP-6: Kill-All Recovery (Track D + F)

**Description**: All candidates killed by filters → user relaxes constraints → regenerate

**Steps**:
1. `POST /api/decisions/:id/space-build` → all candidates killed
2. Response: `{ candidates: [], killed: 5, suggestion: 'Relax constraints or provide more context' }`
3. Session stage stays at `space-building` (not advanced, since no surviving candidates)
4. User re-submits with relaxed constraints → `POST /api/decisions/:id/space-build` again
5. → New candidates generated and filtered

**Verification**: Zero surviving candidates does not advance stage. User can retry space-build at the same stage.

---

## Quality Benchmarks

| CONTRACT Rule | Metric | Baseline | Verification |
|--------------|--------|----------|-------------|
| TYPE-01 | `as any` count | 0 | `grep -rc "as any\|: any" src/decision/ src/schemas/decision.ts` |
| SCHEMA-01 | Zod schema count | ≥ 15 | `grep -c "Schema = z" src/schemas/decision.ts` |
| LAYER-01 | Cross-layer imports | 0 | `grep -rc "from.*conductor\|from.*cards\|from.*settlement" src/decision/ --include="*.ts"` |
| LLM-01/02 | LLM calls with schema + try/catch | 100% | Code review of intent-router.ts, space-builder.ts, evaluators/*.ts |
| COND-02 | LLM calls per route handler | ≤ 1 (actually) | Code review of routes/decisions.ts — each endpoint makes at most 1 LLM call |
| SETTLE-01 | Multi-step user confirmation | 100% | GP-1, GP-2: 5 separate requests, user confirms at each step |
| STAGE-01 | Stage changes via session-manager | 100% | `grep -rn "UPDATE.*decision_sessions.*stage" src/ \| grep -v session-manager` = 0 |
| SHARED-01 | Types in schemas/decision.ts only | 100% | `grep -c "^export type\|^type " src/decision/*.ts` = minimal |
| TEST-01 | Test pass rate | 100% | `bun test` |
