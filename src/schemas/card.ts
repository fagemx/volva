import { z } from 'zod';

// ─── Shared Sub-schemas ───

export const CardTypeEnum = z.enum(['world', 'workflow', 'task']);
export type CardType = z.infer<typeof CardTypeEnum>;

const VersionSchema = z.number().int().min(1);

const PendingItemSchema = z.object({
  question: z.string(),
  context: z.string(),
});

// ─── WorldCard ───

export const RuleSchema = z.object({
  description: z.string(),
  scope: z.array(z.string()).default(['*']),
});

export type Rule = z.infer<typeof RuleSchema>;

export const WorldCardSchema = z.object({
  goal: z.string().nullable(),
  target_repo: z.string().nullable(),
  confirmed: z.object({
    hard_rules: z.array(RuleSchema),
    soft_rules: z.array(RuleSchema),
    must_have: z.array(z.string()),
    success_criteria: z.array(z.string()),
  }),
  pending: z.array(PendingItemSchema),
  chief_draft: z
    .object({
      name: z.string().nullable(),
      role: z.string().nullable(),
      style: z.string().nullable(),
    })
    .nullable(),
  budget_draft: z
    .object({
      per_action: z.number().nullable(),
      per_day: z.number().nullable(),
    })
    .nullable(),
  current_proposal: z.string().nullable(),
  version: VersionSchema,
});

export type WorldCard = z.infer<typeof WorldCardSchema>;

// ─── WorkflowCard ───

const WorkflowStepSchema = z.object({
  order: z.number().int().min(0),
  description: z.string(),
  skill: z.string().nullable(),
  conditions: z.string().nullable(),
});

export const WorkflowCardSchema = z.object({
  name: z.string().nullable(),
  purpose: z.string().nullable(),
  steps: z.array(WorkflowStepSchema),
  confirmed: z.object({
    triggers: z.array(z.string()),
    exit_conditions: z.array(z.string()),
    failure_handling: z.array(z.string()),
  }),
  pending: z.array(PendingItemSchema),
  version: VersionSchema,
});

export type WorkflowCard = z.infer<typeof WorkflowCardSchema>;

// ─── TaskCard ───

export const TaskCardSchema = z.object({
  intent: z.string(),
  inputs: z.record(z.string(), z.string()),
  constraints: z.array(z.string()),
  success_condition: z.string().nullable(),
  version: VersionSchema,
});

export type TaskCard = z.infer<typeof TaskCardSchema>;

// ─── Union type for downstream consumers ───

export type AnyCard = WorldCard | WorkflowCard | TaskCard;

// ─── Card Diff ───

export const CardDiffSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.string()),
});
export type CardDiff = z.infer<typeof CardDiffSchema>;

// ─── Card Envelope ───

export interface CardEnvelope {
  id: string;
  conversationId: string;
  type: CardType;
  content: AnyCard;
  version: number;
  createdAt: string;
  updatedAt: string;
}
