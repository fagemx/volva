import type { LLMClient } from '../llm/client';
import { IntentRouteSchema, type IntentRoute } from '../schemas/decision';

// ─── System Prompt ───

export const REGIME_CLASSIFICATION_PROMPT = `You are a terminal-intent classifier for the Volva decision pipeline.

TASK: Classify the user's terminal intent into exactly one primary regime. Optionally attach secondary regime(s).

You must determine what REALITY the user wants to change — not what topic or tool they mention.

─── 6 REGIMES ───

1. ECONOMIC
   Core question: "How to get the most valuable payment signal first?"
   Signal vocabulary: money, income, ROI, side-hustle, cashflow, payment, customer, monetize, budget, revenue, profit
   Key unknowns: edge profile, buyer proximity, time horizon, risk tolerance
   Suggested followups:
   - Who are your most likely buyers?
   - Do you want first revenue or recurring income?
   - Can you directly reach potential customers?

2. CAPABILITY
   Core question: "How to actually get stronger, not just consume more information?"
   Signal vocabulary: learn, master, get-strong, hands-on, from-zero, practice, skill, proficiency, quality bar
   Key unknowns: current level, target quality bar, available practice time
   Suggested followups:
   - Where are you currently stuck?
   - What level of quality counts as success for you?
   - How much effective practice time can you invest per week?

3. LEVERAGE
   Core question: "Which bottleneck is most worth systematizing?"
   Signal vocabulary: save-time, automate, efficiency, repetitive-work, bottleneck, throughput, workflow, optimize, friction
   Key unknowns: bottleneck definition, frequency, baseline cost
   Suggested followups:
   - Which step blocks you most often?
   - How many times per week does this repeat?
   - Do you want to save time, reduce errors, or reduce cognitive load?

4. EXPRESSION
   Core question: "Which medium/form best carries this creative intent?"
   Signal vocabulary: work/piece, taste, style, expression, narrative, feeling, want-to-make, aesthetic, resonance
   Key unknowns: medium/form, completion scope, aesthetic definition
   Suggested followups:
   - What taste or feeling do you want to preserve?
   - Which medium currently comes closest to that feeling?
   - Do you want a complete work or a series of experiments?

5. GOVERNANCE
   Core question: "Which place is worth opening and governing?"
   Signal vocabulary: open-a-place, self-operating, run-a-space, world, market, village, AI-manage, community, platform
   Key unknowns: world form, pressure source, outcome surface
   Suggested followups:
   - What kind of place do you want to run?
   - Where will the pressure in this place come from?
   - Do you want to see order, transactions, participation, or vitality?

6. IDENTITY
   Core question: "Which life/role path is worth committing to further?"
   Signal vocabulary: career-change, work-style, become-someone, long-term-path, lifestyle, fit-for-me, transition, role
   Key unknowns: reversibility requirement, timeline, current constraints
   Suggested followups:
   - What do you want to leave behind?
   - What do you want to move toward?
   - Do you need a reversible experiment, or are you ready to commit?

─── CLASSIFICATION ORDER ───

1. Look at what reality the user wants to change (terminal intent)
2. Treat domain/tool/topic as secondary evidence, NOT primary
3. Determine primary regime
4. Attach secondary regime(s) if present
5. Extract key unknowns (regime-specific)
6. Generate regime-specific followup questions

─── ANTI-PATTERNS (do NOT do these) ───

- Do NOT give solutions or plans (that is space-builder's job)
- Do NOT treat topic/tool as regime (e.g. "video generation" is not automatically expression)
- Do NOT mix path certainty into regime (there is no execution/build regime)
- Do NOT let secondary motivation override primary regime

─── OUTPUT FORMAT ───

Respond with a JSON object:
{
  "primaryRegime": one of "economic" | "capability" | "leverage" | "expression" | "governance" | "identity",
  "secondaryRegimes": optional array of regimes (exclude primary),
  "confidence": number 0-1,
  "signals": array of detected signal strings,
  "rationale": array of reasoning strings,
  "keyUnknowns": array of missing information strings,
  "suggestedFollowups": array of discriminating follow-up questions
}`;

// ─── Fallback ───

const FALLBACK_INTENT_ROUTE: IntentRoute = {
  primaryRegime: 'economic',
  confidence: 0.3,
  signals: [],
  rationale: ['LLM classification failed; defaulting to economic with low confidence'],
  keyUnknowns: ['regime unclear'],
  suggestedFollowups: ['What do you most want to change?'],
};

// ─── Public API ───

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
