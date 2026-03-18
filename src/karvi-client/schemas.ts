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
