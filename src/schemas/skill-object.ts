import { z } from 'zod';

// ─── Enums ───

export const SkillStatusEnum = z.enum([
  'draft',
  'sandbox',
  'promoted',
  'core',
  'deprecated',
  'superseded',
]);
export type SkillStatus = z.infer<typeof SkillStatusEnum>;

export const LifecycleStageEnum = z.enum([
  'capture',
  'crystallize',
  'package',
  'route',
  'execute',
  'verify',
  'learn',
  'govern',
]);
export type LifecycleStage = z.infer<typeof LifecycleStageEnum>;

export const MaturityEnum = z.enum(['emerging', 'stable', 'core']);
export type Maturity = z.infer<typeof MaturityEnum>;

export const RiskTierEnum = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskTier = z.infer<typeof RiskTierEnum>;

export const ExecutionModeEnum = z.enum([
  'advisory',
  'assistive',
  'active',
  'destructive',
]);
export type ExecutionMode = z.infer<typeof ExecutionModeEnum>;

export const DispatchModeEnum = z.enum(['local', 'karvi', 'hybrid']);
export type DispatchMode = z.infer<typeof DispatchModeEnum>;

export const FallbackStrategyEnum = z.enum(['local', 'queue', 'reject']);
export type FallbackStrategy = z.infer<typeof FallbackStrategyEnum>;

// ─── Section 1: Identity ───

export const IdentitySchema = z.object({
  summary: z.string(),
  owners: z.object({
    human: z.array(z.string()),
    agent: z.array(z.string()),
  }),
  domain: z.string(),
  tags: z.array(z.string()),
  maturity: MaturityEnum,
  riskTier: RiskTierEnum,
});
export type Identity = z.infer<typeof IdentitySchema>;

// ─── Section 2: Purpose ───

export const PurposeSchema = z.object({
  problemShapes: z.array(z.string()),
  desiredOutcomes: z.array(z.string()),
  nonGoals: z.array(z.string()),
  notFor: z.array(z.string()),
});
export type Purpose = z.infer<typeof PurposeSchema>;

// ─── Section 3: Routing ───

export const RoutingSchema = z.object({
  description: z.string(),
  triggerWhen: z.array(z.string()),
  doNotTriggerWhen: z.array(z.string()),
  priority: z.number().int().min(0).max(100).default(50),
  conflictsWith: z.array(z.string()),
  mayChainTo: z.array(z.string()),
});
export type Routing = z.infer<typeof RoutingSchema>;

// ─── Section 4: Contract ───

const ContractEntrySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

const ContractOptionalEntrySchema = ContractEntrySchema.extend({
  default: z.string().optional(),
});

const FailureModeSchema = z.object({
  mode: z.string(),
  mitigation: z.string(),
});

export const ContractSchema = z.object({
  inputs: z.object({
    required: z.array(ContractEntrySchema),
    optional: z.array(ContractOptionalEntrySchema),
  }),
  outputs: z.object({
    primary: z.array(ContractEntrySchema),
    secondary: z.array(ContractEntrySchema),
  }),
  successCriteria: z.array(z.string()),
  failureModes: z.array(FailureModeSchema),
});
export type Contract = z.infer<typeof ContractSchema>;

// ─── Section 5: Package ───

const HookEventEnum = z.enum(['pre-run', 'post-run', 'on-fail']);

const HookSchema = z.object({
  event: HookEventEnum,
  script: z.string(),
});

const LocalStateSchema = z.object({
  enabled: z.boolean(),
  stablePath: z.string(),
  files: z.array(z.string()),
});

export const PackageSchema = z.object({
  root: z.string(),
  entryFile: z.string(),
  references: z.array(z.string()),
  scripts: z.array(z.string()),
  assets: z.array(z.string()),
  config: z.object({
    schemaFile: z.string(),
    dataFile: z.string(),
  }),
  hooks: z.array(HookSchema),
  localState: LocalStateSchema,
});
export type Package = z.infer<typeof PackageSchema>;

// ─── Section 6: Environment ───

const PermissionsSchema = z.object({
  filesystem: z.object({ read: z.boolean(), write: z.boolean() }),
  network: z.object({ read: z.boolean(), write: z.boolean() }),
  process: z.object({ spawn: z.boolean() }),
  secrets: z.object({ read: z.array(z.string()) }),
});

export const EnvironmentSchema = z.object({
  toolsRequired: z.array(z.string()),
  toolsOptional: z.array(z.string()),
  permissions: PermissionsSchema,
  externalSideEffects: z.boolean(),
  executionMode: ExecutionModeEnum,
});
export type Environment = z.infer<typeof EnvironmentSchema>;

// ─── Section 7: Dispatch ───

const ExecutionPolicySchema = z.object({
  sync: z.boolean(),
  retries: z.number().int().min(0),
  timeoutMinutes: z.number().int().min(1),
  escalationOnFailure: z.boolean(),
});

const ApprovalSchema = z.object({
  requireHumanBeforeDispatch: z.boolean(),
  requireHumanBeforeMerge: z.boolean(),
});

export const DispatchSchema = z.object({
  mode: DispatchModeEnum,
  fallback: FallbackStrategyEnum.default('local'),
  targetSelection: z.object({
    repoPolicy: z.string(),
    runtimeOptions: z.array(z.string()),
  }),
  workerClass: z.array(z.string()),
  handoff: z.object({
    inputArtifacts: z.array(z.string()),
    outputArtifacts: z.array(z.string()),
  }),
  executionPolicy: ExecutionPolicySchema,
  approval: ApprovalSchema,
});
export type Dispatch = z.infer<typeof DispatchSchema>;

// ─── Section 8: Verification ───

export const VerificationSchema = z.object({
  smokeChecks: z.array(z.string()),
  assertions: z.array(z.string()),
  humanCheckpoints: z.array(z.string()),
  outcomeSignals: z.array(z.string()),
});
export type Verification = z.infer<typeof VerificationSchema>;

// ─── Section 9: Memory ───

export const MemorySchema = z.object({
  localMemoryPolicy: z.object({
    canStore: z.array(z.string()),
    cannotStore: z.array(z.string()),
  }),
  precedentWriteback: z.object({
    enabled: z.boolean(),
    target: z.string(),
    when: z.array(z.string()),
  }),
});
export type Memory = z.infer<typeof MemorySchema>;

// ─── Section 10: Governance ───

const MutabilitySchema = z.object({
  agentMayEdit: z.array(z.string()),
  agentMayPropose: z.array(z.string()),
  humanApprovalRequired: z.array(z.string()),
  forbiddenWithoutHuman: z.array(z.string()),
});

const SupersessionSchema = z.object({
  supersedes: z.array(z.string()),
  supersededBy: z.string().nullable(),
});

export const GovernanceSchema = z.object({
  mutability: MutabilitySchema,
  reviewPolicy: z.object({
    requiredReviewers: z.array(z.string()),
  }),
  promotionGates: z.array(z.string()),
  rollbackPolicy: z.object({
    allowed: z.boolean(),
    rollbackOn: z.array(z.string()),
  }),
  supersession: SupersessionSchema,
});
export type Governance = z.infer<typeof GovernanceSchema>;

// ─── Section 11: Telemetry (auto-managed) ───

const TelemetryMetricSchema = z.object({
  metric: z.string(),
});

export const TelemetrySchema = z.object({
  track: z.array(TelemetryMetricSchema),
  thresholds: z
    .object({
      promotion_min_success: z.number().int().default(3),
      retirement_idle_days: z.number().int().default(90),
    })
    .partial(),
  reporting: z
    .object({
      target: z.string().default('edda'),
      frequency: z
        .enum(['on_governance', 'weekly', 'on_demand'])
        .default('on_governance'),
    })
    .partial(),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

// ─── Section 12: Lifecycle (auto-managed) ───

export const LifecycleSchema = z.object({
  createdFrom: z.array(z.string()),
  currentStage: LifecycleStageEnum,
  promotionPath: z.array(SkillStatusEnum),
  retirementCriteria: z.array(z.string()),
  lastReviewedAt: z.string().nullable(),
});
export type Lifecycle = z.infer<typeof LifecycleSchema>;

// ─── Top-Level SkillObject ───

export const SkillObjectSchema = z.object({
  kind: z.literal('SkillObject'),
  apiVersion: z.string(),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  status: SkillStatusEnum,
  identity: IdentitySchema,
  purpose: PurposeSchema,
  routing: RoutingSchema,
  contract: ContractSchema,
  package: PackageSchema,
  environment: EnvironmentSchema,
  dispatch: DispatchSchema,
  verification: VerificationSchema,
  memory: MemorySchema,
  governance: GovernanceSchema,
  telemetry: TelemetrySchema.optional(),
  lifecycle: LifecycleSchema.optional(),
});
export type SkillObject = z.infer<typeof SkillObjectSchema>;
