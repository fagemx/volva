import { z } from 'zod';

// ─── Error Classes ───

export class EddaError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EddaError';
  }
}

export class EddaNetworkError extends EddaError {
  readonly retryable = true as const;
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'EddaNetworkError';
  }
}

export class EddaHttpError extends EddaError {
  readonly retryable: boolean;
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'EddaHttpError';
    this.retryable = status >= 500 || status === 429;
  }
}

export class EddaValidationError extends EddaError {
  readonly retryable = false as const;
  constructor(public readonly zodError: z.ZodError) {
    super(`Response validation failed: ${zodError.message}`);
    this.name = 'EddaValidationError';
  }
}

export class EddaApiError extends EddaError {
  readonly retryable = false as const;
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EddaApiError';
  }
}

// ─── Response Schemas ───

export const EddaErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export function eddaSuccess<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
  });
}

// ─── Entity Data Schemas ───

export const DecisionDataSchema = z.object({
  id: z.string(),
  village_id: z.string(),
  type: z.string(),
  summary: z.string(),
  context: z.string().optional(),
  created_at: z.string(),
});
export type DecisionData = z.infer<typeof DecisionDataSchema>;

export const DecisionOutcomeDataSchema = z.object({
  id: z.string(),
  decision_id: z.string(),
  outcome: z.enum(['success', 'failure', 'partial']),
  detail: z.string().optional(),
  created_at: z.string(),
});
export type DecisionOutcomeData = z.infer<typeof DecisionOutcomeDataSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ─── Query Input Types ───

export interface QueryDecisionsInput {
  village_id: string;
  type?: string;
  limit?: number;
}
