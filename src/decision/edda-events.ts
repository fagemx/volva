import type { Database } from 'bun:sqlite';

// ─── Event Builder Types ───

export interface EddaEvent {
  sessionId: string;
  eventType: string;
  objectType: string;
  objectId: string;
  payload: Record<string, unknown>;
}

// ─── Event Builders ───

export function buildSkillDispatchedEvent(sessionId: string, dispatchId: string, skillId: string, runtime: string): EddaEvent {
  return { sessionId, eventType: 'skill_dispatched', objectType: 'dispatch', objectId: dispatchId, payload: { skillId, runtime } };
}

export function buildSkillCompletedEvent(sessionId: string, dispatchId: string, skillId: string, durationMs: number, tokensUsed: number): EddaEvent {
  return { sessionId, eventType: 'skill_completed', objectType: 'dispatch', objectId: dispatchId, payload: { skillId, durationMs, tokensUsed } };
}

export function buildSkillFailedEvent(sessionId: string, dispatchId: string, skillId: string, error: string): EddaEvent {
  return { sessionId, eventType: 'skill_failed', objectType: 'dispatch', objectId: dispatchId, payload: { skillId, error } };
}

export function buildForgeDispatchedEvent(sessionId: string, buildId: string, regime: string): EddaEvent {
  return { sessionId, eventType: 'forge_dispatched', objectType: 'forge_build', objectId: buildId, payload: { regime } };
}

export function buildForgeCompletedEvent(sessionId: string, buildId: string, regime: string, artifactCount: number): EddaEvent {
  return { sessionId, eventType: 'forge_completed', objectType: 'forge_build', objectId: buildId, payload: { regime, artifactCount } };
}

export function buildForgeFailedEvent(sessionId: string, buildId: string, regime: string, error: string): EddaEvent {
  return { sessionId, eventType: 'forge_failed', objectType: 'forge_build', objectId: buildId, payload: { regime, error } };
}

export function buildApprovalRequestedEvent(sessionId: string, pendingId: string, skillId: string): EddaEvent {
  return { sessionId, eventType: 'approval_requested', objectType: 'approval', objectId: pendingId, payload: { skillId } };
}

export function buildApprovalGrantedEvent(sessionId: string, pendingId: string, approvedBy: string): EddaEvent {
  return { sessionId, eventType: 'approval_granted', objectType: 'approval', objectId: pendingId, payload: { approvedBy } };
}

export function buildApprovalDeniedEvent(sessionId: string, pendingId: string, deniedBy: string): EddaEvent {
  return { sessionId, eventType: 'approval_denied', objectType: 'approval', objectId: pendingId, payload: { deniedBy } };
}

export function buildApprovalExpiredEvent(sessionId: string, pendingId: string): EddaEvent {
  return { sessionId, eventType: 'approval_expired', objectType: 'approval', objectId: pendingId, payload: {} };
}

// ─── Recording ───

export function recordEddaEvent(db: Database, event: EddaEvent): string {
  const id = `evt_${crypto.randomUUID()}`;
  try {
    db.run(
      `INSERT INTO decision_events (id, session_id, event_type, object_type, object_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, event.sessionId, event.eventType, event.objectType, event.objectId, JSON.stringify(event.payload)],
    );
  } catch (err) {
    // Best-effort recording — failure to record does not break dispatch flow
    console.error('[edda-events] Failed to record event:', err);
  }
  return id;
}
