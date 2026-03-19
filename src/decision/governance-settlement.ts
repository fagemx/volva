import type { Database } from 'bun:sqlite';
import type { ForgeBuildResult, ForgeBuildRequest } from '../karvi-client/schemas';
import type { WorldCard } from '../schemas/card';
import type { Regime } from '../schemas/decision';
import type { ThyraClient } from '../thyra-client/client';
import type { DecisionSessionManager } from './session-manager';
import { buildVillagePack } from '../settlement/village-pack-builder';

// ─── Types ───

export type GovernanceSettlementInput = {
  sessionId: string;
  buildResult: ForgeBuildResult;
  buildRequest: ForgeBuildRequest;
  worldCard: WorldCard;
};

export type GovernanceSettlementResult =
  | { ok: true; villageId: string; constitutionId: string; chiefId: string | null }
  | { ok: false; error: string; phase: 'verification' | 'build_record' | 'settlement' };

export type HandoffVerification = {
  satisfied: boolean;
  missing: string[];
  verified: string[];
};

export type GovernanceSettlementDeps = {
  db: Database;
  thyra: ThyraClient;
  sessionManager: DecisionSessionManager;
};

// ─── Handoff Verification ───

export function verifyThyraHandoffRequirements(
  thyraHandoffRequirements: string[],
  artifacts: ForgeBuildResult['artifacts'],
): HandoffVerification {
  // Build has artifacts → requirements are considered verified
  // In v0, forge is a pass-through, so we check artifact presence as success indicator
  if (artifacts.length === 0) {
    return {
      satisfied: false,
      missing: thyraHandoffRequirements,
      verified: [],
    };
  }

  // All requirements verified when build produced artifacts
  return {
    satisfied: true,
    missing: [],
    verified: thyraHandoffRequirements,
  };
}

// ─── Forge Build Recorder ───

export function recordForgeBuild(
  db: Database,
  sessionId: string,
  buildResult: ForgeBuildResult,
  regime: Regime,
): string {
  const id = `fb_${crypto.randomUUID()}`;
  db.run(
    `INSERT INTO forge_builds (id, session_id, regime, status, duration_ms, artifact_count, tokens_used, cost_usd, runtime, model, failed_steps_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sessionId,
      regime,
      buildResult.status,
      buildResult.durationMs,
      buildResult.artifacts.length,
      buildResult.telemetry.tokensUsed,
      buildResult.telemetry.costUsd,
      buildResult.telemetry.runtime,
      buildResult.telemetry.model,
      JSON.stringify(
        buildResult.steps
          .filter((s) => s.status === 'failure')
          .map((s) => ({ stepId: s.stepId, type: s.type })),
      ),
    ],
  );
  return id;
}

// ─── Settlement Orchestrator ───

export async function settleGovernanceBuild(
  input: GovernanceSettlementInput,
  deps: GovernanceSettlementDeps,
): Promise<GovernanceSettlementResult> {
  const { sessionId, buildResult, buildRequest, worldCard } = input;

  // 1. Verify build status
  if (buildResult.status !== 'success') {
    return {
      ok: false,
      error: `Forge build did not succeed: status=${buildResult.status}`,
      phase: 'verification',
    };
  }

  // 2. Extract thyraHandoffRequirements from governance context
  if (buildRequest.regimeContext.kind !== 'governance') {
    return {
      ok: false,
      error: `Expected governance regimeContext, got: ${buildRequest.regimeContext.kind}`,
      phase: 'verification',
    };
  }
  const { thyraHandoffRequirements } = buildRequest.regimeContext;

  // 3. Verify handoff requirements
  const verification = verifyThyraHandoffRequirements(
    thyraHandoffRequirements,
    buildResult.artifacts,
  );
  if (!verification.satisfied) {
    return {
      ok: false,
      error: `Thyra handoff requirements not satisfied. Missing: ${verification.missing.join(', ')}`,
      phase: 'verification',
    };
  }

  // 4. Record forge build
  const buildId = recordForgeBuild(deps.db, sessionId, buildResult, 'governance');

  // 5. Record settlement_initiated event
  deps.sessionManager.addEvent(sessionId, {
    eventType: 'settlement_initiated',
    objectType: 'settlement',
    objectId: buildId,
    payload: {
      regime: 'governance',
      artifactCount: buildResult.artifacts.length,
      thyraHandoffRequirements,
      verification,
    },
  });

  // 6. Build village pack from worldCard
  const villagePack = buildVillagePack(worldCard);

  // 7. Send to Thyra (graceful degradation)
  try {
    const thyraResult = await deps.thyra.applyVillagePack(villagePack);

    // 8. Record settlement_completed event
    deps.sessionManager.addEvent(sessionId, {
      eventType: 'settlement_completed',
      objectType: 'settlement',
      objectId: buildId,
      payload: {
        villageId: thyraResult.village_id,
        constitutionId: thyraResult.constitution_id,
        chiefId: thyraResult.chief_id,
        skillCount: thyraResult.skills.length,
        applied: thyraResult.applied,
      },
    });

    return {
      ok: true,
      villageId: thyraResult.village_id,
      constitutionId: thyraResult.constitution_id,
      chiefId: thyraResult.chief_id,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Thyra settlement failed',
      phase: 'settlement',
    };
  }
}
