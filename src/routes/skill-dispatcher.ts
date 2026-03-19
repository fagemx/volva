import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { Database } from 'bun:sqlite';
import type { SkillObject } from '../schemas/skill-object';
import type { SkillObjectLookup } from '../skills/types';
import type { SkillDispatchRequest, SkillDispatchResult } from '../karvi-client/schemas';
import { KarviClient } from '../karvi-client/client';
import { KarviNetworkError, KarviApiError } from '../karvi-client/schemas';
import { mergeSkillObject } from '../skills/overlay-merge';
import { recordRun } from '../skills/telemetry';

// ─── Types ───

export interface SkillDispatchContext {
  skillId: string;
  conversationId?: string;
  userMessage: string;
  workingDir?: string;
  inputs: Record<string, string>;
}

export type SkillDispatchOutcome =
  | { type: 'dispatched'; result: SkillDispatchResult }
  | { type: 'approval_required'; pendingId: string; skillName: string; permissions: SkillObject['environment']['permissions']; sideEffects: boolean }
  | { type: 'fallback_local'; reason: string };

export interface DispatchDeps {
  skillObjectLookup: SkillObjectLookup;
  karviClient: KarviClient;
  db: Database;
  readSkillContent?: (skillFilePath: string) => string;
  dispatchOverlay?: Record<string, unknown>;
}

// ─── Pure Functions ───

/**
 * Read SKILL.md content from the skill package directory.
 * The skill.object.yaml filePath points to e.g. /path/to/skills/deploy/skill.object.yaml
 * The SKILL.md should be in the same directory.
 */
export function readSkillMdContent(skillFilePath: string): string {
  const dir = dirname(skillFilePath);
  const skillMdPath = join(dir, 'SKILL.md');
  return readFileSync(skillMdPath, 'utf-8');
}

/**
 * Build a SkillDispatchRequest from a merged SkillObject and dispatch context.
 * Pure function — no side effects.
 */
export function buildDispatchRequest(
  merged: SkillObject,
  ctx: SkillDispatchContext,
  skillContent: string,
): SkillDispatchRequest {
  return {
    skillId: merged.id,
    skillName: merged.name,
    skillVersion: merged.version,
    skillContent,
    environment: {
      toolsRequired: merged.environment.toolsRequired,
      toolsOptional: merged.environment.toolsOptional,
      permissions: merged.environment.permissions,
      externalSideEffects: merged.environment.externalSideEffects,
      executionMode: merged.environment.executionMode,
    },
    dispatch: {
      targetSelection: merged.dispatch.targetSelection,
      workerClass: merged.dispatch.workerClass,
      handoff: merged.dispatch.handoff,
      executionPolicy: merged.dispatch.executionPolicy,
      approval: merged.dispatch.approval,
    },
    verification: {
      smokeChecks: merged.verification.smokeChecks,
      assertions: merged.verification.assertions,
      humanCheckpoints: merged.verification.humanCheckpoints,
      outcomeSignals: merged.verification.outcomeSignals,
    },
    context: {
      conversationId: ctx.conversationId,
      userMessage: ctx.userMessage,
      workingDir: ctx.workingDir,
      inputs: ctx.inputs,
    },
  };
}

// ─── Dispatch Orchestration ───

/**
 * Dispatch a skill to Karvi for remote execution.
 *
 * Returns a discriminated union:
 * - 'dispatched': Karvi executed the skill successfully (or with failure status)
 * - 'approval_required': Karvi needs human approval before dispatch
 * - 'fallback_local': Karvi is unreachable or skill is not configured for Karvi
 */
export async function dispatchToKarvi(
  ctx: SkillDispatchContext,
  deps: DispatchDeps,
): Promise<SkillDispatchOutcome> {
  // 1. Look up skill object
  const skillObj = deps.skillObjectLookup.getSkillObject(ctx.skillId);
  if (!skillObj) {
    return { type: 'fallback_local', reason: `Skill not found: ${ctx.skillId}` };
  }

  // 2. Check dispatch mode
  if (skillObj.dispatch.mode !== 'karvi') {
    return { type: 'fallback_local', reason: `Skill dispatch.mode is '${skillObj.dispatch.mode}', not 'karvi'` };
  }

  // 3. Merge with dispatch overlay (four-plane-ownership)
  const merged = deps.dispatchOverlay
    ? mergeSkillObject(skillObj, deps.dispatchOverlay)
    : skillObj;

  // 4. Read SKILL.md content
  const readContent = deps.readSkillContent ?? readSkillMdContent;
  let skillContent: string;
  try {
    // Find the file path from the registry index entry
    skillContent = readContent(ctx.skillId);
  } catch {
    return { type: 'fallback_local', reason: 'Failed to read SKILL.md content' };
  }

  // 5. Build request
  const request = buildDispatchRequest(merged, ctx, skillContent);

  // 6. Dispatch to Karvi
  try {
    const dispatchResponse = await deps.karviClient.dispatchSkill(request);

    // 7. Poll for completion
    const result = await pollForCompletion(
      dispatchResponse.dispatchId,
      deps.karviClient,
      merged.dispatch.executionPolicy.timeoutMinutes,
    );

    // 8. Record telemetry
    recordRun(deps.db, {
      skillInstanceId: ctx.skillId,
      conversationId: ctx.conversationId,
      outcome: mapResultStatus(result.status),
      durationMs: result.durationMs,
      notes: `Karvi dispatch: ${dispatchResponse.dispatchId}`,
    });

    return { type: 'dispatched', result };
  } catch (error) {
    // Handle APPROVAL_REQUIRED
    if (error instanceof KarviApiError && error.code === 'APPROVAL_REQUIRED') {
      return {
        type: 'approval_required',
        pendingId: error.message,
        skillName: merged.name,
        permissions: merged.environment.permissions,
        sideEffects: merged.environment.externalSideEffects,
      };
    }

    // Graceful fallback on network errors
    if (error instanceof KarviNetworkError) {
      console.error('[skill-dispatcher] Karvi unreachable, falling back to local:', error.message);
      return { type: 'fallback_local', reason: `Karvi unreachable: ${error.message}` };
    }

    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Re-submit a dispatch request with approval token after user approves.
 */
export async function resubmitWithApproval(
  ctx: SkillDispatchContext,
  approvalToken: { pendingId: string; approvedBy: string; approvedAt: string },
  deps: DispatchDeps,
): Promise<SkillDispatchOutcome> {
  const skillObj = deps.skillObjectLookup.getSkillObject(ctx.skillId);
  if (!skillObj) {
    return { type: 'fallback_local', reason: `Skill not found: ${ctx.skillId}` };
  }

  const merged = deps.dispatchOverlay
    ? mergeSkillObject(skillObj, deps.dispatchOverlay)
    : skillObj;

  const readContent = deps.readSkillContent ?? readSkillMdContent;
  let skillContent: string;
  try {
    skillContent = readContent(ctx.skillId);
  } catch {
    return { type: 'fallback_local', reason: 'Failed to read SKILL.md content' };
  }

  const request: SkillDispatchRequest = {
    ...buildDispatchRequest(merged, ctx, skillContent),
    approvalToken,
  };

  try {
    const dispatchResponse = await deps.karviClient.dispatchSkill(request);

    const result = await pollForCompletion(
      dispatchResponse.dispatchId,
      deps.karviClient,
      merged.dispatch.executionPolicy.timeoutMinutes,
    );

    recordRun(deps.db, {
      skillInstanceId: ctx.skillId,
      conversationId: ctx.conversationId,
      outcome: mapResultStatus(result.status),
      durationMs: result.durationMs,
      notes: `Karvi dispatch (approved): ${dispatchResponse.dispatchId}`,
    });

    return { type: 'dispatched', result };
  } catch (error) {
    if (error instanceof KarviNetworkError) {
      console.error('[skill-dispatcher] Karvi unreachable on resubmit:', error.message);
      return { type: 'fallback_local', reason: `Karvi unreachable: ${error.message}` };
    }
    throw error;
  }
}

// ─── Internal Helpers ───

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = (timeoutMinutes: number) => Math.ceil((timeoutMinutes * 60 * 1000) / POLL_INTERVAL_MS);

async function pollForCompletion(
  dispatchId: string,
  client: KarviClient,
  timeoutMinutes: number,
): Promise<SkillDispatchResult> {
  const maxAttempts = MAX_POLL_ATTEMPTS(timeoutMinutes);

  for (let i = 0; i < maxAttempts; i++) {
    const status = await client.getDispatchStatus(dispatchId);

    if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
      if (status.result && 'outputs' in status.result) {
        return status.result;
      }
      // Terminal state but no result — construct minimal result
      return {
        skillId: '',
        status: status.status === 'completed' ? 'success' : 'failure',
        durationMs: 0,
        steps: [],
        outputs: {},
        verification: { smokeChecksPassed: false, failedChecks: [] },
        telemetry: { tokensUsed: 0, costUsd: 0, runtime: 'unknown', model: 'unknown', stepsExecuted: 0 },
      };
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Timeout — best-effort cancel on Karvi side
  try {
    await client.cancelDispatch(dispatchId);
  } catch {
    // Karvi may already be done or unreachable — non-fatal
  }

  return {
    skillId: '',
    status: 'failure',
    durationMs: timeoutMinutes * 60 * 1000,
    steps: [],
    outputs: {},
    verification: { smokeChecksPassed: false, failedChecks: ['timeout'] },
    telemetry: { tokensUsed: 0, costUsd: 0, runtime: 'unknown', model: 'unknown', stepsExecuted: 0 },
  };
}

function mapResultStatus(status: SkillDispatchResult['status']): 'success' | 'failure' | 'partial' {
  switch (status) {
    case 'success':
      return 'success';
    case 'partial':
      return 'partial';
    case 'failure':
    case 'cancelled':
      return 'failure';
  }
}
