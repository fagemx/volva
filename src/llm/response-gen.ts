import type { LLMClient } from './client';
import { buildReplyPrompt, type Strategy } from './prompts';
import type { SkillData } from '../thyra-client/schemas';

export async function generateReply(
  llm: LLMClient,
  strategy: Strategy,
  cardSnapshot: string,
  userMessage: string,
  availableSkills?: SkillData[],
): Promise<string> {
  const system = buildReplyPrompt(strategy, cardSnapshot, availableSkills);

  const reply = await llm.generateText({
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 500,
  });

  return reply;
}
