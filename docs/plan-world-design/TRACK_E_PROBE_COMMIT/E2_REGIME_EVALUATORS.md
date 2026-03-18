# E2: Regime Evaluators (Economic + Governance)

> **Module**: `src/decision/evaluators/types.ts`, `src/decision/evaluators/economic.ts`, `src/decision/evaluators/governance.ts`
> **Layer**: L3
> **Dependencies**: A1（Zod Schemas — EvaluatorInput, EvaluatorOutput, Regime, RealizationCandidate, ProbeableForm, SignalPacket）, E1（Probe Shell — ProbeableForm, SignalPacket）
> **Blocks**: E3（Commit Memo）, F1（Decision Routes）

---

## Bootstrap Instructions

```bash
# 1. Read shared types
cat src/schemas/decision.ts

# 2. Read probe shell (E1 output)
cat src/decision/probe-shell.ts

# 3. Read evaluator specs
cat docs/world-design-v0/probe-commit-evaluators.md    # Section 6 (economic), Section 10 (governance), Section 14 (interface)
cat docs/world-design-v0/economic-regime-v0.md          # Section 15-16 (signal review, commit threshold)
cat docs/world-design-v0/governance-regime-v0.md         # Section 15 (governance commit)

# 4. Read LLM client pattern
cat src/llm/client.ts

# 5. Read contracts
cat docs/plan-world-design/CONTRACT.md

# 6. Verify baseline
bun run build
```

---

## Final Result

- `src/decision/evaluators/types.ts` exports `Evaluator` interface
- `src/decision/evaluators/economic.ts` exports `evaluateEconomic(llm, input): Promise<EvaluatorOutput>`
- `src/decision/evaluators/governance.ts` exports `evaluateGovernance(llm, input): Promise<EvaluatorOutput>`
- Both use LLM with Zod schema for signal interpretation (CONTRACT LLM-01 + LLM-02)
- Economic evaluator checks: buyer signal, payment evidence, delivery feasibility, build-is-bottleneck
- Governance evaluator checks: world density, closure existence, consequence visibility, build-is-bottleneck
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Define evaluator interface in types.ts

- **File**: `src/decision/evaluators/types.ts`
- **Reference**: `probe-commit-evaluators.md` Section 14 (canonical evaluator interface), `shared-types.md` §5.3-5.4
- **Key changes**:
  1. Import from schemas:
     ```typescript
     import type { EvaluatorInput, EvaluatorOutput } from '../../schemas/decision';
     import type { LLMClient } from '../../llm/client';
     ```
  2. Define interface:
     ```typescript
     export interface Evaluator {
       evaluate(llm: LLMClient, input: EvaluatorInput): Promise<EvaluatorOutput>;
     }
     ```
  3. This is the only shared type in `evaluators/` — all data types come from `schemas/decision.ts` (CONTRACT SHARED-01)

### Step 2: Implement economic evaluator

- **File**: `src/decision/evaluators/economic.ts`
- **Reference**: `probe-commit-evaluators.md` Section 6, `economic-regime-v0.md` Section 15-16
- **Key changes**:
  1. Import types and LLM client:
     ```typescript
     import type { EvaluatorInput, EvaluatorOutput } from '../../schemas/decision';
     import { EvaluatorOutputSchema } from '../../schemas/decision';
     import type { LLMClient } from '../../llm/client';
     ```
  2. Define system prompt `ECONOMIC_EVALUATOR_PROMPT` that instructs LLM to assess:
     - **Buyer shape exists**: Is there a specific buyer type, pain, context?
     - **Payment-adjacent signal exists**: Are there price conversations, trial willingness, booking requests?
     - **Delivery looks possible**: Can the user actually fulfill?
     - **Build is now the bottleneck**: Would building unlock the next signal?
  3. Function signature:
     ```typescript
     export async function evaluateEconomic(
       llm: LLMClient,
       input: EvaluatorInput,
     ): Promise<EvaluatorOutput>
     ```
  4. Build evaluation prompt from `input.candidate`, `input.probeableForm`, `input.signals`
  5. Call `llm.generateStructured()` with `EvaluatorOutputSchema`:
     ```typescript
     try {
       const result = await llm.generateStructured({
         system: ECONOMIC_EVALUATOR_PROMPT,
         messages: [{ role: 'user', content: buildEconomicPrompt(input) }],
         schema: EvaluatorOutputSchema,
         schemaDescription: 'Economic evaluator verdict with rationale',
       });
       if (!result.ok) {
         return defaultHoldOutput('Economic evaluation failed: ' + result.error);
       }
       return result.data;
     } catch (error) {
       return defaultHoldOutput(error instanceof Error ? error.message : 'Unknown error');
     }
     ```
  6. `defaultHoldOutput()` helper returns a conservative `hold` verdict on failure (graceful degradation)

### Step 3: Implement governance evaluator

- **File**: `src/decision/evaluators/governance.ts`
- **Reference**: `probe-commit-evaluators.md` Section 10, `governance-regime-v0.md` Section 15
- **Key changes**:
  1. Same import pattern as economic evaluator
  2. Define system prompt `GOVERNANCE_EVALUATOR_PROMPT` that instructs LLM to assess:
     - **Minimum world has shape**: Are state/change/role/metrics defined?
     - **One closure exists**: Can observe→propose→judge→apply→outcome→precedent run?
     - **Consequences are visible**: Does changing the world produce observable results?
     - **Build will instantiate a world, not a dashboard**: Is this governance, not a tool?
  3. Function signature:
     ```typescript
     export async function evaluateGovernance(
       llm: LLMClient,
       input: EvaluatorInput,
     ): Promise<EvaluatorOutput>
     ```
  4. Build evaluation prompt from `input.candidate` (check for `worldForm` field), `input.probeableForm`, `input.signals`
  5. Call `llm.generateStructured()` with `EvaluatorOutputSchema` — same pattern as economic
  6. Same `defaultHoldOutput()` fallback on failure

### Step 4: Implement `defaultHoldOutput()` shared helper

- **File**: `src/decision/evaluators/types.ts`
- **Reference**: `CLAUDE.md` (LLM fire-and-forget / graceful degradation)
- **Key changes**:
  1. Export helper:
     ```typescript
     export function defaultHoldOutput(reason: string): EvaluatorOutput {
       return {
         verdict: 'hold',
         rationale: ['Evaluation could not complete: ' + reason],
         evidenceUsed: [],
         unresolvedRisks: ['Evaluation incomplete'],
         recommendedNextStep: ['Retry evaluation with more context'],
       };
     }
     ```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Interface exported
grep -n "export interface Evaluator" src/decision/evaluators/types.ts

# 4. Both evaluators exported
grep -n "export async function evaluateEconomic" src/decision/evaluators/economic.ts
grep -n "export async function evaluateGovernance" src/decision/evaluators/governance.ts

# 5. LLM calls use Zod schema (CONTRACT LLM-01)
grep -n "generateStructured" src/decision/evaluators/economic.ts
grep -n "generateStructured" src/decision/evaluators/governance.ts

# 6. LLM calls have try/catch (CONTRACT LLM-02)
grep -n "try {" src/decision/evaluators/economic.ts
grep -n "try {" src/decision/evaluators/governance.ts

# 7. No 'any' usage (CONTRACT TYPE-01)
grep -rn "as any\|: any" src/decision/evaluators/ | wc -l
# Expected: 0

# 8. Does not import from conductor/cards/settlement (CONTRACT LAYER-01)
grep -rn "from.*conductor\|from.*cards\|from.*settlement" src/decision/evaluators/ | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add economic and governance regime evaluators

Economic evaluator: buyer signal + payment evidence → verdict.
Governance evaluator: world density + closure + consequence → verdict.
Both use LLM with Zod schema validation (CONTRACT LLM-01/02).
Graceful degradation returns 'hold' on evaluation failure.
```
