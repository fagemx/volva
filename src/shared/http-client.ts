import { z } from 'zod';

// ─── Base Error Classes ───

export class BaseHttpError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'BaseHttpError';
  }
}

export class BaseNetworkError extends BaseHttpError {
  readonly retryable = true as const;
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'BaseNetworkError';
  }
}

export class BaseHttpStatusError extends BaseHttpError {
  readonly retryable: boolean;
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'BaseHttpStatusError';
    this.retryable = status >= 500 || status === 429;
  }
}

// ─── Base Health Response Schema ───

export const BaseHealthResponseSchema = z.object({
  ok: z.boolean(),
});
export type BaseHealthResponse = z.infer<typeof BaseHealthResponseSchema>;

// ─── Base Client Options ───

export interface BaseFetchClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  fetchFn?: typeof fetch;
}

// ─── Base Fetch Client ───

export abstract class BaseFetchClient {
  protected readonly baseUrl: string;
  protected readonly timeout: number;
  protected readonly retries: number;
  protected readonly fetchFn: typeof fetch;

  constructor(
    defaultBaseUrl: string,
    options: BaseFetchClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? defaultBaseUrl;
    this.timeout = options.timeout ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /** Override to create the service-specific network error. */
  protected abstract createNetworkError(message: string, cause?: unknown): BaseNetworkError;

  /** Override to create the service-specific HTTP status error. */
  protected abstract createHttpStatusError(status: number, statusText: string, body: string): BaseHttpStatusError;

  async getHealth(): Promise<BaseHealthResponse> {
    const url = `${this.baseUrl}/api/health`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, this.timeout);
      try {
        const response = await this.fetchFn(url, { signal: controller.signal });
        const json: unknown = await response.json();
        const parsed = BaseHealthResponseSchema.safeParse(json);
        return parsed.success ? parsed.data : { ok: false };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { ok: false };
    }
  }

  protected async fetchWithRetry(
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
          const error = this.createHttpStatusError(response.status, response.statusText, responseBody);
          if (!error.retryable) throw error;
          lastError = error;
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof BaseHttpStatusError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = this.createNetworkError(`Request timeout after ${this.timeout}ms`, error);
          continue;
        }
        lastError = this.createNetworkError(
          error instanceof Error ? error.message : 'Network error',
          error,
        );
        continue;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? this.createNetworkError('Request failed after retries');
  }
}
