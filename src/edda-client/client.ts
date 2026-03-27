import { z } from 'zod';
import { BaseFetchClient, type BaseFetchClientOptions, type BaseNetworkError, type BaseHttpStatusError } from '../shared/http-client';
import {
  type QueryDecisionsInput,
  type DecisionData,
  type DecisionOutcomeData,
  DecisionDataSchema,
  DecisionOutcomeDataSchema,
  EddaErrorResponseSchema,
  eddaSuccess,
  EddaNetworkError,
  EddaHttpError,
  EddaValidationError,
  EddaApiError,
} from './schemas';

export type EddaClientOptions = BaseFetchClientOptions;

export class EddaClient extends BaseFetchClient {
  constructor(options: EddaClientOptions = {}) {
    super('http://localhost:3463', options);
  }

  protected createNetworkError(message: string, cause?: unknown): BaseNetworkError {
    return new EddaNetworkError(message, cause);
  }

  protected createHttpStatusError(status: number, statusText: string, body: string): BaseHttpStatusError {
    return new EddaHttpError(status, statusText, body);
  }

  async queryDecisions(input: QueryDecisionsInput): Promise<DecisionData[]> {
    const params = new URLSearchParams({ village_id: input.village_id });
    if (input.type !== undefined) params.set('type', input.type);
    if (input.limit !== undefined) params.set('limit', String(input.limit));
    return this.request('GET', `/api/decisions?${params.toString()}`, z.array(DecisionDataSchema));
  }

  async getDecisionOutcomes(decisionId: string): Promise<DecisionOutcomeData[]> {
    return this.request('GET', `/api/decisions/${decisionId}/outcomes`, z.array(DecisionOutcomeDataSchema));
  }

  private async request<T extends z.ZodTypeAny>(
    method: string,
    path: string,
    dataSchema: T,
    body?: unknown,
  ): Promise<z.infer<T>> {
    const response = await this.fetchWithRetry(method, path, body);
    const json: unknown = await response.json();

    // Check for error response first
    const errorParsed = EddaErrorResponseSchema.safeParse(json);
    if (errorParsed.success) {
      throw new EddaApiError(errorParsed.data.error.code, errorParsed.data.error.message);
    }

    // Parse success response
    const successSchema = eddaSuccess(dataSchema);
    const successParsed = successSchema.safeParse(json);
    if (!successParsed.success) {
      throw new EddaValidationError(successParsed.error);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Zod validated, generic inference limitation
    return successParsed.data.data as z.infer<T>;
  }
}
