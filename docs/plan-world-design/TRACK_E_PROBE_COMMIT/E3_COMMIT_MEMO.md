# E3: Commit Memo Generation + Full Track E Tests

> **Module**: `src/decision/commit-memo.ts`, `src/decision/probe-shell.test.ts`, `src/decision/evaluators/economic.test.ts`, `src/decision/evaluators/governance.test.ts`, `src/decision/commit-memo.test.ts`
> **Layer**: L3
> **Dependencies**: A1（Zod Schemas — CommitMemo, EconomicCommitMemo, GovernanceCommitMemo, EvaluatorOutput, RealizationCandidate）, E1（Probe Shell）, E2（Regime Evaluators）
> **Blocks**: F1（Decision Routes）, F2（Forge Handoff）

---

## Bootstrap Instructions

```bash
# 1. Read shared types
cat src/schemas/decision.ts

# 2. Read E1 and E2 outputs
cat src/decision/probe-shell.ts
cat src/decision/evaluators/types.ts
cat src/decision/evaluators/economic.ts
cat src/decision/evaluators/governance.ts

# 3. Read spec on commit memo
cat docs/world-design-v0/probe-commit.md               # Section 19 (CommitMemo v0)
cat docs/world-design-v0/economic-regime-v0.md          # Section 17 (EconomicCommitMemo)
cat docs/world-design-v0/governance-regime-v0.md         # Section 15-16 (governance commit)

# 4. Read contracts
cat docs/plan-world-design/CONTRACT.md                  # TEST-01

# 5. Verify baseline
bun run build
```

---

## Final Result

- `src/decision/commit-memo.ts` exports `buildCommitMemo(evaluatorOutput, candidate): CommitMemo`
- Pure function — no LLM call
- Economic regime → `EconomicCommitMemo` with `buyerHypothesis`, `painHypothesis`, `paymentEvidence`, `whyThisVehicleNow`, `nextSignalAfterBuild`
- Governance regime → `GovernanceCommitMemo` with `selectedWorldForm`, `minimumWorldShape`, `stateDensityAssessment`, `governancePressureAssessment`, `firstCycleDesign`, `thyraHandoffRequirements`
- Full test suite for all Track E modules
- `bun test` all Track E tests pass

---

## Implementation Steps

### Step 1: Implement `buildCommitMemo()` core function

- **File**: `src/decision/commit-memo.ts`
- **Reference**: `probe-commit.md` Section 19, `shared-types.md` §5.5
- **Key changes**:
  1. Import types:
     ```typescript
     import type {
       CommitMemo, EconomicCommitMemo, GovernanceCommitMemo,
       EvaluatorOutput, RealizationCandidate,
     } from '../schemas/decision';
     ```
  2. Function signature:
     ```typescript
     export function buildCommitMemo(
       evaluatorOutput: EvaluatorOutput,
       candidate: RealizationCandidate,
     ): CommitMemo
     ```
  3. Base memo assembly:
     ```typescript
     const baseMemo: CommitMemo = {
       candidateId: candidate.id,
       regime: candidate.regime,
       verdict: evaluatorOutput.verdict,
       rationale: evaluatorOutput.rationale,
       evidenceUsed: evaluatorOutput.evidenceUsed,
       unresolvedRisks: evaluatorOutput.unresolvedRisks,
       whatForgeShouldBuild: deriveWhatToBuild(evaluatorOutput, candidate),
       whatForgeMustNotBuild: deriveWhatNotToBuild(evaluatorOutput, candidate),
       recommendedNextStep: evaluatorOutput.recommendedNextStep,
     };
     ```
  4. Route to regime-specific builder:
     ```typescript
     if (candidate.regime === 'economic') {
       return buildEconomicCommitMemo(baseMemo, evaluatorOutput, candidate);
     }
     if (candidate.regime === 'governance') {
       return buildGovernanceCommitMemo(baseMemo, evaluatorOutput, candidate);
     }
     return baseMemo;
     ```

### Step 2: Implement `buildEconomicCommitMemo()` specialization

- **File**: `src/decision/commit-memo.ts`
- **Reference**: `economic-regime-v0.md` Section 17, `shared-types.md` §5.6
- **Key changes**:
  1. Internal function:
     ```typescript
     function buildEconomicCommitMemo(
       base: CommitMemo,
       output: EvaluatorOutput,
       candidate: RealizationCandidate,
     ): EconomicCommitMemo
     ```
  2. Extract economic-specific fields from `output.handoffNotes` and `candidate`:
     ```typescript
     return {
       ...base,
       buyerHypothesis: extractBuyerHypothesis(output, candidate),
       painHypothesis: extractPainHypothesis(output, candidate),
       paymentEvidence: output.evidenceUsed.filter(e => isPaymentRelated(e)),
       whyThisVehicleNow: candidate.whyThisCandidate,
       nextSignalAfterBuild: output.recommendedNextStep,
     };
     ```

### Step 3: Implement `buildGovernanceCommitMemo()` specialization

- **File**: `src/decision/commit-memo.ts`
- **Reference**: `governance-regime-v0.md` Section 15-16, `shared-types.md` §5.7
- **Key changes**:
  1. Internal function:
     ```typescript
     function buildGovernanceCommitMemo(
       base: CommitMemo,
       output: EvaluatorOutput,
       candidate: RealizationCandidate,
     ): GovernanceCommitMemo
     ```
  2. Extract governance-specific fields:
     ```typescript
     return {
       ...base,
       selectedWorldForm: candidate.worldForm ?? 'market',
       minimumWorldShape: candidate.notes,
       stateDensityAssessment: 'medium',     // derived from signals in output
       governancePressureAssessment: 'medium', // derived from signals in output
       firstCycleDesign: extractCycleDesign(output),
       thyraHandoffRequirements: extractThyraRequirements(output, candidate),
     };
     ```

### Step 4: Implement helper functions

- **File**: `src/decision/commit-memo.ts`
- **Reference**: `probe-commit.md` Section 19 (`whatForgeShouldBuild`, `whatForgeMustNotBuild`)
- **Key changes**:
  1. `deriveWhatToBuild(output, candidate)`: extract build targets from `output.recommendedNextStep` and `output.handoffNotes`
  2. `deriveWhatNotToBuild(output, candidate)`: for economic = "full product before buyer validation", for governance = "dashboard instead of world"
  3. `extractBuyerHypothesis(output, candidate)`: derive from candidate `description` + `assumptions`
  4. `extractPainHypothesis(output, candidate)`: derive from candidate `whyThisCandidate`
  5. `isPaymentRelated(evidence)`: check if evidence string contains payment/buyer/price keywords
  6. `extractCycleDesign(output)`: derive from `output.recommendedNextStep` for governance
  7. `extractThyraRequirements(output, candidate)`: derive from candidate `notes` + `assumptions`

### Step 5: Write probe-shell tests

- **File**: `src/decision/probe-shell.test.ts`
- **Reference**: E1 implementation, `probe-commit.md` Section 8-9
- **Key changes**:
  1. Test: `isProbeReady` returns `false` for candidate with empty `whyThisCandidate`
  2. Test: `isProbeReady` returns `true` for valid candidate
  3. Test: `packageProbe` produces valid `ProbeableForm` with all 5 fields
  4. Test: `packageProbe` derives correct `testTarget` for economic vs governance
  5. Test: `recordSignal` assembles valid `SignalPacket`
  6. Test: `recordSignal` preserves all evidence fields

### Step 6: Write evaluator tests

- **File**: `src/decision/evaluators/economic.test.ts`
- **Reference**: E2 implementation, `probe-commit-evaluators.md` Section 6
- **Key changes**:
  1. Mock LLM client (same pattern as D3)
  2. Test: returns `commit` verdict when strong buyer + payment signals
  3. Test: returns `hold` when signals are weak
  4. Test: returns `hold` on LLM failure (graceful degradation)

- **File**: `src/decision/evaluators/governance.test.ts`
- **Reference**: E2 implementation, `probe-commit-evaluators.md` Section 10
- **Key changes**:
  1. Mock LLM client
  2. Test: returns `commit` when world density + closure signals are strong
  3. Test: returns `discard` when world is tool-in-clothing
  4. Test: returns `hold` on LLM failure

### Step 7: Write commit-memo tests

- **File**: `src/decision/commit-memo.test.ts`
- **Reference**: `probe-commit.md` Section 19, `shared-types.md` §5.5-5.7
- **Key changes**:
  1. Test: economic candidate → `EconomicCommitMemo` with `buyerHypothesis` populated
     ```typescript
     it('builds EconomicCommitMemo for economic regime', () => {
       const memo = buildCommitMemo(economicOutput, economicCandidate);
       expect(memo.regime).toBe('economic');
       expect((memo as EconomicCommitMemo).buyerHypothesis).toBeDefined();
       expect((memo as EconomicCommitMemo).paymentEvidence).toBeDefined();
     });
     ```
  2. Test: governance candidate → `GovernanceCommitMemo` with `selectedWorldForm` populated
  3. Test: unknown regime → base `CommitMemo` (no specialization crash)
  4. Test: `whatForgeShouldBuild` is always populated
  5. Test: `whatForgeMustNotBuild` is always populated
  6. Test: `verdict` matches evaluator output verdict

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Module exports buildCommitMemo
grep -n "export function buildCommitMemo" src/decision/commit-memo.ts

# 4. All Track E tests pass
bun test src/decision/probe-shell.test.ts
bun test src/decision/evaluators/economic.test.ts
bun test src/decision/evaluators/governance.test.ts
bun test src/decision/commit-memo.test.ts

# 5. Pure function — no LLM import in commit-memo
grep -n "from.*llm" src/decision/commit-memo.ts | wc -l
# Expected: 0

# 6. No 'any' usage (CONTRACT TYPE-01)
grep -rn "as any\|: any" src/decision/commit-memo.ts src/decision/probe-shell.test.ts src/decision/evaluators/*.test.ts src/decision/commit-memo.test.ts | wc -l
# Expected: 0

# 7. Does not import from conductor/cards/settlement (CONTRACT LAYER-01)
grep -n "from.*conductor\|from.*cards\|from.*settlement" src/decision/commit-memo.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add commit-memo builder and full Track E tests

buildCommitMemo() assembles CommitMemo from EvaluatorOutput + candidate.
Economic → EconomicCommitMemo (buyer/pain/payment fields).
Governance → GovernanceCommitMemo (worldForm/density/cycle fields).
Full test suite for probe-shell, economic evaluator, governance
evaluator, and commit-memo. Per CONTRACT TEST-01.
```
