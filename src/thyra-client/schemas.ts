import { z } from 'zod';

// ─── Error Classes ───

export class ThyraError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ThyraError';
  }
}

export class ThyraNetworkError extends ThyraError {
  readonly retryable = true as const;
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ThyraNetworkError';
  }
}

export class ThyraHttpError extends ThyraError {
  readonly retryable: boolean;
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'ThyraHttpError';
    this.retryable = status >= 500 || status === 429;
  }
}

export class ThyraValidationError extends ThyraError {
  readonly retryable = false as const;
  constructor(public readonly zodError: z.ZodError) {
    super(`Response validation failed: ${zodError.message}`);
    this.name = 'ThyraValidationError';
  }
}

export class ThyraApiError extends ThyraError {
  readonly retryable = false as const;
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ThyraApiError';
  }
}

// ─── Response Schemas ───

export const ThyraErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export function thyraSuccess<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
  });
}

export const ThyraResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    thyraSuccess(dataSchema),
    ThyraErrorResponseSchema,
  ]);

// ─── Entity Data Schemas ───

export const VillageDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  target_repo: z.string(),
});
export type VillageData = z.infer<typeof VillageDataSchema>;

export const ConstitutionDataSchema = z.object({
  id: z.string(),
  village_id: z.string(),
});
export type ConstitutionData = z.infer<typeof ConstitutionDataSchema>;

export const ActiveConstitutionDataSchema = z.object({
  id: z.string(),
  village_id: z.string(),
  rules: z.array(z.object({
    description: z.string(),
    enforcement: z.enum(['hard', 'soft']),
    scope: z.array(z.string()),
  })),
  allowed_permissions: z.array(z.string()).optional(),
  budget_limits: z.object({
    max_cost_per_action: z.number(),
    max_cost_per_day: z.number(),
    max_cost_per_loop: z.number(),
  }).optional(),
});
export type ActiveConstitutionData = z.infer<typeof ActiveConstitutionDataSchema>;

export const ChiefDataSchema = z.object({
  id: z.string(),
  village_id: z.string(),
  name: z.string(),
  role: z.string().optional(),
  personality: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});
export type ChiefData = z.infer<typeof ChiefDataSchema>;

export const SkillDataSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type SkillData = z.infer<typeof SkillDataSchema>;

export const PackApplyDataSchema = z.object({
  village_id: z.string(),
  applied: z.boolean(),
});
export type PackApplyData = z.infer<typeof PackApplyDataSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ─── Input Schemas ───

export const CreateVillageInputSchema = z.object({
  name: z.string().min(1),
  target_repo: z.string().min(1),
});
export type CreateVillageInput = z.infer<typeof CreateVillageInputSchema>;

export const CreateConstitutionInputSchema = z.object({
  rules: z.array(z.object({
    description: z.string(),
    enforcement: z.enum(['hard', 'soft']),
    scope: z.array(z.string()),
  })),
  allowed_permissions: z.array(z.string()).optional(),
  budget_limits: z.object({
    max_cost_per_action: z.number(),
    max_cost_per_day: z.number(),
    max_cost_per_loop: z.number(),
  }).optional(),
});
export type CreateConstitutionInput = z.infer<typeof CreateConstitutionInputSchema>;

export const CreateChiefInputSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  personality: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});
export type CreateChiefInput = z.infer<typeof CreateChiefInputSchema>;

export const CreateSkillInputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
});
export type CreateSkillInput = z.infer<typeof CreateSkillInputSchema>;
