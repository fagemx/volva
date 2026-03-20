import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from '../db';
import type { Database } from 'bun:sqlite';
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
  recordEddaEventWithConversation,
} from './edda-events';

describe('edda-events', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  describe('buildSkillDispatchedEvent', () => {
    it('builds event with skillId and dispatchId', () => {
      const event = buildSkillDispatchedEvent('skill-123', 'dispatch-456', {
        skillId: 'skill-123',
        userMessage: 'test',
        inputs: {},
      });

      expect(event.eventType).toBe('skill_dispatched');
      expect(event.objectType).toBe('dispatch');
      expect(event.objectId).toBe('dispatch-456');
      expect(event.payload.skillId).toBe('skill-123');
    });

    it('includes conversationId when provided', () => {
      const event = buildSkillDispatchedEvent('skill-123', 'dispatch-456', {
        skillId: 'skill-123',
        conversationId: 'conv-789',
        userMessage: 'test',
        inputs: {},
      });

      expect(event.payload.conversationId).toBe('conv-789');
    });
  });

  describe('buildSkillCompletedEvent', () => {
    it('builds event with telemetry data', () => {
      const result = {
        skillId: 'skill-123',
        status: 'success' as const,
        durationMs: 5000,
        steps: [],
        outputs: {},
        verification: { smokeChecksPassed: true, failedChecks: [] },
        telemetry: { tokensUsed: 1000, costUsd: 0.05, runtime: 'bun', model: 'gpt-4', stepsExecuted: 5 },
      };

      const event = buildSkillCompletedEvent('skill-123', 'dispatch-456', result);

      expect(event.eventType).toBe('skill_completed');
      expect(event.payload.durationMs).toBe(5000);
      expect(event.payload.costUsd).toBe(0.05);
      expect(event.payload.tokensUsed).toBe(1000);
      expect(event.payload.stepsExecuted).toBe(5);
      expect(event.payload.smokeChecksPassed).toBe(true);
    });
  });

  describe('buildSkillFailedEvent', () => {
    it('builds event with error info', () => {
      const error = new Error('Connection timeout');
      const event = buildSkillFailedEvent('skill-123', 'dispatch-456', error);

      expect(event.eventType).toBe('skill_failed');
      expect(event.payload.errorMessage).toBe('Connection timeout');
      expect(event.payload.errorName).toBe('Error');
    });

    it('includes partial result when available', () => {
      const error = new Error('Failed mid-execution');
      const partialResult = {
        skillId: 'skill-123',
        status: 'failure' as const,
        durationMs: 3000,
        steps: [{ stepId: 's1', type: 'step', status: 'success' as const, artifacts: [] }],
        outputs: {},
        verification: { smokeChecksPassed: false, failedChecks: ['check1'] },
        telemetry: { tokensUsed: 500, costUsd: 0.02, runtime: 'bun', model: 'gpt-4', stepsExecuted: 2 },
      };

      const event = buildSkillFailedEvent('skill-123', 'dispatch-456', error, partialResult);

      expect(event.payload.partialSteps).toBe(1);
      expect(event.payload.partialCostUsd).toBe(0.02);
    });
  });

  describe('buildForgeDispatchedEvent', () => {
    it('builds event with regime and buildId', () => {
      const event = buildForgeDispatchedEvent('session-123', 'economic', 'build-456');

      expect(event.eventType).toBe('forge_dispatched');
      expect(event.objectType).toBe('forge_build');
      expect(event.objectId).toBe('build-456');
      expect(event.payload.sessionId).toBe('session-123');
      expect(event.payload.regime).toBe('economic');
    });
  });

  describe('buildForgeCompletedEvent', () => {
    it('builds event with artifact count and telemetry', () => {
      const event = buildForgeCompletedEvent('session-123', 'build-456', {
        status: 'success',
        artifactCount: 5,
        durationMs: 10000,
        costUsd: 0.15,
        tokensUsed: 3000,
      });

      expect(event.eventType).toBe('forge_completed');
      expect(event.payload.status).toBe('success');
      expect(event.payload.artifactCount).toBe(5);
      expect(event.payload.durationMs).toBe(10000);
      expect(event.payload.costUsd).toBe(0.15);
      expect(event.payload.tokensUsed).toBe(3000);
    });
  });

  describe('buildForgeFailedEvent', () => {
    it('builds event with error info', () => {
      const error = new Error('Build failed');
      const event = buildForgeFailedEvent('session-123', 'build-456', error, 3);

      expect(event.eventType).toBe('forge_failed');
      expect(event.payload.errorMessage).toBe('Build failed');
      expect(event.payload.stepsCompleted).toBe(3);
    });
  });

  describe('buildApprovalRequestedEvent', () => {
    it('builds event with permissions', () => {
      const permissions = {
        filesystem: { read: true, write: false },
        network: { read: true, write: true },
        process: { spawn: false },
        secrets: { read: ['API_KEY'] },
      };

      const event = buildApprovalRequestedEvent('pending-123', 'deploy-skill', permissions);

      expect(event.eventType).toBe('approval_requested');
      expect(event.objectType).toBe('approval');
      expect(event.objectId).toBe('pending-123');
      expect(event.payload.skillName).toBe('deploy-skill');
      expect(event.payload.permissions).toEqual(permissions);
    });
  });

  describe('buildApprovalGrantedEvent', () => {
    it('builds event with approvedBy', () => {
      const event = buildApprovalGrantedEvent('pending-123', 'user-456');

      expect(event.eventType).toBe('approval_granted');
      expect(event.objectId).toBe('pending-123');
      expect(event.payload.approvedBy).toBe('user-456');
    });
  });

  describe('buildApprovalDeniedEvent', () => {
    it('builds event with pendingId', () => {
      const event = buildApprovalDeniedEvent('pending-123');

      expect(event.eventType).toBe('approval_denied');
      expect(event.objectId).toBe('pending-123');
    });
  });

  describe('buildApprovalExpiredEvent', () => {
    it('builds event with pendingId', () => {
      const event = buildApprovalExpiredEvent('pending-123');

      expect(event.eventType).toBe('approval_expired');
      expect(event.objectId).toBe('pending-123');
    });
  });

  describe('recordEddaEvent', () => {
    it('inserts event into decision_events table', () => {
      db.run("INSERT INTO decision_sessions (id) VALUES ('session-123')");

      recordEddaEvent(db, 'session-123', buildApprovalDeniedEvent('pending-456'));

      const events = db
        .query("SELECT * FROM decision_events WHERE session_id = ?")
        .all('session-123') as Array<Record<string, unknown>>;

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('approval_denied');
      expect(events[0].object_id).toBe('pending-456');
    });

    it('gracefully handles DB errors without throwing', () => {
      expect(() => {
        recordEddaEvent(db, 'non-existent-session', buildApprovalDeniedEvent('pending-456'));
      }).not.toThrow();
    });
  });

  describe('recordEddaEventWithConversation', () => {
    it('records event when sessionId is provided', () => {
      db.run("INSERT INTO decision_sessions (id) VALUES ('session-123')");

      recordEddaEventWithConversation(
        db,
        'session-123',
        undefined,
        buildApprovalDeniedEvent('pending-456'),
      );

      const events = db
        .query("SELECT * FROM decision_events WHERE session_id = ?")
        .all('session-123') as Array<Record<string, unknown>>;

      expect(events.length).toBe(1);
    });

    it('looks up session by conversationId when sessionId not provided', () => {
      db.run("INSERT INTO decision_sessions (id, conversation_id) VALUES ('session-123', 'conv-456')");

      recordEddaEventWithConversation(
        db,
        undefined,
        'conv-456',
        buildApprovalDeniedEvent('pending-789'),
      );

      const events = db
        .query("SELECT * FROM decision_events WHERE session_id = ?")
        .all('session-123') as Array<Record<string, unknown>>;

      expect(events.length).toBe(1);
    });

    it('does nothing when neither sessionId nor conversationId provided', () => {
      db.run("INSERT INTO decision_sessions (id) VALUES ('session-123')");

      recordEddaEventWithConversation(db, undefined, undefined, buildApprovalDeniedEvent('pending-456'));

      const events = db.query("SELECT * FROM decision_events").all() as Array<Record<string, unknown>>;
      expect(events.length).toBe(0);
    });

    it('does nothing when no session found for conversationId', () => {
      recordEddaEventWithConversation(
        db,
        undefined,
        'non-existent-conv',
        buildApprovalDeniedEvent('pending-456'),
      );

      const events = db.query("SELECT * FROM decision_events").all() as Array<Record<string, unknown>>;
      expect(events.length).toBe(0);
    });
  });
});
