import { z } from 'zod';
import {
  type RegisterPipelineInput,
  type PipelineData,
  type DeletePipelineData,
  type HealthResponse,
  PipelineDataSchema,
  DeletePipelineDataSchema,
  HealthResponseSchema,
  KarviErrorResponseSchema,
  karviSuccess,
  KarviNetworkError,
  KarviHttpError,
  KarviValidationError,
  KarviApiError,
} from './schemas';

export interface KarviClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  fetchFn?: typeof fetch;
}

export class KarviClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: KarviClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:3464';
    this.timeout = options.timeout ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async registerPipeline(input: RegisterPipelineInput): Promise<PipelineData> {
    return this.request('POST', '/api/pipelines', PipelineDataSchema, input);
  }

  async listPipelines(): Promise<PipelineData[]> {
    return this.request('GET', '/api/pipelines', z.array(PipelineDataSchema));
  }

  async deletePipeline(name: string): Promise<DeletePipelineData> {
    return this.request('DELETE', `/api/pipelines/${name}`, DeletePipelineDataSchema);
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
    const errorParsed = KarviErrorResponseSchema.safeParse(json);
    if (errorParsed.success) {
      throw new KarviApiError(errorParsed.data.error.code, errorParsed.data.error.message);
    }

    // Parse success response
    const successSchema = karviSuccess(dataSchema);
    const successParsed = successSchema.safeParse(json);
    if (!successParsed.success) {
      throw new KarviValidationError(successParsed.error);
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
          const error = new KarviHttpError(response.status, response.statusText, responseBody);
          if (!error.retryable) throw error;
          lastError = error;
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof KarviHttpError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new KarviNetworkError(`Request timeout after ${this.timeout}ms`, error);
          continue;
        }
        lastError = new KarviNetworkError(
          error instanceof Error ? error.message : 'Network error',
          error,
        );
        continue;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new KarviNetworkError('Request failed after retries');
  }
}
