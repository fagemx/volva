import { z } from 'zod';

export const SettlementTarget = z.enum(['village_pack', 'workflow', 'task', 'pipeline']);
export type SettlementTarget = z.infer<typeof SettlementTarget>;

export const SettlementStatus = z.enum(['draft', 'confirmed', 'applied', 'failed']);
export type SettlementStatus = z.infer<typeof SettlementStatus>;

export const SettlementSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  card_id: z.string(),
  target: SettlementTarget,
  payload: z.string(),
  status: SettlementStatus,
  thyra_response: z.string().nullable(),
  created_at: z.string(),
});

export type Settlement = z.infer<typeof SettlementSchema>;
