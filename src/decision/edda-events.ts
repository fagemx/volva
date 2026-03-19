import type { Database } from 'bun:sqlite';

// ─── Types ───

export interface EddaEvent {
  eventType: string;
  objectType: string;
  objectId: string;
  payload: Record<string, unknown>;
}

interface TelemetrySummary {
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
  runtime?: string;
  model?: string;
  stepsExecuted?: number;
}

// ─── Skill Events ───

export function buildSkillDispatchedEvent(
  skillId: string,
  dispatchId: string,
  context: { conversationId?: string; runtime?: string; estimatedDuration?: string },
): EddaEvent {
  return {
    eventType: 'skill_dispatched',
    objectType: 'dispatch',
    objectId: dispatchId,
    payload: {
      skillId,
      dispatchId,
      conversationId: context.conversationId,
      runtime: context.runtime,
      estimatedDuration: context.estimatedDuration,
    },
  };
}

export function buildSkillCompletedEvent(
  skillId: string,
  dispatchId: string,
  telemetry: TelemetrySummary,
  artifacts?: string[],
): EddaEvent {
  return {
    eventType: 'skill_completed',
    objectType: 'dispatch',
    objectId: dispatchId,
    payload: {
      skillId,
      dispatchId,
      ...telemetry,
      artifacts,
    },
  };
}

export function buildSkillFailedEvent(
  skillId: string,
  dispatchId: string,
  errorMessage: string,
  telemetry?: TelemetrySummary,
): EddaEvent {
  return {
    eventType: 'skill_failed',
    objectType: 'dispatch',
    objectId: dispatchId,
    payload: {
      skillId,
      dispatchId,
      error: errorMessage,
      ...telemetry,
    },
  };
}

// ─── Forge Events ───

export function buildForgeDispatchedEvent(
  buildId: string,
  regime: string,
  whatToBuildCount: number,
): EddaEvent {
  return {
    eventType: 'forge_dispatched',
    objectType: 'dispatch',
    objectId: buildId,
    payload: {
      buildId,
      regime,
      whatToBuildCount,
    },
  };
}

export function buildForgeCompletedEvent(
  buildId: string,
  regime: string,
  telemetry: TelemetrySummary,
  artifactCount?: number,
): EddaEvent {
  return {
    eventType: 'forge_completed',
    objectType: 'dispatch',
    objectId: buildId,
    payload: {
      buildId,
      regime,
      artifactCount,
      ...telemetry,
    },
  };
}

export function buildForgeFailedEvent(
  buildId: string,
  regime: string,
  errorMessage: string,
  stepsCompleted?: number,
): EddaEvent {
  return {
    eventType: 'forge_failed',
    objectType: 'dispatch',
    objectId: buildId,
    payload: {
      buildId,
      regime,
      error: errorMessage,
      stepsCompleted,
    },
  };
}

// ─── Approval Events ───

export function buildApprovalRequestedEvent(
  pendingId: string,
  skillName: string,
  executionMode: string,
  permissions: Record<string, unknown>,
): EddaEvent {
  return {
    eventType: 'approval_requested',
    objectType: 'approval',
    objectId: pendingId,
    payload: {
      pendingId,
      skillName,
      executionMode,
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
      pendingId,
      approvedBy,
    },
  };
}

export function buildApprovalDeniedEvent(
  pendingId: string,
): EddaEvent {
  return {
    eventType: 'approval_denied',
    objectType: 'approval',
    objectId: pendingId,
    payload: {
      pendingId,
    },
  };
}

export function buildApprovalExpiredEvent(
  pendingId: string,
): EddaEvent {
  return {
    eventType: 'approval_expired',
    objectType: 'approval',
    objectId: pendingId,
    payload: {
      pendingId,
    },
  };
}

// ─── Recording Helper ───

/**
 * Record an Edda event to the decision_events table.
 * Best-effort: logs errors but does not throw.
 */
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
    ).run(id, sessionId, event.eventType, event.objectType, event.objectId, JSON.stringify(event.payload));
  } catch (err) {
    console.error(`[edda-events] Failed to record ${event.eventType}:`, err);
  }
}
