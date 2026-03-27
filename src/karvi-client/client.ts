import { z } from 'zod';
import { BaseFetchClient, type BaseFetchClientOptions, type BaseNetworkError, type BaseHttpStatusError } from '../shared/http-client';
import {
  type RegisterPipelineInput,
  type PipelineData,
  type DeletePipelineData,
  type SkillDispatchRequest,
  type ForgeBuildRequest,
  type ForgeBuildDispatchData,
  type DispatchStatus,
  type CancelResult,
  PipelineDataSchema,
  DeletePipelineDataSchema,
  DispatchStatusSchema,
  ForgeBuildDispatchDataSchema,
  CancelResultSchema,
  KarviErrorResponseSchema,
  karviSuccess,
  KarviNetworkError,
  KarviHttpError,
  KarviValidationError,
  KarviApiError,
} from './schemas';

export type KarviClientOptions = BaseFetchClientOptions;

export class KarviClient extends BaseFetchClient {
  constructor(options: KarviClientOptions = {}) {
    super('http://localhost:3464', options);
  }

  protected createNetworkError(message: string, cause?: unknown): BaseNetworkError {
    return new KarviNetworkError(message, cause);
  }

  protected createHttpStatusError(status: number, statusText: string, body: string): BaseHttpStatusError {
    return new KarviHttpError(status, statusText, body);
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

  async dispatchSkill(req: SkillDispatchRequest): Promise<{ dispatchId: string; status: string }> {
    return this.request('POST', '/api/volva/dispatch-skill', z.object({
      dispatchId: z.string(),
      status: z.string(),
    }), req);
  }

  async forgeBuild(req: ForgeBuildRequest): Promise<ForgeBuildDispatchData> {
    return this.request('POST', '/api/volva/forge-build', ForgeBuildDispatchDataSchema, req);
  }

  async getDispatchStatus(id: string): Promise<DispatchStatus> {
    return this.request('GET', `/api/volva/status/${id}`, DispatchStatusSchema);
  }

  async cancelDispatch(id: string): Promise<CancelResult> {
    return this.request('POST', `/api/volva/cancel/${id}`, CancelResultSchema);
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
      const details: Record<string, string> = {};
      if (errorParsed.data.error.pendingApprovalId) {
        details.pendingApprovalId = errorParsed.data.error.pendingApprovalId;
      }
      throw new KarviApiError(
        errorParsed.data.error.code,
        errorParsed.data.error.message,
        Object.keys(details).length > 0 ? details : undefined,
      );
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
}
