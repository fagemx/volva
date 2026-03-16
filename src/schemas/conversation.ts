import { z } from 'zod';

// ─── Enums ───

export const ConversationMode = z.enum(['world_design', 'workflow_design', 'task', 'pipeline_design', 'adapter_config', 'commerce_design']);
export type ConversationMode = z.infer<typeof ConversationMode>;

export const ConductorPhase = z.enum(['explore', 'focus', 'settle']);
export type ConductorPhase = z.infer<typeof ConductorPhase>;

export const MessageRole = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRole>;

// ─── Record Schemas ───

export const ConversationSchema = z.object({
  id: z.string(),
  mode: ConversationMode,
  phase: ConductorPhase,
  village_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  role: MessageRole,
  content: z.string(),
  turn: z.number().int().min(0),
  created_at: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

// ─── Input DTOs ───

export const CreateConversationInput = z.object({
  mode: ConversationMode,
  village_id: z.string().optional(),
});
export type CreateConversationInput = z.infer<typeof CreateConversationInput>;
