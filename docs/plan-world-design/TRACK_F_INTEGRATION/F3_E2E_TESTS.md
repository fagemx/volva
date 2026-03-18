# F3: End-to-End Tests + Golden Paths

> **Module**: `src/routes/decisions.test.ts`, `src/decision/forge-handoff.test.ts`
> **Layer**: L4
> **Dependencies**: F1（Decision Routes）, F2（Forge Handoff）, all decision modules (B1-E3)
> **Blocks**: none (final task)

---

## Bootstrap Instructions

```bash
# 1. Read all decision modules
cat src/decision/intent-router.ts
cat src/decision/path-check.ts
cat src/decision/space-builder.ts
cat src/decision/kill-filters.ts
cat src/decision/probe-shell.ts
cat src/decision/evaluators/economic.ts
cat src/decision/evaluators/governance.ts
cat src/decision/commit-memo.ts
cat src/decision/forge-handoff.ts

# 2. Read routes
cat src/routes/decisions.ts

# 3. Read test patterns
cat src/routes/conversations.test.ts        # Hono test pattern if exists
cat src/llm/client.test.ts                  # LLM mock pattern

# 4. Read contracts
cat docs/plan-world-design/CONTRACT.md      # All rules
cat docs/plan-world-design/00_OVERVIEW.md   # COND-02 table

# 5. Verify baseline
bun run build
bun run lint
bun test
```

---

## Final Result

- `src/decision/forge-handoff.test.ts` — unit tests for forge handoff
- `src/routes/decisions.test.ts` — integration tests with 3 golden paths
- GP-1: Economic golden path ("I want to make money" → classify → path-check → candidates → evaluate → commit)
- GP-2: Governance golden path ("I want to open a self-operating world" → classify → path-check → candidates → evaluate → commit)
- GP-3: Forge-fast-path shortcut (high certainty → skip space-builder → forge directly)
- CONTRACT validation checks (COND-02, SETTLE-01, LAYER-01, TYPE-01)
- Full system: `bun run build && bun run lint && bun test` zero errors

---

## Implementation Steps

### Step 1: Write forge-handoff unit tests

- **File**: `src/decision/forge-handoff.test.ts`
- **Reference**: F2 implementation, `forge-handoff-v0.md`
- **Key changes**:
  1. Test: economic CommitMemo → EconomicSettlementPayload with `kind: 'economic'`
     ```typescript
     it('translates economic CommitMemo to task/workflow payload', () => {
       const memo: EconomicCommitMemo = {
         candidateId: 'c1', regime: 'economic', verdict: 'commit',
         rationale: ['Strong buyer signal'], evidenceUsed: ['3 price conversations'],
         unresolvedRisks: ['Delivery scale'], whatForgeShouldBuild: ['intake flow', 'pricing page'],
         whatForgeMustNotBuild: ['full product', 'automation pipeline'],
         recommendedNextStep: ['First paid pilot'],
         buyerHypothesis: 'Small design studios', painHypothesis: 'Workflow setup pain',
         paymentEvidence: ['willing to pay $200'], whyThisVehicleNow: ['setup service fits edge'],
         nextSignalAfterBuild: ['Paid pilot completion'],
       };
       const result = translateToSettlement(memo);
       expect(result.kind).toBe('economic');
       expect(result.taskSpec.constraints).toEqual(memo.whatForgeMustNotBuild);
     });
     ```
  2. Test: governance CommitMemo → GovernanceSettlementPayload with `kind: 'governance'`
     ```typescript
     it('translates governance CommitMemo to village_pack payload', () => {
       const memo: GovernanceCommitMemo = {
         candidateId: 'c2', regime: 'governance', verdict: 'commit',
         rationale: ['Closure achieved'], evidenceUsed: ['one-cycle probe passed'],
         unresolvedRisks: ['Scale unknown'], whatForgeShouldBuild: ['world instantiation'],
         whatForgeMustNotBuild: ['dashboard', 'admin panel'],
         recommendedNextStep: ['Instantiate minimum world'],
         selectedWorldForm: 'market', minimumWorldShape: ['2 zones', '3 chiefs'],
         stateDensityAssessment: 'high', governancePressureAssessment: 'medium',
         firstCycleDesign: ['observe→propose→judge→apply→pulse'],
         thyraHandoffRequirements: ['constitution draft', 'chief assignments'],
       };
       const result = translateToSettlement(memo);
       expect(result.kind).toBe('governance');
       expect(result.villagePack.worldForm).toBe('market');
     });
     ```
  3. Test: `whatForgeMustNotBuild` flows through to settlement constraints

### Step 2: Write GP-1 — Economic golden path integration test

- **File**: `src/routes/decisions.test.ts`
- **Reference**: `00_OVERVIEW.md` COND-02 table, `economic-regime-v0.md` Section 20
- **Key changes**:
  1. Setup: mock LLM, create in-memory DB, init schema, create route app
  2. Step 1 — Start: POST `/api/decisions/start` with `{ userMessage: "I want to make money, here is $1000" }`
     - Assert: response has `sessionId` and `intentRoute.primaryRegime === 'economic'`
  3. Step 2 — Path check: POST `/api/decisions/:id/path-check`
     - Assert: `pathCheckResult.route === 'space-builder'` (unfixed path)
  4. Step 3 — Space build: POST `/api/decisions/:id/space-build`
     - Mock LLM returns economic candidates with vehicle fields
     - Assert: response has `candidates` array, all with `regime: 'economic'`
  5. Step 4 — Evaluate: POST `/api/decisions/:id/evaluate` with candidateId + signals
     - Mock LLM returns `{ verdict: 'commit', ... }`
     - Assert: response has `commitMemo` with `verdict: 'commit'`
  6. Step 5 — Forge: POST `/api/decisions/:id/forge` with `{ confirmation: true }`
     - Assert: response has `forgeReady: true`

### Step 3: Write GP-2 — Governance golden path integration test

- **File**: `src/routes/decisions.test.ts`
- **Reference**: `governance-regime-v0.md` Section 18
- **Key changes**:
  1. Step 1 — Start: `{ userMessage: "I want to open a self-operating place, let AI manage it" }`
     - Mock LLM classifies as `governance`
  2. Step 2 — Path check: assert `route === 'space-builder'`
  3. Step 3 — Space build: mock LLM returns governance candidates with `worldForm` fields
     - Assert candidates include world form candidates (market, night_engine, etc.)
  4. Step 4 — Evaluate: mock governance evaluator returns commit
     - Assert: `commitMemo` has governance-specific fields (`selectedWorldForm`, `minimumWorldShape`)
  5. Step 5 — Forge: confirm → `forgeReady: true`

### Step 4: Write GP-3 — Forge-fast-path shortcut test

- **File**: `src/routes/decisions.test.ts`
- **Reference**: `intent-router-and-space-builder.md` Section 12 (path-check forge-fast-path)
- **Key changes**:
  1. Step 1 — Start: `{ userMessage: "Build me a video generation workflow install service for design studios" }`
     - Mock LLM classifies as `economic` with high confidence
  2. Step 2 — Path check: mock returns `route === 'forge-fast-path'`
  3. Assert: response indicates skip to forge, no space-build needed
  4. Verify that calling space-build after forge-fast-path either skips or returns pre-fixed candidate

### Step 5: Write CONTRACT validation tests

- **File**: `src/routes/decisions.test.ts`
- **Reference**: `docs/plan-world-design/CONTRACT.md`
- **Key changes**:
  1. COND-02 check: verify no endpoint makes more than 2 LLM calls
     ```typescript
     it('COND-02: each endpoint makes at most 2 LLM calls', async () => {
       // Track mockCreate.mock.calls.length between each endpoint call
       // Assert delta ≤ 2 for each
     });
     ```
  2. SETTLE-01 check: verify forge endpoint requires explicit `confirmation: true`
     ```typescript
     it('SETTLE-01: forge rejects without confirmation', async () => {
       const res = await app.request('/api/decisions/sess1/forge', {
         method: 'POST', body: JSON.stringify({}),
       });
       expect(res.status).toBe(400);
     });
     ```
  3. LAYER-01 check: verify decision modules do not import conductor/cards/settlement
     ```typescript
     it('LAYER-01: decision/ does not import conductor/cards/settlement', () => {
       // This is verified by grep in acceptance criteria, included here as documentation
     });
     ```
  4. TYPE-01 check: no `any` in decision modules (verified by `bun run build`)

### Step 6: Full system verification

- **File**: no new file — verification commands only
- **Reference**: `CLAUDE.md` Zero Lint Tolerance
- **Key changes**:
  1. Run full build:
     ```bash
     bun run build     # tsc --noEmit, zero errors
     bun run lint      # eslint src/, zero errors
     bun test          # all tests pass
     ```
  2. Run CONTRACT verification:
     ```bash
     # LAYER-01
     grep -r "from.*conductor\|from.*cards\|from.*settlement" src/decision/ --include="*.ts" | wc -l
     # Expected: 0

     # TYPE-01
     grep -r "as any\|: any\|@ts-ignore" src/decision/ src/routes/decisions.ts --include="*.ts" | wc -l
     # Expected: 0

     # SHARED-01: no duplicate type definitions in decision/
     grep -c "^export type\|^type " src/decision/*.ts | grep -v ":0"
     # Expected: only internal helper types
     ```

---

## Acceptance Criteria

```bash
# 1. Full build passes
bun run build

# 2. Lint passes
bun run lint

# 3. All tests pass
bun test

# 4. Forge handoff tests pass
bun test src/decision/forge-handoff.test.ts

# 5. Decision routes tests pass (golden paths)
bun test src/routes/decisions.test.ts

# 6. CONTRACT LAYER-01 verified
grep -r "from.*conductor\|from.*cards\|from.*settlement" src/decision/ --include="*.ts" | wc -l
# Expected: 0

# 7. CONTRACT TYPE-01 verified
grep -r "as any\|: any\|@ts-ignore" src/decision/ src/routes/decisions.ts src/schemas/decision.ts --include="*.ts" | wc -l
# Expected: 0

# 8. All Track A-F tests pass together
bun test src/schemas/decision.test.ts
bun test src/decision/
bun test src/routes/decisions.test.ts
```

## Git Commit

```
feat(decision): add e2e tests with economic, governance, and fast-path golden paths

GP-1: economic regime full pipeline (classify → path-check → space-build → evaluate → forge).
GP-2: governance regime full pipeline with world form selection.
GP-3: forge-fast-path shortcut for high-certainty paths.
CONTRACT validation: COND-02 (≤2 LLM/request), SETTLE-01 (confirmation required),
LAYER-01 (decision/ independence), TYPE-01 (no any).
Full system: bun run build && bun run lint && bun test zero errors.
```
