import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import type { Database } from 'bun:sqlite';
import type { SkillObject } from '../schemas/skill-object';
import type { SkillObjectLookup } from '../skills/types';
import type { SkillDispatchRequest } from '../karvi-client/schemas';
import { KarviClient } from '../karvi-client/client';
import { KarviNetworkError, KarviApiError } from '../karvi-client/schemas';
import { mergeSkillObject } from '../skills/overlay-merge';

// ─── Types ───

export interface SkillDispatchContext {
  skillId: string;
  conversationId?: string;
  userMessage: string;
  workingDir?: string;
  inputs: Record<string, string>;
}

export type SkillDispatchOutcome =
  | { type: 'dispatched'; dispatchId: string; status: string }
  | { type: 'approval_required'; pendingId: string; skillName: string; permissions: SkillObject['environment']['permissions']; sideEffects: boolean; executionMode: string }
  | { type: 'fallback_local'; reason: string }
  | { type: 'queued'; queueId: string; reason: string }
  | { type: 'rejected'; reason: string };

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

  // 4. Health check before dispatch
  const health = await deps.karviClient.getHealth();
  if (!health.ok) {
    const fallbackStrategy = merged.dispatch.fallback;
    const reason = 'Karvi health check failed';

    switch (fallbackStrategy) {
      case 'local':
        console.warn('[skill-dispatcher] Karvi unhealthy, falling back to local');
        return { type: 'fallback_local', reason };
      case 'queue':
        return enqueueDispatch(deps.db, merged, ctx, reason);
      case 'reject':
        return { type: 'rejected', reason };
    }
  }

  // 5. Read SKILL.md content
  const readContent = deps.readSkillContent ?? readSkillMdContent;
  let skillContent: string;
  try {
    // Find the file path from the registry index entry
    skillContent = readContent(ctx.skillId);
  } catch {
    return { type: 'fallback_local', reason: 'Failed to read SKILL.md content' };
  }

  // 6. Build request
  const request = buildDispatchRequest(merged, ctx, skillContent);

  // 7. Dispatch to Karvi
  try {
    const dispatchResponse = await deps.karviClient.dispatchSkill(request);

    // Return immediately - client will poll for completion via GET /api/dispatches/:id/status
    return { type: 'dispatched', dispatchId: dispatchResponse.dispatchId, status: dispatchResponse.status };
  } catch (error) {
    // Handle APPROVAL_REQUIRED
    if (error instanceof KarviApiError && error.code === 'APPROVAL_REQUIRED') {
      return {
        type: 'approval_required',
        pendingId: error.details?.pendingApprovalId ?? error.message,
        skillName: merged.name,
        permissions: merged.environment.permissions,
        sideEffects: merged.environment.externalSideEffects,
        executionMode: merged.environment.executionMode,
      };
    }

    // Graceful fallback on network errors — respects per-skill fallback strategy
    if (error instanceof KarviNetworkError) {
      const fallbackStrategy = merged.dispatch.fallback;
      const reason = `Karvi unreachable: ${error.message}`;

      switch (fallbackStrategy) {
        case 'local':
          console.error('[skill-dispatcher] Karvi unreachable, falling back to local:', error.message);
          return { type: 'fallback_local', reason };
        case 'queue':
          return enqueueDispatch(deps.db, merged, ctx, reason);
        case 'reject':
          return { type: 'rejected', reason };
      }
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

  // Health check before resubmit
  const health = await deps.karviClient.getHealth();
  if (!health.ok) {
    const fallbackStrategy = merged.dispatch.fallback;
    const reason = 'Karvi health check failed on resubmit';

    switch (fallbackStrategy) {
      case 'local':
        console.warn('[skill-dispatcher] Karvi unhealthy on resubmit, falling back to local');
        return { type: 'fallback_local', reason };
      case 'queue':
        return enqueueDispatch(deps.db, merged, ctx, reason);
      case 'reject':
        return { type: 'rejected', reason };
    }
  }

  try {
    const dispatchResponse = await deps.karviClient.dispatchSkill(request);

    // Return immediately - client will poll for completion via GET /api/dispatches/:id/status
    return { type: 'dispatched', dispatchId: dispatchResponse.dispatchId, status: dispatchResponse.status };
  } catch (error) {
    if (error instanceof KarviNetworkError) {
      const fallbackStrategy = merged.dispatch.fallback;
      const reason = `Karvi unreachable on resubmit: ${error.message}`;

      switch (fallbackStrategy) {
        case 'local':
          console.error('[skill-dispatcher] Karvi unreachable on resubmit:', error.message);
          return { type: 'fallback_local', reason };
        case 'queue':
          return enqueueDispatch(deps.db, merged, ctx, reason);
        case 'reject':
          return { type: 'rejected', reason };
      }
    }
    throw error;
  }
}

// ─── Queue Helpers ───

/**
 * Enqueue a dispatch request for later retry when Karvi reconnects.
 */
function enqueueDispatch(
  db: Database,
  merged: SkillObject,
  ctx: SkillDispatchContext,
  reason: string,
): SkillDispatchOutcome {
  const queueId = `dq_${crypto.randomUUID()}`;
  const request = buildDispatchRequest(merged, ctx, '');

  db.prepare(
    `INSERT INTO dispatch_queue (id, skill_id, conversation_id, request_json, fallback_reason, max_retries)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    queueId,
    ctx.skillId,
    ctx.conversationId ?? null,
    JSON.stringify(request),
    reason,
    merged.dispatch.executionPolicy.retries,
  );

  return { type: 'queued', queueId, reason };
}

/**
 * Process pending items in the dispatch queue.
 * Checks Karvi health first — if unhealthy, returns immediately.
 * On success, marks items as 'dispatched'. On failure, increments retry_count
 * with exponential backoff, or marks as 'failed' when retries exhausted.
 */
export async function processDispatchQueue(
  karviClient: KarviClient,
  db: Database,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const health = await karviClient.getHealth();
  if (!health.ok) return { processed: 0, succeeded: 0, failed: 0 };

  const pending = db.prepare(
    `SELECT * FROM dispatch_queue
     WHERE status = 'pending' AND next_retry_at <= datetime('now')
     ORDER BY created_at ASC LIMIT 10`,
  ).all() as Array<Record<string, unknown>>;

  let succeeded = 0;
  let failed = 0;

  for (const row of pending) {
    const request = JSON.parse(row.request_json as string) as SkillDispatchRequest;
    const rowId = row.id as string;
    try {
      await karviClient.dispatchSkill(request);
      db.prepare(
        `UPDATE dispatch_queue SET status = 'dispatched', updated_at = datetime('now') WHERE id = ?`,
      ).run(rowId);
      succeeded++;
    } catch {
      const retryCount = (row.retry_count as number) + 1;
      const maxRetries = row.max_retries as number;
      if (retryCount >= maxRetries) {
        db.prepare(
          `UPDATE dispatch_queue SET status = 'failed', retry_count = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(retryCount, rowId);
      } else {
        const delayMinutes = Math.pow(2, retryCount - 1);
        db.prepare(
          `UPDATE dispatch_queue SET retry_count = ?, next_retry_at = datetime('now', '+' || ? || ' minutes'), updated_at = datetime('now') WHERE id = ?`,
        ).run(retryCount, delayMinutes, rowId);
      }
      failed++;
    }
  }

  return { processed: pending.length, succeeded, failed };
}
