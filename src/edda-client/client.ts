import { z } from 'zod';
import {
  type QueryDecisionsInput,
  type DecisionData,
  type DecisionOutcomeData,
  type HealthResponse,
  DecisionDataSchema,
  DecisionOutcomeDataSchema,
  HealthResponseSchema,
  EddaErrorResponseSchema,
  eddaSuccess,
  EddaNetworkError,
  EddaHttpError,
  EddaValidationError,
  EddaApiError,
} from './schemas';

export interface EddaClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  fetchFn?: typeof fetch;
}

export class EddaClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: EddaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:3463';
    this.timeout = options.timeout ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
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

  async getHealth(): Promise<HealthResponse> {
    const url = `${this.baseUrl}/api/health`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, this.timeout);
      try {
        const response = await this.fetchFn(url, { signal: controller.signal });
        const json: unknown = await response.json();
        const parsed = HealthResponseSchema.safeParse(json);
        return parsed.success ? parsed.data : { ok: false };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { ok: false };
    }
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

  private async fetchWithRetry(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, this.timeout);

      try {
        const response = await this.fetchFn(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const responseBody = await response.text();
          const error = new EddaHttpError(response.status, response.statusText, responseBody);
          if (!error.retryable) throw error;
          lastError = error;
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof EddaHttpError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new EddaNetworkError(`Request timeout after ${this.timeout}ms`, error);
          continue;
        }
        lastError = new EddaNetworkError(
          error instanceof Error ? error.message : 'Network error',
          error,
        );
        continue;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new EddaNetworkError('Request failed after retries');
  }
}
