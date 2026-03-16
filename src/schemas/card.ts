import { z } from 'zod';

// ─── Shared Sub-schemas ───

export const CardTypeEnum = z.enum(['world', 'workflow', 'task', 'pipeline', 'adapter']);
export type CardType = z.infer<typeof CardTypeEnum>;

const VersionSchema = z.number().int().min(1);

const PendingItemSchema = z.object({
  question: z.string(),
  context: z.string(),
});

// ─── LLM Preset ───

export const LlmPresetEnum = z.enum(['economy', 'balanced', 'performance']);
export type LlmPreset = z.infer<typeof LlmPresetEnum>;

// ─── WorldCard ───

export const RuleSchema = z.object({
  description: z.string(),
  scope: z.array(z.string()).default(['*']),
});

export type Rule = z.infer<typeof RuleSchema>;

export const EvaluatorRuleSchema = z.object({
  name: z.string(),
  trigger: z.string(),
  condition: z.string(),
  on_fail: z.object({
    risk: z.enum(['low', 'medium', 'high']),
    action: z.enum(['warn', 'require_human_approval', 'reject']),
  }),
});

export type EvaluatorRule = z.infer<typeof EvaluatorRuleSchema>;

export const WorldCardSchema = z.object({
  goal: z.string().nullable(),
  target_repo: z.string().nullable(),
  confirmed: z.object({
    hard_rules: z.array(RuleSchema),
    soft_rules: z.array(RuleSchema),
    must_have: z.array(z.string()),
    success_criteria: z.array(z.string()),
    evaluator_rules: z.array(EvaluatorRuleSchema),
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
  llm_preset: LlmPresetEnum.nullable(),
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

// ─── PipelineCard ───

const PipelineStepSchema = z.object({
  order: z.number().int().min(0),
  type: z.enum(['skill', 'gate', 'branch']),
  label: z.string(),
  skill_name: z.string().nullable(),
  instruction: z.string().nullable(),
  revision_target: z.string().nullable(),
  max_revision_cycles: z.number().int().nullable(),
  condition: z.string().nullable(),
  on_true: z.string().nullable(),
  on_false: z.string().nullable(),
});

export const ProposedSkillSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

export const PipelineCardSchema = z.object({
  name: z.string().nullable(),
  steps: z.array(PipelineStepSchema),
  schedule: z.string().nullable(),
  proposed_skills: z.array(ProposedSkillSchema),
  pending: z.array(PendingItemSchema),
  version: VersionSchema,
});

export type PipelineCard = z.infer<typeof PipelineCardSchema>;

// ─── AdapterCard ───

export const PlatformEnum = z.enum(['x', 'discord', 'telegram', 'owned_page']);
export type Platform = z.infer<typeof PlatformEnum>;

const PlatformConfigSchema = z.object({
  platform: PlatformEnum,
  enabled: z.boolean(),
  role: z.string(),
});

export const AdapterCardSchema = z.object({
  platforms: z.array(PlatformConfigSchema),
  version: VersionSchema,
});

export type AdapterCard = z.infer<typeof AdapterCardSchema>;

// ─── Union type for downstream consumers ───

export type AnyCard = WorldCard | WorkflowCard | TaskCard | PipelineCard | AdapterCard;

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
