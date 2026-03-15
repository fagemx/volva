import type { LLMClient } from './client';
import { buildReplyPrompt, type Strategy } from './prompts';

export async function generateReply(
  llm: LLMClient,
  strategy: Strategy,
  cardSnapshot: string,
  userMessage: string,
): Promise<string> {
  const system = buildReplyPrompt(strategy, cardSnapshot);

  const reply = await llm.generateText({
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 500,
  });

  return reply;
}
