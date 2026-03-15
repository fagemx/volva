import { z } from 'zod';

export const IntentType = z.enum([
  'new_intent',
  'add_info',
  'set_boundary',
  'add_constraint',
  'style_preference',
  'confirm',
  'modify',
  'settle_signal',
  'question',
  'off_topic',
]);
export type IntentType = z.infer<typeof IntentType>;

export const IntentSchema = z.object({
  type: IntentType,
  summary: z.string(),
  entities: z.record(z.string()).optional(),
  enforcement: z.enum(['hard', 'soft']).optional(),
  signals: z.array(z.string()).optional(),
});
export type Intent = z.infer<typeof IntentSchema>;
