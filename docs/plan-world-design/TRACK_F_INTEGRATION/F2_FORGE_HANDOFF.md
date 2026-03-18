# F2: Forge Handoff — CommitMemo to Settlement Builders

> **Module**: `src/decision/forge-handoff.ts`
> **Layer**: L4
> **Dependencies**: A1（Zod Schemas — CommitMemo, EconomicCommitMemo, GovernanceCommitMemo）, E3（Commit Memo）
> **Blocks**: F3（E2E Tests）

---

## Bootstrap Instructions

```bash
# 1. Read shared types
cat src/schemas/decision.ts

# 2. Read commit memo module (E3 output)
cat src/decision/commit-memo.ts

# 3. Read existing settlement builders
cat src/settlement/village-pack-builder.ts
cat src/settlement/workflow-spec-builder.ts
cat src/settlement/task-spec-builder.ts

# 4. Read forge handoff spec
cat docs/world-design-v0/forge-handoff-v0.md

# 5. Read contracts
cat docs/plan-world-design/CONTRACT.md     # LAYER-01 exception: forge-handoff is assembly layer

# 6. Verify baseline
bun run build
```

---

## Final Result

- `src/decision/forge-handoff.ts` exports `translateToSettlement(commitMemo): SettlementPayload`
- Pure function — no LLM call
- Economic regime → maps to task/workflow settlement payload (compatible with `buildWorkflowSpec` / `buildTaskSpec` inputs)
- Governance regime → maps to village_pack settlement payload (compatible with `buildVillagePack` input)
- Returns structured payload that routes layer can pass to existing settlement builders
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Define SettlementPayload type

- **File**: `src/decision/forge-handoff.ts`
- **Reference**: `forge-handoff-v0.md` Section 3 (Forge output by regime), existing settlement builder interfaces
- **Key changes**:
  1. Import types:
     ```typescript
     import type {
       CommitMemo, EconomicCommitMemo, GovernanceCommitMemo, WorldForm,
     } from '../schemas/decision';
     ```
  2. Define payload types (internal to this module):
     ```typescript
     type EconomicSettlementPayload = {
       kind: 'economic';
       taskSpec: {
         intent: string;
         inputs: Record<string, string>;
         constraints: string[];
         success_condition: string;
       };
       workflowHints: {
         name: string;
         purpose: string;
         steps: string[];
       };
     };

     type GovernanceSettlementPayload = {
       kind: 'governance';
       villagePack: {
         name: string;
         target_repo: string;
         worldForm: WorldForm;
         constitutionHints: {
           rules: string[];
           allowed_permissions: string[];
         };
         minimumWorldShape: string[];
         firstCycleDesign: string[];
       };
     };

     export type SettlementPayload = EconomicSettlementPayload | GovernanceSettlementPayload;
     ```

### Step 2: Implement `translateToSettlement()` main function

- **File**: `src/decision/forge-handoff.ts`
- **Reference**: `forge-handoff-v0.md` Section 2-3, Section 6 (v0 pass-through)
- **Key changes**:
  1. Function signature:
     ```typescript
     export function translateToSettlement(commitMemo: CommitMemo): SettlementPayload
     ```
  2. Route by regime using type guards (CONTRACT TYPE-01: no unsafe casts):
     ```typescript
     if (isEconomicCommitMemo(commitMemo)) {
       return translateEconomic(commitMemo);
     }
     if (isGovernanceCommitMemo(commitMemo)) {
       return translateGovernance(commitMemo);
     }
     // Fallback for unsupported regimes in v0: produce generic task payload
     return translateGenericFallback(commitMemo);
     ```
  3. Type guards use `regime` field as discriminant:
     ```typescript
     function isEconomicCommitMemo(memo: CommitMemo): memo is EconomicCommitMemo {
       return memo.regime === 'economic' && 'buyerHypothesis' in memo;
     }
     function isGovernanceCommitMemo(memo: CommitMemo): memo is GovernanceCommitMemo {
       return memo.regime === 'governance' && 'selectedWorldForm' in memo;
     }
     ```

### Step 3: Implement `translateEconomic()` — CommitMemo to task/workflow

- **File**: `src/decision/forge-handoff.ts`
- **Reference**: `forge-handoff-v0.md` Section 3 (economic row), `economic-regime-v0.md` Section 18
- **Key changes**:
  1. Internal function:
     ```typescript
     function translateEconomic(memo: EconomicCommitMemo): EconomicSettlementPayload
     ```
  2. Map CommitMemo fields to task spec:
     ```typescript
     return {
       kind: 'economic',
       taskSpec: {
         intent: memo.buyerHypothesis || memo.rationale.join('; '),
         inputs: {
           buyer: memo.buyerHypothesis || '',
           pain: memo.painHypothesis || '',
           vehicle: memo.whyThisVehicleNow.join(', ') || '',
         },
         constraints: memo.whatForgeMustNotBuild,
         success_condition: memo.nextSignalAfterBuild?.[0] || 'First paying customer',
       },
       workflowHints: {
         name: `${memo.candidateId}-delivery`,
         purpose: memo.rationale[0] || 'Economic delivery workflow',
         steps: memo.whatForgeShouldBuild,
       },
     };
     ```

### Step 4: Implement `translateGovernance()` — CommitMemo to village_pack

- **File**: `src/decision/forge-handoff.ts`
- **Reference**: `forge-handoff-v0.md` Section 3 (governance row), `governance-regime-v0.md` Section 16
- **Key changes**:
  1. Internal function:
     ```typescript
     function translateGovernance(memo: GovernanceCommitMemo): GovernanceSettlementPayload
     ```
  2. Map CommitMemo fields to village pack:
     ```typescript
     return {
       kind: 'governance',
       villagePack: {
         name: `world-${memo.selectedWorldForm}-${memo.candidateId.slice(0, 8)}`,
         target_repo: '',  // to be filled by user at settlement time
         worldForm: memo.selectedWorldForm,
         constitutionHints: {
           rules: memo.whatForgeShouldBuild,
           allowed_permissions: [],  // derived at settlement time
         },
         minimumWorldShape: memo.minimumWorldShape,
         firstCycleDesign: memo.firstCycleDesign,
       },
     };
     ```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Module exports translateToSettlement
grep -n "export function translateToSettlement" src/decision/forge-handoff.ts

# 4. SettlementPayload type exported
grep -n "export type SettlementPayload" src/decision/forge-handoff.ts

# 5. Pure function — no LLM import
grep -n "from.*llm" src/decision/forge-handoff.ts | wc -l
# Expected: 0

# 6. No 'any' usage (CONTRACT TYPE-01)
grep -n "as any\|: any" src/decision/forge-handoff.ts | wc -l
# Expected: 0

# 7. Note: forge-handoff is in decision/ but references settlement types.
# It does NOT import settlement modules directly — it produces compatible payloads.
# The routes layer connects forge-handoff output to settlement builders.
grep -n "from.*settlement" src/decision/forge-handoff.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add forge-handoff translating CommitMemo to settlement

translateToSettlement() maps Economic CommitMemo to task/workflow
payload and Governance CommitMemo to village_pack payload. Pure
function producing settlement-compatible shapes for routes layer
to pass to existing builders.
```
