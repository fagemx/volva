import type { LLMClient } from './client';
import { IntentSchema, type Intent } from '../schemas/intent';
import { INTENT_SYSTEM_PROMPT } from './prompts';

const FALLBACK_INTENT = (userMessage: string): Intent => ({
  type: 'off_topic',
  summary: userMessage,
});

export async function parseIntent(
  llm: LLMClient,
  userMessage: string,
  cardSnapshot: string,
): Promise<Intent> {
  const result = await llm.generateStructured({
    system: INTENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `短卡現狀：\n${cardSnapshot}\n\n使用者說：${userMessage}`,
      },
    ],
    schema: IntentSchema,
    schemaDescription:
      'Intent object with type (one of 10 enum values), summary (string), optional entities (record), optional enforcement (hard|soft), optional signals (string array), optional detected_mode (world_design|workflow_design|task, first turn only)',
  });

  if (result.ok) return result.data;

  console.warn('[parseIntent] fallback to off_topic:', result.error);
  return FALLBACK_INTENT(userMessage);
}
