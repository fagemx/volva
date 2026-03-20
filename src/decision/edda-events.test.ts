import { describe, it, expect, beforeEach } from 'vitest';
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

describe('Edda Event Builders', () => {
  it('buildSkillDispatchedEvent', () => {
    const e = buildSkillDispatchedEvent('ds_1', 'disp_1', 'skill.deploy', 'claude');
    expect(e.eventType).toBe('skill_dispatched');
    expect(e.objectType).toBe('dispatch');
    expect(e.objectId).toBe('disp_1');
    expect(e.payload).toEqual({ skillId: 'skill.deploy', runtime: 'claude' });
  });

  it('buildSkillCompletedEvent', () => {
    const e = buildSkillCompletedEvent('ds_1', 'disp_1', 'skill.deploy', 5000, 1200);
    expect(e.eventType).toBe('skill_completed');
    expect(e.payload).toEqual({ skillId: 'skill.deploy', durationMs: 5000, tokensUsed: 1200 });
  });

  it('buildSkillFailedEvent', () => {
    const e = buildSkillFailedEvent('ds_1', 'disp_1', 'skill.deploy', 'timeout');
    expect(e.eventType).toBe('skill_failed');
    expect(e.payload.error).toBe('timeout');
  });

  it('buildForgeDispatchedEvent', () => {
    const e = buildForgeDispatchedEvent('ds_1', 'build_1', 'economic');
    expect(e.eventType).toBe('forge_dispatched');
    expect(e.objectType).toBe('forge_build');
  });

  it('buildForgeCompletedEvent', () => {
    const e = buildForgeCompletedEvent('ds_1', 'build_1', 'governance', 3);
    expect(e.eventType).toBe('forge_completed');
    expect(e.payload).toEqual({ regime: 'governance', artifactCount: 3 });
  });

  it('buildForgeFailedEvent', () => {
    const e = buildForgeFailedEvent('ds_1', 'build_1', 'economic', 'build error');
    expect(e.eventType).toBe('forge_failed');
  });

  it('buildApprovalRequestedEvent', () => {
    const e = buildApprovalRequestedEvent('ds_1', 'appr_1', 'skill.deploy');
    expect(e.eventType).toBe('approval_requested');
    expect(e.objectType).toBe('approval');
  });

  it('buildApprovalGrantedEvent', () => {
    const e = buildApprovalGrantedEvent('ds_1', 'appr_1', 'human');
    expect(e.eventType).toBe('approval_granted');
    expect(e.payload.approvedBy).toBe('human');
  });

  it('buildApprovalDeniedEvent', () => {
    const e = buildApprovalDeniedEvent('ds_1', 'appr_1', 'admin');
    expect(e.eventType).toBe('approval_denied');
  });

  it('buildApprovalExpiredEvent', () => {
    const e = buildApprovalExpiredEvent('ds_1', 'appr_1');
    expect(e.eventType).toBe('approval_expired');
  });
});

describe('recordEddaEvent', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    db.run("INSERT INTO decision_sessions (id, stage, status) VALUES ('ds_1', 'routing', 'active')");
  });

  it('inserts event into decision_events table', () => {
    const event = buildSkillDispatchedEvent('ds_1', 'disp_1', 'skill.test', 'opencode');
    const id = recordEddaEvent(db, event);
    expect(id).toMatch(/^evt_/);

    const row = db.prepare('SELECT * FROM decision_events WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.event_type).toBe('skill_dispatched');
    expect(row.object_type).toBe('dispatch');
    expect(row.object_id).toBe('disp_1');
    expect(JSON.parse(row.payload_json as string)).toEqual({ skillId: 'skill.test', runtime: 'opencode' });
  });

  it('does not throw on DB error (best-effort)', () => {
    const event = buildSkillDispatchedEvent('nonexistent_session', 'disp_1', 'skill.test', 'claude');
    // FK constraint violation — should not throw
    expect(() => recordEddaEvent(db, event)).not.toThrow();
  });

  it('records all 10 event types successfully', () => {
    const events = [
      buildSkillDispatchedEvent('ds_1', 'd1', 'skill.x', 'claude'),
      buildSkillCompletedEvent('ds_1', 'd1', 'skill.x', 1000, 500),
      buildSkillFailedEvent('ds_1', 'd1', 'skill.x', 'err'),
      buildForgeDispatchedEvent('ds_1', 'b1', 'economic'),
      buildForgeCompletedEvent('ds_1', 'b1', 'economic', 2),
      buildForgeFailedEvent('ds_1', 'b1', 'economic', 'err'),
      buildApprovalRequestedEvent('ds_1', 'a1', 'skill.x'),
      buildApprovalGrantedEvent('ds_1', 'a1', 'human'),
      buildApprovalDeniedEvent('ds_1', 'a1', 'admin'),
      buildApprovalExpiredEvent('ds_1', 'a1'),
    ];

    for (const e of events) {
      const id = recordEddaEvent(db, e);
      expect(id).toMatch(/^evt_/);
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM decision_events WHERE session_id = ?').get('ds_1') as Record<string, unknown>;
    expect(count.c).toBe(10);
  });
});
