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
      'Intent object with type (enum), summary (string), optional target_cards (array of card types: world/workflow/task/pipeline/adapter/commerce/org), optional entities (record), optional enforcement (hard|soft), optional signals (string array), optional detected_mode (first turn only)',
  });

  if (result.ok) return result.data;

  console.warn('[parseIntent] fallback to off_topic:', result.error);
  return FALLBACK_INTENT(userMessage);
}
