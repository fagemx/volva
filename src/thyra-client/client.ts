import { z } from 'zod';
import { BaseFetchClient, type BaseFetchClientOptions, type BaseNetworkError, type BaseHttpStatusError } from '../shared/http-client';
import {
  type CreateVillageInput,
  type CreateConstitutionInput,
  type CreateChiefInput,
  type CreateSkillInput,
  type VillageData,
  type ConstitutionData,
  type ActiveConstitutionData,
  type ChiefData,
  type SkillData,
  type PackApplyData,
  VillageDataSchema,
  ConstitutionDataSchema,
  ActiveConstitutionDataSchema,
  ChiefDataSchema,
  SkillDataSchema,
  PackApplyDataSchema,
  ThyraErrorResponseSchema,
  thyraSuccess,
  ThyraNetworkError,
  ThyraHttpError,
  ThyraValidationError,
  ThyraApiError,
} from './schemas';

export type ThyraClientOptions = BaseFetchClientOptions;

export class ThyraClient extends BaseFetchClient {
  constructor(options: ThyraClientOptions = {}) {
    super('http://localhost:3462', options);
  }

  protected createNetworkError(message: string, cause?: unknown): BaseNetworkError {
    return new ThyraNetworkError(message, cause);
  }

  protected createHttpStatusError(status: number, statusText: string, body: string): BaseHttpStatusError {
    return new ThyraHttpError(status, statusText, body);
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

  async getSkills(): Promise<SkillData[]> {
    return this.request('GET', '/api/skills', z.array(SkillDataSchema));
  }

  async getVillage(id: string): Promise<VillageData> {
    return this.request('GET', `/api/villages/${id}`, VillageDataSchema);
  }

  async getActiveConstitution(villageId: string): Promise<ActiveConstitutionData> {
    return this.request('GET', `/api/villages/${villageId}/constitutions/active`, ActiveConstitutionDataSchema);
  }

  async getChiefs(villageId: string): Promise<ChiefData[]> {
    return this.request('GET', `/api/villages/${villageId}/chiefs`, z.array(ChiefDataSchema));
  }

  async applyVillagePack(yaml: string): Promise<PackApplyData> {
    return this.request('POST', '/api/villages/pack/apply', PackApplyDataSchema, { yaml });
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
}
