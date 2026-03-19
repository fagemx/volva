import { z } from 'zod';

// ─── Error Classes ───

export class KarviError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'KarviError';
  }
}

export class KarviNetworkError extends KarviError {
  readonly retryable = true as const;
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'KarviNetworkError';
  }
}

export class KarviHttpError extends KarviError {
  readonly retryable: boolean;
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'KarviHttpError';
    this.retryable = status >= 500 || status === 429;
  }
}

export class KarviValidationError extends KarviError {
  readonly retryable = false as const;
  constructor(public readonly zodError: z.ZodError) {
    super(`Response validation failed: ${zodError.message}`);
    this.name = 'KarviValidationError';
  }
}

export class KarviApiError extends KarviError {
  readonly retryable = false as const;
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'KarviApiError';
  }
}

// ─── Response Schemas ───

export const KarviErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const KARVI_ERROR_CODES = [
  'NOT_FOUND',
  'APPROVAL_REQUIRED',
  'EMPTY_BUILD',
  'ALREADY_CANCELLED',
  'INVALID_REQUEST',
  'DISPATCH_FAILED',
  'TIMEOUT',
  'UNAUTHORIZED',
  'RATE_LIMITED',
] as const;

export type KarviErrorCode = typeof KARVI_ERROR_CODES[number];

export function karviSuccess<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
  });
}

// ─── Entity Data Schemas ───

export const PipelineStepDataSchema = z.object({
  order: z.number(),
  type: z.string(),
  label: z.string(),
  skill_name: z.string().nullable(),
  instruction: z.string().nullable(),
});
export type PipelineStepData = z.infer<typeof PipelineStepDataSchema>;

export const PipelineDataSchema = z.object({
  name: z.string(),
  steps: z.array(PipelineStepDataSchema),
});
export type PipelineData = z.infer<typeof PipelineDataSchema>;

export const DeletePipelineDataSchema = z.object({
  deleted: z.boolean(),
});
export type DeletePipelineData = z.infer<typeof DeletePipelineDataSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ─── Input Schemas ───

export const RegisterPipelineInputSchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.object({
    order: z.number(),
    type: z.string(),
    label: z.string(),
    skill_name: z.string().nullable(),
    instruction: z.string().nullable(),
  })),
});
export type RegisterPipelineInput = z.infer<typeof RegisterPipelineInputSchema>;

// ─── Skill Dispatch Schemas ───

const SkillPermissionsSchema = z.object({
  filesystem: z.object({ read: z.boolean(), write: z.boolean() }),
  network: z.object({ read: z.boolean(), write: z.boolean() }),
  process: z.object({ spawn: z.boolean() }),
  secrets: z.object({ read: z.array(z.string()) }),
});

const SkillEnvironmentSchema = z.object({
  toolsRequired: z.array(z.string()),
  toolsOptional: z.array(z.string()),
  permissions: SkillPermissionsSchema,
  externalSideEffects: z.boolean(),
  executionMode: z.enum(['advisory', 'assistive', 'active', 'destructive']),
});

const SkillDispatchFieldSchema = z.object({
  targetSelection: z.object({
    repoPolicy: z.string(),
    runtimeOptions: z.array(z.string()),
  }),
  workerClass: z.array(z.string()),
  handoff: z.object({
    inputArtifacts: z.array(z.string()),
    outputArtifacts: z.array(z.string()),
  }),
  executionPolicy: z.object({
    sync: z.boolean(),
    retries: z.number(),
    timeoutMinutes: z.number(),
    escalationOnFailure: z.boolean(),
  }),
  approval: z.object({
    requireHumanBeforeDispatch: z.boolean(),
    requireHumanBeforeMerge: z.boolean(),
  }),
});

const SkillVerificationSchema = z.object({
  smokeChecks: z.array(z.string()),
  assertions: z.array(z.string()),
  humanCheckpoints: z.array(z.string()),
  outcomeSignals: z.array(z.string()),
});

const DispatchContextSchema = z.object({
  conversationId: z.string().optional(),
  userMessage: z.string(),
  workingDir: z.string().optional(),
  inputs: z.record(z.string()),
});

const ApprovalTokenSchema = z.object({
  pendingId: z.string(),
  approvedBy: z.string(),
  approvedAt: z.string(),
});

export const SkillDispatchRequestSchema = z.object({
  skillId: z.string(),
  skillName: z.string(),
  skillVersion: z.string(),
  skillContent: z.string(),
  environment: SkillEnvironmentSchema,
  dispatch: SkillDispatchFieldSchema,
  verification: SkillVerificationSchema,
  context: DispatchContextSchema,
  approvalToken: ApprovalTokenSchema.optional(),
});
export type SkillDispatchRequest = z.infer<typeof SkillDispatchRequestSchema>;

const StepResultSchema = z.object({
  stepId: z.string(),
  type: z.string(),
  status: z.enum(['success', 'failure', 'skipped']),
  artifacts: z.array(z.string()),
});

const TelemetryReportSchema = z.object({
  tokensUsed: z.number(),
  costUsd: z.number(),
  runtime: z.string(),
  model: z.string(),
  stepsExecuted: z.number(),
});

export const SkillDispatchResultSchema = z.object({
  skillId: z.string(),
  status: z.enum(['success', 'failure', 'partial', 'cancelled']),
  durationMs: z.number(),
  steps: z.array(StepResultSchema),
  outputs: z.record(z.string()),
  verification: z.object({
    smokeChecksPassed: z.boolean(),
    failedChecks: z.array(z.string()),
  }),
  telemetry: TelemetryReportSchema,
});
export type SkillDispatchResult = z.infer<typeof SkillDispatchResultSchema>;

// ─── Forge Build Schemas ───

const RegimeSchema = z.enum(['economic', 'capability', 'leverage', 'expression', 'governance', 'identity']);

const EconomicForgeContextSchema = z.object({
  kind: z.literal('economic'),
  buyerHypothesis: z.string(),
  painHypothesis: z.string(),
  vehicleType: z.string(),
  paymentEvidence: z.array(z.string()),
  whyThisVehicleNow: z.array(z.string()),
  nextSignalAfterBuild: z.array(z.string()),
});

const WorldFormSchema = z.enum(['market', 'commons', 'town', 'port', 'night_engine', 'managed_knowledge_field']);

const GovernanceForgeContextSchema = z.object({
  kind: z.literal('governance'),
  worldForm: WorldFormSchema,
  minimumWorldShape: z.array(z.string()),
  firstCycleDesign: z.array(z.string()),
  stateDensityAssessment: z.enum(['low', 'medium', 'high']),
  governancePressureAssessment: z.enum(['low', 'medium', 'high']),
  thyraHandoffRequirements: z.array(z.string()),
});

export const ForgeBuildRequestSchema = z.object({
  sessionId: z.string(),
  candidateId: z.string(),
  regime: RegimeSchema,
  verdict: z.literal('commit'),
  whatToBuild: z.array(z.string()),
  whatNotToBuild: z.array(z.string()),
  rationale: z.array(z.string()),
  evidenceUsed: z.array(z.string()),
  unresolvedRisks: z.array(z.string()),
  regimeContext: z.discriminatedUnion('kind', [EconomicForgeContextSchema, GovernanceForgeContextSchema]),
  context: z.object({
    workingDir: z.string().optional(),
    targetRepo: z.string().optional(),
  }),
});
export type ForgeBuildRequest = z.infer<typeof ForgeBuildRequestSchema>;

const ArtifactSchema = z.object({
  type: z.enum(['file', 'pr', 'config', 'spec']),
  path: z.string(),
  description: z.string(),
});

export const ForgeBuildResultSchema = z.object({
  sessionId: z.string(),
  status: z.enum(['success', 'failure', 'partial']),
  durationMs: z.number(),
  artifacts: z.array(ArtifactSchema),
  steps: z.array(StepResultSchema),
  telemetry: TelemetryReportSchema,
});
export type ForgeBuildResult = z.infer<typeof ForgeBuildResultSchema>;

// ─── Dispatch Status Schema ───

export const DispatchStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  type: z.enum(['skill', 'forge']),
  createdAt: z.string(),
  updatedAt: z.string(),
  result: SkillDispatchResultSchema.or(ForgeBuildResultSchema).nullable(),
});
export type DispatchStatus = z.infer<typeof DispatchStatusSchema>;

export const CancelResultSchema = z.object({
  id: z.string(),
  cancelled: z.boolean(),
});
export type CancelResult = z.infer<typeof CancelResultSchema>;
