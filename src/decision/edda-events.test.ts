import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import {
  buildSkillDispatchedEvent,
  buildSkillCompletedEvent,
  buildSkillFailedEvent,
  buildForgeDispatchedEvent,
  buildForgeCompletedEvent,
  buildForgeFailedEvent,
  buildApprovalRequestedEvent,
  buildApprovalGrantedEvent,
  buildApprovalDeniedEvent,
  buildApprovalExpiredEvent,
  recordEddaEvent,
} from './edda-events';

// ─── Event Builder Tests ───

describe('skill event builders', () => {
  it('buildSkillDispatchedEvent returns correct structure', () => {
    const event = buildSkillDispatchedEvent('skill-1', 'disp-1', {
      conversationId: 'conv-1',
      runtime: 'bun',
      estimatedDuration: '5 minutes',
    });

    expect(event.eventType).toBe('skill_dispatched');
    expect(event.objectType).toBe('dispatch');
    expect(event.objectId).toBe('disp-1');
    expect(event.payload.skillId).toBe('skill-1');
    expect(event.payload.dispatchId).toBe('disp-1');
    expect(event.payload.conversationId).toBe('conv-1');
  });

  it('buildSkillCompletedEvent includes telemetry', () => {
    const event = buildSkillCompletedEvent('skill-1', 'disp-1', {
      tokensUsed: 1000,
      costUsd: 0.05,
      durationMs: 3000,
      runtime: 'bun',
      model: 'claude-3',
      stepsExecuted: 3,
    }, ['artifact-1']);

    expect(event.eventType).toBe('skill_completed');
    expect(event.payload.tokensUsed).toBe(1000);
    expect(event.payload.costUsd).toBe(0.05);
    expect(event.payload.durationMs).toBe(3000);
    expect(event.payload.artifacts).toEqual(['artifact-1']);
  });

  it('buildSkillFailedEvent includes error info', () => {
    const event = buildSkillFailedEvent('skill-1', 'disp-1', 'Timeout exceeded', {
      durationMs: 60000,
    });

    expect(event.eventType).toBe('skill_failed');
    expect(event.payload.error).toBe('Timeout exceeded');
    expect(event.payload.durationMs).toBe(60000);
  });
});

describe('forge event builders', () => {
  it('buildForgeDispatchedEvent returns correct structure', () => {
    const event = buildForgeDispatchedEvent('build-1', 'economic', 3);

    expect(event.eventType).toBe('forge_dispatched');
    expect(event.objectType).toBe('dispatch');
    expect(event.objectId).toBe('build-1');
    expect(event.payload.regime).toBe('economic');
    expect(event.payload.whatToBuildCount).toBe(3);
  });

  it('buildForgeCompletedEvent includes telemetry', () => {
    const event = buildForgeCompletedEvent('build-1', 'governance', {
      costUsd: 0.10,
      tokensUsed: 2000,
    }, 5);

    expect(event.eventType).toBe('forge_completed');
    expect(event.payload.costUsd).toBe(0.10);
    expect(event.payload.artifactCount).toBe(5);
  });

  it('buildForgeFailedEvent includes error and steps', () => {
    const event = buildForgeFailedEvent('build-1', 'economic', 'Build failed', 2);

    expect(event.eventType).toBe('forge_failed');
    expect(event.payload.error).toBe('Build failed');
    expect(event.payload.stepsCompleted).toBe(2);
  });
});

describe('approval event builders', () => {
  it('buildApprovalRequestedEvent returns correct structure', () => {
    const event = buildApprovalRequestedEvent('pend-1', 'deploy-skill', 'active', {
      filesystem: { read: true, write: true },
    });

    expect(event.eventType).toBe('approval_requested');
    expect(event.objectType).toBe('approval');
    expect(event.objectId).toBe('pend-1');
    expect(event.payload.skillName).toBe('deploy-skill');
    expect(event.payload.executionMode).toBe('active');
  });

  it('buildApprovalGrantedEvent includes approvedBy', () => {
    const event = buildApprovalGrantedEvent('pend-1', 'admin');

    expect(event.eventType).toBe('approval_granted');
    expect(event.payload.approvedBy).toBe('admin');
  });

  it('buildApprovalDeniedEvent returns correct structure', () => {
    const event = buildApprovalDeniedEvent('pend-1');

    expect(event.eventType).toBe('approval_denied');
    expect(event.objectId).toBe('pend-1');
  });

  it('buildApprovalExpiredEvent returns correct structure', () => {
    const event = buildApprovalExpiredEvent('pend-1');

    expect(event.eventType).toBe('approval_expired');
    expect(event.objectId).toBe('pend-1');
  });
});

// ─── Recording Tests ───

describe('recordEddaEvent', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    // Create a session for FK constraint
    db.prepare(
      `INSERT INTO decision_sessions (id, stage, status) VALUES (?, 'routing', 'active')`,
    ).run('test-session');
  });

  it('inserts event into decision_events table', () => {
    const event = buildSkillDispatchedEvent('skill-1', 'disp-1', { conversationId: 'conv-1' });

    recordEddaEvent(db, 'test-session', event);

    const rows = db.prepare(
      'SELECT * FROM decision_events WHERE session_id = ?',
    ).all('test-session') as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('skill_dispatched');
    expect(rows[0].object_type).toBe('dispatch');
    expect(rows[0].object_id).toBe('disp-1');

    const payload = JSON.parse(rows[0].payload_json as string) as Record<string, unknown>;
    expect(payload.skillId).toBe('skill-1');
    expect(payload.conversationId).toBe('conv-1');
  });

  it('records all new event types without constraint violation', () => {
    const eventTypes = [
      buildSkillDispatchedEvent('s1', 'd1', {}),
      buildSkillCompletedEvent('s1', 'd1', {}),
      buildSkillFailedEvent('s1', 'd1', 'err'),
      buildForgeDispatchedEvent('b1', 'economic', 1),
      buildForgeCompletedEvent('b1', 'economic', {}),
      buildForgeFailedEvent('b1', 'economic', 'err'),
      buildApprovalRequestedEvent('p1', 'skill', 'active', {}),
      buildApprovalGrantedEvent('p1', 'admin'),
      buildApprovalDeniedEvent('p1'),
      buildApprovalExpiredEvent('p1'),
    ];

    for (const event of eventTypes) {
      recordEddaEvent(db, 'test-session', event);
    }

    const rows = db.prepare(
      'SELECT * FROM decision_events WHERE session_id = ?',
    ).all('test-session') as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(10);
  });

  it('does not throw on DB error (graceful degradation)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use invalid session_id to trigger FK constraint violation
    const event = buildSkillDispatchedEvent('s1', 'd1', {});
    recordEddaEvent(db, 'nonexistent-session', event);

    // Should not throw — just logs
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[edda-events]'),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  it('includes telemetry in completed event payload', () => {
    const event = buildSkillCompletedEvent('skill-1', 'disp-1', {
      tokensUsed: 500,
      costUsd: 0.02,
      durationMs: 1500,
      runtime: 'bun',
      model: 'claude-3',
      stepsExecuted: 2,
    });

    recordEddaEvent(db, 'test-session', event);

    const rows = db.prepare(
      "SELECT * FROM decision_events WHERE event_type = 'skill_completed'",
    ).all() as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload_json as string) as Record<string, unknown>;
    expect(payload.tokensUsed).toBe(500);
    expect(payload.costUsd).toBe(0.02);
    expect(payload.durationMs).toBe(1500);
  });
});
