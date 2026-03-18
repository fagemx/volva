# A1: Zod Schemas for Decision Pipeline Shared Types

> **Module**: `src/schemas/decision.ts`
> **Layer**: L0
> **Dependencies**: none (first task)
> **Blocks**: A2 (DB Schema), A3 (Session Manager), and all downstream Tracks (B-F)

---

## Bootstrap Instructions

```bash
cat docs/world-design-v0/shared-types.md       # canonical type definitions (Sections 1-6)
cat src/schemas/card.ts                          # existing Zod schema pattern
cat docs/plan-world-design/CONTRACT.md           # TYPE-01, SCHEMA-01, SHARED-01 rules
bun run build                                    # verify baseline compiles
```

---

## Final Result

- `src/schemas/decision.ts` contains Zod schemas for all shared types from `shared-types.md` Sections 1-5
- Section 6 types (WorldMode, CycleMode, Verdict, etc.) are **type-only exports** (no Zod runtime validation for v0)
- All enum values exactly match `shared-types.md`
- Export all Zod schemas + inferred TypeScript types
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Base Enums (Section 1)

```typescript
// src/schemas/decision.ts
import { z } from 'zod';

// ─── Section 1: Base Types ───

export const RegimeEnum = z.enum([
  'economic', 'capability', 'leverage', 'expression', 'governance', 'identity',
]);
export type Regime = z.infer<typeof RegimeEnum>;
```

### Step 2: Intent Router Types (Section 2)

```typescript
// ─── Section 2: Intent Router ───

export const IntentRouteSchema = z.object({
  primaryRegime: RegimeEnum,
  secondaryRegimes: z.array(RegimeEnum).optional(),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  rationale: z.array(z.string()),
  keyUnknowns: z.array(z.string()),
  suggestedFollowups: z.array(z.string()),
});
export type IntentRoute = z.infer<typeof IntentRouteSchema>;
```

### Step 3: Path Check Types (Section 3)

```typescript
// ─── Section 3: Path Check ───

const FixedElementKindEnum = z.enum(['intent', 'domain', 'form', 'buyer', 'loop', 'build_target']);

export const FixedElementSchema = z.object({
  kind: FixedElementKindEnum,
  value: z.string(),
});
export type FixedElement = z.infer<typeof FixedElementSchema>;

const UnresolvedElementKindEnum = z.enum(['domain', 'form', 'buyer', 'loop', 'build_target', 'signal']);

export const UnresolvedElementSchema = z.object({
  kind: UnresolvedElementKindEnum,
  reason: z.string(),
  severity: z.enum(['blocking', 'important', 'nice_to_have']),
});
export type UnresolvedElement = z.infer<typeof UnresolvedElementSchema>;

export const PathCheckResultSchema = z.object({
  certainty: z.enum(['low', 'medium', 'high']),
  route: z.enum(['space-builder', 'forge-fast-path', 'space-builder-then-forge']),
  fixedElements: z.array(FixedElementSchema),
  unresolvedElements: z.array(UnresolvedElementSchema),
  whyNotReady: z.array(z.string()).optional(),
  whyReady: z.array(z.string()).optional(),
  recommendedNextStep: z.string(),
});
export type PathCheckResult = z.infer<typeof PathCheckResultSchema>;
```

### Step 4: Space Builder Types (Section 4)

Define `RealizationFormEnum`, `WorldFormEnum`, `RealizationCandidateSchema`, `GovernanceWorldCandidateSchema`.

Key points:
- `RealizationForm` has 10 values (service, productized_service, tool, workflow_pack, learning_path, practice_loop, medium, world, operator_model, community_format)
- `WorldForm` has 6 values (market, commons, town, port, night_engine, managed_knowledge_field)
- `GovernanceWorldCandidateSchema` extends `RealizationCandidateSchema` using `.extend()` with:
  - `worldForm: WorldFormEnum` (required, not optional)
  - `stateDensity`, `changeClarity`, `governancePressure`, `outcomeVisibility`, `cycleability`: each `z.enum(['low', 'medium', 'high'])`
  - `likelyMinimumWorldShape: z.array(z.string())` — what the minimum world looks like
  - `mainRisks: z.array(z.string())` — key risks for this world form
  - Total: 7 additional fields per shared-types.md §4.2
- `timeToSignal` is `z.enum(['short', 'medium', 'long'])`

```typescript
export const RealizationFormEnum = z.enum([
  'service', 'productized_service', 'tool', 'workflow_pack', 'learning_path',
  'practice_loop', 'medium', 'world', 'operator_model', 'community_format',
]);
export type RealizationForm = z.infer<typeof RealizationFormEnum>;

export const WorldFormEnum = z.enum([
  'market', 'commons', 'town', 'port', 'night_engine', 'managed_knowledge_field',
]);
export type WorldForm = z.infer<typeof WorldFormEnum>;

export const RealizationCandidateSchema = z.object({
  id: z.string(),
  regime: RegimeEnum,
  form: RealizationFormEnum,
  domain: z.string().optional(),
  vehicle: z.string().optional(),
  worldForm: WorldFormEnum.optional(),
  description: z.string(),
  whyThisCandidate: z.array(z.string()),
  assumptions: z.array(z.string()),
  probeReadinessHints: z.array(z.string()).optional(),
  timeToSignal: z.enum(['short', 'medium', 'long']),
  notes: z.array(z.string()),
});
export type RealizationCandidate = z.infer<typeof RealizationCandidateSchema>;
```

### Step 5: Probe-Commit Types (Section 5)

Define `ProbeableFormSchema`, `SignalPacketSchema`, `EvaluatorInputSchema`, `EvaluatorOutputSchema`, `CommitMemoSchema`, `EconomicCommitMemoSchema`, `GovernanceCommitMemoSchema`.

Key points:
- `SignalPacket.signalType` is `z.string()` (not enum, regime-specific)
- `SignalPacket.strength` is `z.enum(['weak', 'moderate', 'strong'])`
- `CommitMemo.verdict` is `z.enum(['commit', 'hold', 'discard'])`
- `EconomicCommitMemoSchema` extends `CommitMemoSchema` using `.extend()`
- `GovernanceCommitMemoSchema` extends `CommitMemoSchema` using `.extend()`, includes `selectedWorldForm: WorldFormEnum`
- `EvaluatorInput.context` is `z.record(z.string(), z.unknown()).optional()`

### Step 6: Section 6 Type-Only Exports (Canonical Cycle)

These are **type-only** exports with no Zod runtime validation. They exist so downstream code can reference them for handoff schemas and governance evaluator output.

```typescript
// ─── Section 6: Canonical Cycle (type-only, no Zod for v0) ───

export type WorldMode = 'setup' | 'open' | 'peak' | 'managed' | 'cooldown' | 'closed';
export type CycleMode = 'normal' | 'peak' | 'incident' | 'shutdown';
export type Verdict = 'approved' | 'approved_with_constraints' | 'rejected'
  | 'simulation_required' | 'escalated' | 'deferred';

export type ChangeProposalStatus =
  | 'draft' | 'proposed' | 'judged' | 'approved' | 'approved_with_constraints'
  | 'rejected' | 'simulation_required' | 'escalated' | 'deferred'
  | 'applied' | 'cancelled' | 'rolled_back'
  | 'outcome_window_open' | 'outcome_closed' | 'archived';

export type ChangeKindMVP =
  | 'adjust_stall_capacity' | 'adjust_spotlight_weight'
  | 'throttle_entry' | 'pause_event' | 'modify_pricing_rule';

export type ChangeKind = ChangeKindMVP
  | 'resume_event' | 'reassign_zone_priority'
  | 'tighten_safety_threshold' | 'relax_safety_threshold'
  | 'law_patch' | 'chief_permission_patch';

export type OutcomeVerdict = 'beneficial' | 'neutral' | 'harmful' | 'inconclusive';
export type OutcomeRecommendation = 'reinforce' | 'retune' | 'watch' | 'rollback' | 'do_not_repeat';
```

Include all remaining Section 6 types (JudgmentReport, LayerResult, SimulationPlan, Concern, PulseFrame, OutcomeReport, ExpectedEffectResult, SideEffectResult, PrecedentRecord, GovernanceAdjustment) as type-only exports.

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. Core schemas exported
grep -c "Schema = z.object" src/schemas/decision.ts
# Expected: >= 12 (IntentRoute, FixedElement, UnresolvedElement, PathCheckResult,
#   RealizationCandidate, GovernanceWorldCandidate, ProbeableForm, SignalPacket,
#   EvaluatorInput, EvaluatorOutput, CommitMemo, EconomicCommitMemo, GovernanceCommitMemo)

# 4. Core enums exported
grep -c "Enum = z.enum" src/schemas/decision.ts
# Expected: >= 4 (Regime, RealizationForm, WorldForm, + sub-enums)

# 5. Section 6 type-only exports (no Zod schemas)
grep -c "^export type" src/schemas/decision.ts
# Expected: >= 10

# 6. No any types (CONTRACT TYPE-01)
grep -c "as any\|: any" src/schemas/decision.ts
# Expected: 0

# 7. All enum values match shared-types.md
# Verify manually: Regime has 6 values, RealizationForm has 10, WorldForm has 6
```

## Git Commit

```
feat(schemas): add Zod schemas for decision pipeline shared types

Define all shared types from shared-types.md (Sections 1-5) as Zod
schemas in schemas/decision.ts. Section 6 canonical cycle types are
type-only exports (no runtime validation for v0).
```
