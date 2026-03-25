import { z } from 'zod';
import type { LLMClient } from '../llm/client';

// ─── SkillCandidate Schema ───

export const SkillCandidateSchema = z.object({
  name: z.string(),
  summary: z.string(),
  problemShapes: z.array(z.string()),
  desiredOutcomes: z.array(z.string()),
  nonGoals: z.array(z.string()),
  triggerWhen: z.array(z.string()),
  doNotTriggerWhen: z.array(z.string()),
  methodOutline: z.array(z.string()),
  observedGotchas: z.array(z.string()),
});

export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;

// ─── System prompt for pattern capture ───

const CAPTURE_SYSTEM_PROMPT = `You are analyzing a completed conversation to extract a reusable work pattern.

From the conversation history and context provided, extract:
- name: a concise, descriptive name for this skill pattern
- summary: one-sentence description of what this pattern does
- problemShapes: what kinds of problems this pattern addresses
- desiredOutcomes: what results are expected when this pattern is applied
- nonGoals: what this pattern explicitly does NOT try to do
- triggerWhen: conditions under which this pattern should be activated
- doNotTriggerWhen: conditions under which this pattern should NOT be activated
- methodOutline: high-level steps observed in the conversation
- observedGotchas: issues, pitfalls, or surprises noticed during the work

Be specific — these will become the seed for a governed skill object.`;

// ─── Helper ───

function formatHistory(
  history: ReadonlyArray<{ role: string; content: string }>,
): string {
  return history
    .map((msg) => `[${msg.role}]: ${msg.content}`)
    .join('\n\n');
}

// ─── Main function ───

/**
 * Extract a reusable skill candidate from conversation history using LLM.
 *
 * Called as an independent request (e.g. POST /api/skills/harvest),
 * NOT inside handleTurn() — satisfies COND-02.
 *
 * LLM call with Zod validation (CONTRACT LLM-01). Never throws (CONTRACT LLM-02 satisfied by LLMClient).
 */
export async function capturePattern(
  llm: LLMClient,
  conversationHistory: ReadonlyArray<{ role: string; content: string }>,
  context: string,
): Promise<{ ok: true; data: SkillCandidate } | { ok: false; error: string }> {
  return llm.generateStructured({
    system: CAPTURE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user' as const,
        content: `Context: ${context}\n\nConversation:\n${formatHistory(conversationHistory)}`,
      },
    ],
    schema: SkillCandidateSchema,
    schemaDescription:
      'SkillCandidate with name, summary, problemShapes[], desiredOutcomes[], nonGoals[], triggerWhen[], doNotTriggerWhen[], methodOutline[], observedGotchas[]',
  });
}
