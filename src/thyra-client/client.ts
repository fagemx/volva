import { z } from 'zod';
import {
  type CreateVillageInput,
  type CreateConstitutionInput,
  type CreateChiefInput,
  type CreateSkillInput,
  type VillageData,
  type ConstitutionData,
  type ChiefData,
  type SkillData,
  type PackApplyData,
  type HealthResponse,
  VillageDataSchema,
  ConstitutionDataSchema,
  ChiefDataSchema,
  SkillDataSchema,
  PackApplyDataSchema,
  HealthResponseSchema,
  ThyraErrorResponseSchema,
  thyraSuccess,
  ThyraNetworkError,
  ThyraHttpError,
  ThyraValidationError,
  ThyraApiError,
} from './schemas';

export interface ThyraClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  fetchFn?: typeof fetch;
}

export class ThyraClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: ThyraClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:3462';
    this.timeout = options.timeout ?? 10_000;
    this.retries = options.retries ?? 2;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async createVillage(input: CreateVillageInput): Promise<VillageData> {
    return this.request('POST', '/api/villages', VillageDataSchema, input);
  }

  async createConstitution(villageId: string, input: CreateConstitutionInput): Promise<ConstitutionData> {
    return this.request('POST', `/api/villages/${villageId}/constitutions`, ConstitutionDataSchema, input);
  }

  async createChief(villageId: string, input: CreateChiefInput): Promise<ChiefData> {
    return this.request('POST', `/api/villages/${villageId}/chiefs`, ChiefDataSchema, input);
  }

  async createSkill(input: CreateSkillInput): Promise<SkillData> {
    return this.request('POST', '/api/skills', SkillDataSchema, input);
  }

  async applyVillagePack(yaml: string): Promise<PackApplyData> {
    return this.request('POST', '/api/villages/pack/apply', PackApplyDataSchema, { yaml });
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
    const errorParsed = ThyraErrorResponseSchema.safeParse(json);
    if (errorParsed.success) {
      throw new ThyraApiError(errorParsed.data.error.code, errorParsed.data.error.message);
    }

    // Parse success response
    const successSchema = thyraSuccess(dataSchema);
    const successParsed = successSchema.safeParse(json);
    if (!successParsed.success) {
      throw new ThyraValidationError(successParsed.error);
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
          const error = new ThyraHttpError(response.status, response.statusText, responseBody);
          if (!error.retryable) throw error;
          lastError = error;
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof ThyraHttpError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new ThyraNetworkError(`Request timeout after ${this.timeout}ms`, error);
          continue;
        }
        lastError = new ThyraNetworkError(
          error instanceof Error ? error.message : 'Network error',
          error,
        );
        continue;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new ThyraNetworkError('Request failed after retries');
  }
}
