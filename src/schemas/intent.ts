import { z } from 'zod';
import { ConversationMode } from './conversation';
import { CardTypeEnum } from './card';

export const IntentType = z.enum([
  'new_intent',
  'add_info',
  'set_boundary',
  'add_constraint',
  'add_evaluator_rule',
  'style_preference',
  'confirm',
  'modify',
  'settle_signal',
  'question',
  'off_topic',
  'query_status',
  'query_history',
]);
export type IntentType = z.infer<typeof IntentType>;

export const IntentSchema = z.object({
  type: IntentType,
  summary: z.string(),
  target_cards: z.array(CardTypeEnum).optional(),
  entities: z.record(z.string()).optional(),
  enforcement: z.enum(['hard', 'soft']).optional(),
  signals: z.array(z.string()).optional(),
  detected_mode: ConversationMode.optional(),
});
export type Intent = z.infer<typeof IntentSchema>;
