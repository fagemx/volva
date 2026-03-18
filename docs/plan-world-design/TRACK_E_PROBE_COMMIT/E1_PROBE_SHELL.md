# E1: Shell — Probe Packaging + Signal Packets

> **Module**: `src/decision/probe-shell.ts`
> **Layer**: L3
> **Dependencies**: A1（Zod Schemas — RealizationCandidate, ProbeableForm, SignalPacket, Regime）, D1（Space Builder output）
> **Blocks**: E2（Regime Evaluators）, E3（Commit Memo）, F1（Decision Routes）

---

## Bootstrap Instructions

```bash
# 1. Read shared types
cat src/schemas/decision.ts

# 2. Read spec on probe-commit shell
cat docs/world-design-v0/probe-commit.md                  # Section 5-9 (shell architecture)
cat docs/world-design-v0/probe-commit-evaluators.md        # Section 4 (shell responsibilities)

# 3. Read space builder output format
cat src/decision/space-builder.ts
cat src/decision/kill-filters.ts

# 4. Read contracts
cat docs/plan-world-design/CONTRACT.md

# 5. Verify baseline
bun run build
```

---

## Final Result

- `src/decision/probe-shell.ts` exports:
  - `packageProbe(candidate: RealizationCandidate): ProbeableForm`
  - `recordSignal(probeId: string, candidateId: string, regime: Regime, evidence: SignalEvidence): SignalPacket`
- Both are pure functions — no LLM call
- `packageProbe` converts a `RealizationCandidate` into `ProbeableForm` with the 5 required fields (hypothesis, testTarget, judge, cheapestBelievableProbe, disconfirmers)
- `recordSignal` normalizes raw evidence into a structured `SignalPacket`
- Pre-probe kill filter: `isProbeReady(candidate: RealizationCandidate): boolean`
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Implement `isProbeReady()` pre-probe disqualification

- **File**: `src/decision/probe-shell.ts`
- **Reference**: `probe-commit.md` Section 6 ("not all candidates are worth probing"), `probe-commit-evaluators.md` Section 4.2
- **Key changes**:
  1. Import types:
     ```typescript
     import type { RealizationCandidate, ProbeableForm, SignalPacket, Regime } from '../schemas/decision';
     ```
  2. Function signature:
     ```typescript
     export function isProbeReady(candidate: RealizationCandidate): boolean
     ```
  3. Disqualify if:
     - `candidate.whyThisCandidate` is empty
     - `candidate.assumptions` is empty
     - `candidate.probeReadinessHints` is undefined or empty
  4. Return `true` only if all three are populated

### Step 2: Implement `packageProbe()` — candidate to ProbeableForm

- **File**: `src/decision/probe-shell.ts`
- **Reference**: `probe-commit.md` Section 8-9 (ProbeableForm 5 fields), `probe-commit-evaluators.md` Section 4.2
- **Key changes**:
  1. Function signature:
     ```typescript
     export function packageProbe(candidate: RealizationCandidate): ProbeableForm
     ```
  2. Map candidate fields to ProbeableForm:
     ```typescript
     return {
       candidateId: candidate.id,
       regime: candidate.regime,
       hypothesis: candidate.whyThisCandidate.join('; '),
       testTarget: deriveTestTarget(candidate),
       judge: deriveJudge(candidate),
       cheapestBelievableProbe: deriveCheapestProbe(candidate),
       disconfirmers: deriveDisconfirmers(candidate),
     };
     ```
  3. Internal helpers (not exported):
     - `deriveTestTarget(candidate)`: for economic = "buyer willingness to pay for {vehicle}", for governance = "world density of {worldForm}"
     - `deriveJudge(candidate)`: for economic = "potential buyer", for governance = "world state/change closure"
     - `deriveCheapestProbe(candidate)`: for economic = "direct offer / landing page CTA", for governance = "minimum state instantiation"
     - `deriveDisconfirmers(candidate)`: extract from `candidate.assumptions` — negate each assumption

### Step 3: Define `SignalEvidence` input type and implement `recordSignal()`

- **File**: `src/decision/probe-shell.ts`
- **Reference**: `probe-commit.md` Section 15 (signal packet), `shared-types.md` §5.2
- **Key changes**:
  1. Define `SignalEvidence` type (internal, exported for routes):
     ```typescript
     export type SignalEvidence = {
       signalType: string;
       strength: 'weak' | 'moderate' | 'strong';
       evidence: string[];
       negativeEvidence?: string[];
       interpretation: string;
       nextQuestions: string[];
     };
     ```
  2. Function signature:
     ```typescript
     export function recordSignal(
       probeId: string,
       candidateId: string,
       regime: Regime,
       evidence: SignalEvidence,
     ): SignalPacket
     ```
  3. Implementation — assemble `SignalPacket`:
     ```typescript
     return {
       candidateId,
       probeId,
       regime,
       signalType: evidence.signalType,
       strength: evidence.strength,
       evidence: evidence.evidence,
       negativeEvidence: evidence.negativeEvidence,
       interpretation: evidence.interpretation,
       nextQuestions: evidence.nextQuestions,
     };
     ```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Module exports all functions
grep -n "export function packageProbe" src/decision/probe-shell.ts
grep -n "export function recordSignal" src/decision/probe-shell.ts
grep -n "export function isProbeReady" src/decision/probe-shell.ts

# 4. Pure functions — no LLM import
grep -n "from.*llm" src/decision/probe-shell.ts | wc -l
# Expected: 0

# 5. No 'any' usage (CONTRACT TYPE-01)
grep -n "as any\|: any" src/decision/probe-shell.ts | wc -l
# Expected: 0

# 6. Does not import from conductor/cards/settlement (CONTRACT LAYER-01)
grep -n "from.*conductor\|from.*cards\|from.*settlement" src/decision/probe-shell.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add probe-shell with packaging and signal recording

Pure functions: packageProbe() converts RealizationCandidate to
ProbeableForm (5 fields per spec), recordSignal() normalizes evidence
into SignalPacket. isProbeReady() pre-disqualifies unready candidates.
```
