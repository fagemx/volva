# D2: Constrain — Kill Filters + Pruning

> **Module**: `src/decision/kill-filters.ts`
> **Layer**: L2
> **Dependencies**: A1（Zod Schemas — Regime, RealizationCandidate）, D1（Space Builder — buildSpace output）
> **Blocks**: D3（Regime Configs + Tests）, E1（Probe Shell）, F1（Decision Routes）

---

## Bootstrap Instructions

```bash
# 1. Read shared types
cat src/schemas/decision.ts

# 2. Read space builder (D1 output)
cat src/decision/space-builder.ts

# 3. Read spec sections on kill filters
cat docs/world-design-v0/intent-router-and-space-builder.md   # Section 7 (constrain)
cat docs/world-design-v0/probe-commit.md                      # Section 6-7 (kill filters)
cat docs/world-design-v0/economic-regime-v0.md                # Section 11 (economic kill filters)
cat docs/world-design-v0/governance-regime-v0.md              # Section 12 (governance kill filters)

# 4. Read contracts
cat docs/plan-world-design/CONTRACT.md

# 5. Verify baseline compiles
bun run build
```

---

## Final Result

- `src/decision/kill-filters.ts` exports `applyKillFilters(candidates, regime, constraints): RealizationCandidate[]`
- Pure function — no LLM call
- Returns only surviving candidates; each pruned candidate has a documented reason
- Economic regime filters: audience-first-buyer-unclear, build-first-signal-late, generic-tool-fantasy, education-trap, narrow-pain-broad-build
- Governance regime filters: fake-world, tool-in-world-clothing, too-large-before-closure, no-observable-consequence
- Common filters: edge-mismatch, constraint-violation, search-friction-too-high
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Define filter types and result structure

- **File**: `src/decision/kill-filters.ts`
- **Reference**: `probe-commit.md` Section 7, `shared-types.md` §4.1
- **Key changes**:
  1. Import types:
     ```typescript
     import type { RealizationCandidate, Regime } from '../schemas/decision';
     ```
  2. Define internal types (not in schemas — these are module-internal):
     ```typescript
     type FilterResult = {
       candidateId: string;
       killed: boolean;
       reason?: string;
       filterName: string;
     };

     type KillFilterFn = (
       candidate: RealizationCandidate,
       constraints: KillFilterConstraints,
     ) => FilterResult;

     type KillFilterConstraints = {
       edgeProfile?: string[];
       budget?: number;
       timeHorizon?: 'short' | 'medium' | 'long';
       maxSearchFriction?: 'low' | 'medium' | 'high';
     };
     ```
  3. Export `KillFilterConstraints` type for use by routes

### Step 2: Implement common kill filters

- **File**: `src/decision/kill-filters.ts`
- **Reference**: `intent-router-and-space-builder.md` Section 7 (edge, constraints, reversibility, search friction, regime-specific impossibilities)
- **Key changes**:
  1. `filterEdgeMismatch`: kill if candidate has no overlap with `constraints.edgeProfile`
     ```typescript
     function filterEdgeMismatch(candidate: RealizationCandidate, constraints: KillFilterConstraints): FilterResult {
       if (!constraints.edgeProfile || constraints.edgeProfile.length === 0) {
         return { candidateId: candidate.id, killed: false, filterName: 'edge-mismatch' };
       }
       // Check if any assumption or whyThisCandidate mentions edge terms
       const candidateText = [...candidate.whyThisCandidate, ...candidate.assumptions].join(' ').toLowerCase();
       const hasEdgeOverlap = constraints.edgeProfile.some(edge => candidateText.includes(edge.toLowerCase()));
       if (!hasEdgeOverlap) {
         return { candidateId: candidate.id, killed: true, reason: 'No overlap with user edge profile', filterName: 'edge-mismatch' };
       }
       return { candidateId: candidate.id, killed: false, filterName: 'edge-mismatch' };
     }
     ```
  2. `filterSearchFrictionTooHigh`: kill if `candidate.timeToSignal === 'long'` and `constraints.maxSearchFriction === 'low'`
  3. `filterConstraintViolation`: kill if candidate's `timeToSignal` exceeds `constraints.timeHorizon`

### Step 3: Implement economic-specific kill filters

- **File**: `src/decision/kill-filters.ts`
- **Reference**: `economic-regime-v0.md` Section 11 (5 economic kill filters)
- **Key changes**:
  1. `filterAudienceFirstBuyerUnclear`: kill if candidate requires audience building before any buyer signal
     - Check: `candidate.form === 'community_format'` and no `buyer` in `candidate.assumptions`
  2. `filterBuildFirstSignalLate`: kill if candidate requires heavy build before first signal
     - Check: `candidate.timeToSignal === 'long'` and `candidate.form` in `['tool', 'workflow_pack']`
  3. `filterGenericToolFantasy`: kill if candidate is a generic "everyone-can-use" tool
     - Check: `candidate.form === 'tool'` and description lacks specificity markers
  4. `filterEducationTrap`: kill if candidate is education content without clear buyer
     - Check: `candidate.form === 'learning_path'` in economic regime
  5. `filterNarrowPainBroadBuild`: kill if pain is narrow but build scope is broad
     - Check: heuristic based on assumptions length vs description specificity

### Step 4: Implement governance-specific kill filters

- **File**: `src/decision/kill-filters.ts`
- **Reference**: `governance-regime-v0.md` Section 12 (4 governance kill filters)
- **Key changes**:
  1. `filterFakeWorld`: kill if world has no state/change density references
     - Check: candidate `notes` and `assumptions` lack state/change/pressure keywords
  2. `filterToolInWorldClothing`: kill if candidate is essentially a tool/dashboard
     - Check: `candidate.description` dominated by tool/dashboard/admin terms
  3. `filterTooLargeBeforeClosure`: kill if candidate requires many roles/states for first closure
     - Check: heuristic on `assumptions` mentioning "many", "complex", "large-scale"
  4. `filterNoObservableConsequence`: kill if candidate has no outcome visibility
     - Check: `candidate.probeReadinessHints` empty or missing outcome-related hints

### Step 5: Implement main `applyKillFilters()` function

- **File**: `src/decision/kill-filters.ts`
- **Reference**: `probe-commit.md` Section 6 ("not all candidates are worth probing")
- **Key changes**:
  1. Function signature:
     ```typescript
     export function applyKillFilters(
       candidates: RealizationCandidate[],
       regime: Regime,
       constraints: KillFilterConstraints,
     ): RealizationCandidate[]
     ```
  2. Build filter list based on regime:
     ```typescript
     const commonFilters: KillFilterFn[] = [filterEdgeMismatch, filterSearchFrictionTooHigh, filterConstraintViolation];
     const economicFilters: KillFilterFn[] = [filterAudienceFirstBuyerUnclear, filterBuildFirstSignalLate, filterGenericToolFantasy, filterEducationTrap, filterNarrowPainBroadBuild];
     const governanceFilters: KillFilterFn[] = [filterFakeWorld, filterToolInWorldClothing, filterTooLargeBeforeClosure, filterNoObservableConsequence];

     const filters = [...commonFilters];
     if (regime === 'economic') filters.push(...economicFilters);
     if (regime === 'governance') filters.push(...governanceFilters);
     ```
  3. Run all filters on each candidate; a candidate is killed if ANY filter kills it
  4. Return only surviving candidates
  5. Log killed candidates with reasons via `console.debug('[kill-filters]', ...)`

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Module exports applyKillFilters
grep -n "export function applyKillFilters" src/decision/kill-filters.ts

# 4. Pure function — no LLM import
grep -n "from.*llm" src/decision/kill-filters.ts | wc -l
# Expected: 0

# 5. No 'any' usage (CONTRACT TYPE-01)
grep -n "as any\|: any" src/decision/kill-filters.ts | wc -l
# Expected: 0

# 6. Does not import from conductor/cards/settlement (CONTRACT LAYER-01)
grep -n "from.*conductor\|from.*cards\|from.*settlement" src/decision/kill-filters.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add kill-filters for candidate pruning

Pure function applyKillFilters() with common filters (edge mismatch,
search friction, constraint violation) + economic-specific (5 filters
from economic-regime-v0.md) + governance-specific (4 filters from
governance-regime-v0.md).
```
