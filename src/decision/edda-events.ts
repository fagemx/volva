import type { Database } from 'bun:sqlite';
import type { SkillDispatchResult } from '../karvi-client/schemas';

export interface EddaEvent {
  eventType: string;
  objectType: string;
  objectId: string;
  payload: Record<string, unknown>;
}

export interface SkillDispatchContext {
  skillId: string;
  conversationId?: string;
  userMessage: string;
  workingDir?: string;
  inputs: Record<string, string>;
}

export function buildSkillDispatchedEvent(
  skillId: string,
  dispatchId: string,
  context: SkillDispatchContext,
): EddaEvent {
  return {
    eventType: 'skill_dispatched',
    objectType: 'dispatch',
    objectId: dispatchId,
    payload: {
      skillId,
      conversationId: context.conversationId,
      runtime: 'karvi',
    },
  };
}

export function buildSkillCompletedEvent(
  skillId: string,
  dispatchId: string,
  result: SkillDispatchResult,
): EddaEvent {
  return {
    eventType: 'skill_completed',
    objectType: 'dispatch',
    objectId: dispatchId,
    payload: {
      skillId,
      durationMs: result.durationMs,
      costUsd: result.telemetry.costUsd,
      tokensUsed: result.telemetry.tokensUsed,
      stepsExecuted: result.telemetry.stepsExecuted,
      smokeChecksPassed: result.verification.smokeChecksPassed,
    },
  };
}

export function buildSkillFailedEvent(
  skillId: string,
  dispatchId: string,
  error: Error,
  partialResult?: SkillDispatchResult,
): EddaEvent {
  return {
    eventType: 'skill_failed',
    objectType: 'dispatch',
    objectId: dispatchId,
    payload: {
      skillId,
      errorMessage: error.message,
      errorName: error.name,
      partialSteps: partialResult?.steps.length ?? 0,
      partialCostUsd: partialResult?.telemetry.costUsd,
    },
  };
}

export function buildForgeDispatchedEvent(
  sessionId: string,
  regime: string,
  buildId: string,
): EddaEvent {
  return {
    eventType: 'forge_dispatched',
    objectType: 'forge_build',
    objectId: buildId,
    payload: {
      sessionId,
      regime,
    },
  };
}

export function buildForgeCompletedEvent(
  sessionId: string,
  buildId: string,
  result: {
    status: string;
    artifactCount: number;
    durationMs?: number;
    costUsd?: number;
    tokensUsed?: number;
  },
): EddaEvent {
  return {
    eventType: 'forge_completed',
    objectType: 'forge_build',
    objectId: buildId,
    payload: {
      sessionId,
      status: result.status,
      artifactCount: result.artifactCount,
      durationMs: result.durationMs,
      costUsd: result.costUsd,
      tokensUsed: result.tokensUsed,
    },
  };
}

export function buildForgeFailedEvent(
  sessionId: string,
  buildId: string,
  error: Error,
  stepsCompleted?: number,
): EddaEvent {
  return {
    eventType: 'forge_failed',
    objectType: 'forge_build',
    objectId: buildId,
    payload: {
      sessionId,
      errorMessage: error.message,
      errorName: error.name,
      stepsCompleted: stepsCompleted ?? 0,
    },
  };
}

export function buildApprovalRequestedEvent(
  pendingId: string,
  skillName: string,
  permissions: Record<string, unknown>,
): EddaEvent {
  return {
    eventType: 'approval_requested',
    objectType: 'approval',
    objectId: pendingId,
    payload: {
      skillName,
      permissions,
    },
  };
}

export function buildApprovalGrantedEvent(
  pendingId: string,
  approvedBy: string,
): EddaEvent {
  return {
    eventType: 'approval_granted',
    objectType: 'approval',
    objectId: pendingId,
    payload: {
      approvedBy,
    },
  };
}

export function buildApprovalDeniedEvent(pendingId: string): EddaEvent {
  return {
    eventType: 'approval_denied',
    objectType: 'approval',
    objectId: pendingId,
    payload: {},
  };
}

export function buildApprovalExpiredEvent(pendingId: string): EddaEvent {
  return {
    eventType: 'approval_expired',
    objectType: 'approval',
    objectId: pendingId,
    payload: {},
  };
}

export function recordEddaEvent(
  db: Database,
  sessionId: string,
  event: EddaEvent,
): void {
  try {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO decision_events (id, session_id, event_type, object_type, object_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      sessionId,
      event.eventType,
      event.objectType,
      event.objectId,
      JSON.stringify(event.payload),
    );
  } catch (err) {
    console.error(`[edda-events] Failed to record ${event.eventType}:`, err);
  }
}

export function recordEddaEventWithConversation(
  db: Database,
  sessionId: string | undefined,
  conversationId: string | undefined,
  event: EddaEvent,
): void {
  if (sessionId) {
    recordEddaEvent(db, sessionId, event);
    return;
  }

  if (!conversationId) {
    console.warn(`[edda-events] Cannot record ${event.eventType}: no sessionId or conversationId`);
    return;
  }

  try {
    const row = db
      .query('SELECT id FROM decision_sessions WHERE conversation_id = ? LIMIT 1')
      .get(conversationId) as Record<string, unknown> | null;

    if (row) {
      recordEddaEvent(db, row.id as string, event);
    } else {
      console.warn(`[edda-events] No session found for conversationId=${conversationId}`);
    }
  } catch (err) {
    console.error(`[edda-events] Failed to lookup session for ${event.eventType}:`, err);
  }
}
