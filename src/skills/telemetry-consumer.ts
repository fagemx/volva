import type { Database } from 'bun:sqlite';
import type { SkillDispatchResult, ForgeBuildResult } from '../karvi-client/schemas';
import { recordRun, recordForgeBuild } from './telemetry';

export interface ConsumeSkillOptions {
  conversationId?: string;
  escalationOnFailure?: boolean;
}

export interface ConsumeSkillOutcome {
  runId: string;
  outcome: 'success' | 'failure' | 'partial';
  escalate: boolean;
}

export interface ConsumeForgeOutcome {
  buildId: string;
  outcome: 'success' | 'failure' | 'partial';
}

function mapSkillStatus(
  status: SkillDispatchResult['status'],
): 'success' | 'failure' | 'partial' {
  if (status === 'cancelled') return 'failure';
  return status;
}

function extractFailedSteps(
  steps: SkillDispatchResult['steps'],
): string[] {
  return steps
    .filter((s) => s.status === 'failure')
    .map((s) => `${s.stepId}: ${s.type}`);
}

/**
 * Consumes a SkillDispatchResult from Karvi and records it in Volva's telemetry.
 *
 * - Maps Karvi status to Volva outcome (cancelled → failure)
 * - Stores token/cost data from TelemetryReport
 * - Updates skill_instances counters via recordRun
 * - Returns escalation signal when failure + escalationOnFailure
 */
export function consumeSkillResult(
  db: Database,
  skillInstanceId: string,
  result: SkillDispatchResult,
  options: ConsumeSkillOptions = {},
): ConsumeSkillOutcome {
  const outcome = mapSkillStatus(result.status);
  const failedSteps = extractFailedSteps(result.steps);

  const notes =
    outcome === 'partial' || outcome === 'failure'
      ? failedSteps.length > 0
        ? `Failed steps: ${failedSteps.join(', ')}`
        : undefined
      : undefined;

  const runId = recordRun(db, {
    skillInstanceId,
    conversationId: options.conversationId,
    outcome,
    durationMs: result.durationMs,
    tokensUsed: result.telemetry.tokensUsed,
    costUsd: result.telemetry.costUsd,
    runtime: result.telemetry.runtime,
    model: result.telemetry.model,
    notes,
  });

  const escalate =
    (outcome === 'failure' || outcome === 'partial') &&
    (options.escalationOnFailure === true);

  return { runId, outcome, escalate };
}

/**
 * Consumes a ForgeBuildResult from Karvi and records it in Volva's telemetry.
 *
 * - Records build duration, cost, artifact count
 * - Tracks per-regime build statistics in forge_builds table
 * - Links back to decision session for audit trail
 */
export function consumeForgeResult(
  db: Database,
  result: ForgeBuildResult,
  regime: string,
): ConsumeForgeOutcome {
  const failedSteps = result.steps
    .filter((s) => s.status === 'failure')
    .map((s) => `${s.stepId}: ${s.type}`);

  const buildId = recordForgeBuild(db, {
    sessionId: result.sessionId,
    regime,
    status: result.status,
    durationMs: result.durationMs,
    artifactCount: result.artifacts.length,
    tokensUsed: result.telemetry.tokensUsed,
    costUsd: result.telemetry.costUsd,
    runtime: result.telemetry.runtime,
    model: result.telemetry.model,
    failedSteps: failedSteps.length > 0 ? failedSteps : undefined,
  });

  return { buildId, outcome: result.status };
}
