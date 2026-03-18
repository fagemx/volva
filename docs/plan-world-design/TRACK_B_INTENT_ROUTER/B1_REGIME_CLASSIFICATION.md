# B1: Regime Classification via LLM

> **Module**: `src/decision/intent-router.ts`
> **Layer**: L1
> **Dependencies**: Track A (Zod schemas in `src/schemas/decision.ts`)
> **Blocks**: B2 (Tests), D (Space Builder), F (Integration)

---

## Bootstrap

```bash
cat docs/world-design-v0/intent-router.md              # regime definitions, signals, core principles
cat docs/world-design-v0/intent-router-and-space-builder.md  # Section 5: six regimes detail
cat docs/world-design-v0/shared-types.md                # IntentRoute canonical type
cat src/schemas/decision.ts                             # Zod schemas from Track A (Regime, IntentRouteSchema)
cat src/llm/intent-parser.ts                            # existing pattern: LLM + Zod classification
cat src/llm/client.ts                                   # LLMClient.generateStructured<T>()
cat docs/plan-world-design/CONTRACT.md                  # LLM-01, LLM-02, LAYER-01
bun run build                                           # verify baseline
```

---

## Final Result

- `src/decision/intent-router.ts` exports `classifyIntent(llm, userMessage, context?): Promise<IntentRoute>`
- LLM system prompt classifies into 6 regimes with confidence, signals, rationale, keyUnknowns, suggestedFollowups
- Zod-validated output via `IntentRouteSchema` from `src/schemas/decision.ts`
- Graceful fallback on LLM failure: returns safe default IntentRoute
- `bun run build` zero errors

---

## Implementation

### Step 1: System Prompt

Define the LLM system prompt as a const string. The prompt must encode:

1. The 6 regimes and their core question (from intent-router.md Section 6):
   - **economic**: "How to get the most valuable payment signal first?"
   - **capability**: "How to actually get stronger, not just consume more information?"
   - **leverage**: "Which bottleneck is most worth systematizing?"
   - **expression**: "Which medium/form best carries this creative intent?"
   - **governance**: "Which place is worth opening and governing?"
   - **identity**: "Which life/role path is worth committing to further?"

2. Classification order (from intent-router.md Section 13):
   - Look at what reality the user wants to change (terminal intent)
   - Treat domain/tool/topic as secondary evidence, not primary
   - Determine primary regime
   - Attach secondary regime(s) if present
   - Extract key unknowns
   - Generate regime-specific followups

3. Anti-patterns (from intent-router.md Section 3):
   - Do NOT give solutions/plans (that's space-builder's job)
   - Do NOT treat topic/tool as regime
   - Do NOT mix path certainty into regime (no execution/build regime)
   - Do NOT let secondary motivation override primary regime

4. Signal vocabulary per regime (from intent-router.md Section 7):
   - Economic: money, income, ROI, side-hustle, cashflow, payment, customer, monetize
   - Capability: learn, master, get-strong, hands-on, from-zero, practice
   - Leverage: save-time, automate, efficiency, repetitive-work, bottleneck, throughput
   - Expression: work/piece, taste, style, expression, narrative, feeling, want-to-make
   - Governance: open-a-place, self-operating, run-a-space, world, market, village, AI-manage
   - Identity: career-change, work-style, become-someone, long-term-path, lifestyle, fit-for-me

5. Output JSON schema description matching `IntentRouteSchema`

```typescript
// src/decision/intent-router.ts
import type { LLMClient } from '../llm/client';
import { IntentRouteSchema, type IntentRoute } from '../schemas/decision';

export const REGIME_CLASSIFICATION_PROMPT = `You are a terminal-intent classifier...
// (full prompt with 6 regimes, signals, classification order, anti-patterns)
// Must output valid JSON matching IntentRoute schema
`;
```

### Step 2: Fallback Definition

Define the fallback IntentRoute returned when LLM fails (CONTRACT LLM-02).

```typescript
const FALLBACK_INTENT_ROUTE: IntentRoute = {
  primaryRegime: 'economic',
  confidence: 0.3,
  signals: [],
  rationale: ['LLM classification failed; defaulting to economic with low confidence'],
  keyUnknowns: ['regime unclear'],
  suggestedFollowups: ['What do you most want to change?'],
};
```

Rationale for defaults:
- `economic` as fallback primary: safest default (most common intent)
- `confidence: 0.3`: low enough that downstream path-check will route to space-builder (not forge-fast-path)
- Single followup question: maximally discriminating across all 6 regimes

### Step 3: classifyIntent Function

```typescript
export interface ClassifyIntentContext {
  conversationHistory?: string;
  previousRoute?: IntentRoute;
}

export async function classifyIntent(
  llm: LLMClient,
  userMessage: string,
  context?: ClassifyIntentContext,
): Promise<IntentRoute> {
  const contextBlock = context?.conversationHistory
    ? `\n\nConversation context:\n${context.conversationHistory}`
    : '';

  const result = await llm.generateStructured({
    system: REGIME_CLASSIFICATION_PROMPT,
    messages: [
      {
        role: 'user',
        content: `User message: ${userMessage}${contextBlock}`,
      },
    ],
    schema: IntentRouteSchema,
    schemaDescription:
      'IntentRoute with primaryRegime (one of 6 regimes), optional secondaryRegimes array, confidence (0-1), signals (string[]), rationale (string[]), keyUnknowns (string[]), suggestedFollowups (string[])',
  });

  if (result.ok) return result.data;

  console.warn('[classifyIntent] fallback to low-confidence economic:', result.error);
  return FALLBACK_INTENT_ROUTE;
}
```

Key implementation details:
- **Single LLM call**: One `generateStructured` call, Zod-validated via `IntentRouteSchema` (CONTRACT LLM-01)
- **try/catch inside LLMClient**: `generateStructured` already wraps in try/catch (CONTRACT LLM-02)
- **No imports from conductor/cards/settlement**: Only imports `llm/client` and `schemas/decision` (CONTRACT LAYER-01)
- **Context is optional**: First message in a session has no context; subsequent messages may carry conversation history
- **Fallback is deterministic**: Never throws, always returns valid IntentRoute

### Step 4: Prompt Structure Detail

The system prompt should follow this structure (exact wording to be written during implementation):

```
ROLE: Terminal intent classifier for the Volva decision pipeline.

TASK: Classify the user's terminal intent into exactly one primary regime.

6 REGIMES:
[list each regime with its core question and signal vocabulary]

CLASSIFICATION ORDER:
1. What reality does the user want to change?
2. Domain/tool/topic = secondary evidence only
3. Determine primary regime
4. Attach secondary regime(s)
5. Extract key unknowns (regime-specific)
6. Generate regime-specific followup questions

ANTI-PATTERNS:
- Never give solutions
- Never treat topic as regime
- Never mix path certainty into regime

KEY UNKNOWNS PER REGIME:
[economic: edge profile, buyer proximity, time horizon]
[capability: current level, target quality bar, practice time]
[leverage: bottleneck definition, frequency, baseline cost]
[expression: medium/form, completion scope, aesthetic definition]
[governance: world form, pressure source, outcome surface]
[identity: reversibility, timeline, current constraints]

SUGGESTED FOLLOWUPS:
[regime-specific discriminating questions from intent-router.md Section 11]

OUTPUT: JSON matching IntentRoute schema.
```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. No any types
grep -c "as any\|: any" src/decision/intent-router.ts
# Expected: 0

# 4. Layer independence
grep -c "from.*conductor\|from.*cards\|from.*settlement" src/decision/intent-router.ts
# Expected: 0

# 5. Uses IntentRouteSchema from schemas/decision.ts
grep "IntentRouteSchema" src/decision/intent-router.ts
# Expected: >= 1

# 6. Exports classifyIntent
grep "export.*classifyIntent" src/decision/intent-router.ts
# Expected: 1

# 7. Has fallback (LLM-02 compliance)
grep "FALLBACK_INTENT_ROUTE\|fallback" src/decision/intent-router.ts
# Expected: >= 1

# 8. Single LLM call (COND-02 friendly)
grep -c "generateStructured\|generateText" src/decision/intent-router.ts
# Expected: 1
```

## Git Commit

```
feat(decision): add intent router with 6-regime LLM classification

Implement classifyIntent() that uses LLM + Zod schema validation
to classify user terminal intent into one of 6 regimes (economic,
capability, leverage, expression, governance, identity).
Includes deterministic fallback on LLM failure.
```
