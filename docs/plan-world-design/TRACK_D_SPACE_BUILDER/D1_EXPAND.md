# D1: Expand — Candidate Generation (LLM + Zod)

> **Module**: `src/decision/space-builder.ts`
> **Layer**: L2
> **Dependencies**: A1（Zod Schemas — Regime, RealizationCandidate, RealizationForm, WorldForm）, A3（DecisionSessionManager）, B1（Intent Router — IntentRoute）, C1（Path Check — PathCheckResult）
> **Blocks**: D2（Kill Filters）, E1（Probe Shell）, F1（Decision Routes）

---

## Bootstrap Instructions

```bash
# 1. Read shared types and existing schemas
cat src/schemas/decision.ts

# 2. Read LLM client pattern
cat src/llm/client.ts

# 3. Read spec sections on space builder
cat docs/world-design-v0/intent-router-and-space-builder.md   # Section 7-14
cat docs/world-design-v0/economic-regime-v0.md                # Section 9-10 (vehicle generation)
cat docs/world-design-v0/governance-regime-v0.md              # Section 8-9 (world forms)

# 4. Read contracts
cat docs/plan-world-design/CONTRACT.md

# 5. Verify baseline compiles
bun run build
```

---

## Final Result

- `src/decision/space-builder.ts` exports `buildSpace(llm, intentRoute, pathCheck, context): Promise<RealizationCandidate[]>`
- LLM call with Zod schema validation generates regime-specific candidates (CONTRACT LLM-01 + LLM-02)
- Economic regime: generates `domain x vehicle` candidates using 7 canonical vehicles
- Governance regime: generates `world form` candidates using 6 canonical forms
- Each candidate has `form`, `whyThisCandidate`, `assumptions`, `probeReadinessHints`, `timeToSignal`
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Define internal types and system prompts

- **File**: `src/decision/space-builder.ts`
- **Reference**: `intent-router-and-space-builder.md` Section 7-9, `shared-types.md` §4.1
- **Key changes**:
  1. Import shared types from `schemas/decision.ts`:
     ```typescript
     import type { IntentRoute, PathCheckResult, RealizationCandidate, Regime } from '../schemas/decision';
     import { RealizationCandidateSchema } from '../schemas/decision';
     import type { LLMClient } from '../llm/client';
     ```
  2. Define `SpaceBuilderContext` type (internal, not in schemas):
     ```typescript
     type SpaceBuilderContext = {
       userMessage: string;
       edgeProfile?: string[];
       constraints?: string[];
       additionalContext?: Record<string, unknown>;
     };
     ```
  3. Define system prompt constant `SPACE_BUILDER_SYSTEM_PROMPT` that instructs LLM to:
     - Read `intentRoute.primaryRegime` to determine which kind of candidates to generate
     - For economic: generate `domain x vehicle` combinations (7 vehicle types from spec Section 10)
     - For governance: generate `world form` candidates (6 world forms from spec Section 9)
     - For other regimes: generate generic `RealizationCandidate[]`
     - Include `whyThisCandidate`, `assumptions`, `probeReadinessHints` for each
     - Output as JSON array matching `RealizationCandidate` schema

### Step 2: Implement `buildSpace()` function

- **File**: `src/decision/space-builder.ts`
- **Reference**: `intent-router-and-space-builder.md` Section 7 ("space-builder = expand + constrain"), `CLAUDE.md` LLM-01/LLM-02
- **Key changes**:
  1. Function signature:
     ```typescript
     export async function buildSpace(
       llm: LLMClient,
       intentRoute: IntentRoute,
       pathCheck: PathCheckResult,
       context: SpaceBuilderContext,
     ): Promise<RealizationCandidate[]>
     ```
  2. Build user message from `intentRoute` fields (`primaryRegime`, `signals`, `keyUnknowns`) + `pathCheck` fields (`fixedElements`, `unresolvedElements`) + `context`
  3. Call `llm.generateStructured()` with:
     - `system`: `SPACE_BUILDER_SYSTEM_PROMPT`
     - `schema`: `z.array(RealizationCandidateSchema)` (Zod array of candidate schema)
     - `schemaDescription`: `'Array of realization candidates for the given regime'`
  4. Wrap in try/catch (CONTRACT LLM-02):
     ```typescript
     try {
       const result = await llm.generateStructured({
         system: SPACE_BUILDER_SYSTEM_PROMPT,
         messages: [{ role: 'user', content: buildUserPrompt(intentRoute, pathCheck, context) }],
         schema: z.array(RealizationCandidateSchema),
         schemaDescription: 'Array of realization candidates',
       });
       if (!result.ok) {
         return [];
       }
       return result.data;
     } catch (error) {
       console.error('[space-builder] LLM call failed:', error instanceof Error ? error.message : 'Unknown error');
       return [];
     }
     ```
  5. Each candidate gets a generated `id` via `crypto.randomUUID()`

### Step 3: Implement `buildUserPrompt()` helper

- **File**: `src/decision/space-builder.ts`
- **Reference**: `intent-router-and-space-builder.md` Section 8 (four inputs: person asymmetry, constraint envelope, search friction, carrying form)
- **Key changes**:
  1. Internal helper function (not exported):
     ```typescript
     function buildUserPrompt(
       intentRoute: IntentRoute,
       pathCheck: PathCheckResult,
       context: SpaceBuilderContext,
     ): string
     ```
  2. Compose prompt sections:
     - **Regime**: `intentRoute.primaryRegime`
     - **Signals**: `intentRoute.signals` joined
     - **Key Unknowns**: `intentRoute.keyUnknowns` joined
     - **Fixed Elements**: `pathCheck.fixedElements` mapped to `kind: value`
     - **Unresolved Elements**: `pathCheck.unresolvedElements` mapped to `kind (reason)`
     - **User Context**: `context.userMessage`
     - **Edge Profile**: `context.edgeProfile` if provided
     - **Constraints**: `context.constraints` if provided
  3. For economic regime, prompt includes the 7 canonical vehicles:
     `done_for_you_service`, `done_with_you_install`, `workflow_audit`, `productized_service`, `template_pack`, `tool`, `operator_model`
  4. For governance regime, prompt includes the 6 canonical world forms:
     `market`, `commons`, `town`, `port`, `night_engine`, `managed_knowledge_field`

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Module exports buildSpace
grep -n "export async function buildSpace" src/decision/space-builder.ts

# 4. LLM call uses Zod schema (CONTRACT LLM-01)
grep -n "generateStructured" src/decision/space-builder.ts

# 5. LLM call has try/catch (CONTRACT LLM-02)
grep -n "try {" src/decision/space-builder.ts

# 6. No 'any' usage (CONTRACT TYPE-01)
grep -n "as any\|: any" src/decision/space-builder.ts | wc -l
# Expected: 0

# 7. Does not import from conductor/cards/settlement (CONTRACT LAYER-01)
grep -n "from.*conductor\|from.*cards\|from.*settlement" src/decision/space-builder.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add space-builder expand with LLM candidate generation

buildSpace() generates regime-specific RealizationCandidate[] via LLM.
Economic regime uses domain×vehicle, governance uses world forms.
All outputs validated with Zod schema per CONTRACT LLM-01.
```
