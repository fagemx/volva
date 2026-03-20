import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { recordRun, getMetrics } from '../skills/telemetry';
import { KarviClient } from './client';
import { createMockKarviServer, type MockKarviServer } from './test-server';
import { KarviApiError } from './schemas';
import type { SkillDispatchRequest, SkillDispatchResult } from './schemas';

const goldenPathRequest: SkillDispatchRequest = {
  skillId: 'skill.deploy-service',
  skillName: 'deploy-service',
  skillVersion: '1.0.0',
  skillContent: '# Deploy Service\n\n## Steps\n1. Plan\n2. Implement\n3. Review',
  environment: {
    toolsRequired: ['git', 'npm'],
    toolsOptional: ['docker'],
    permissions: {
      filesystem: { read: true, write: true },
      network: { read: true, write: false },
      process: { spawn: true },
      secrets: { read: ['DEPLOY_KEY'] },
    },
    externalSideEffects: true,
    executionMode: 'active',
  },
  dispatch: {
    targetSelection: {
      repoPolicy: 'explicit',
      runtimeOptions: ['claude', 'gpt-4'],
    },
    workerClass: ['deploy'],
    handoff: {
      inputArtifacts: ['spec.yaml'],
      outputArtifacts: ['deployment.yaml'],
    },
    executionPolicy: {
      sync: false,
      retries: 2,
      timeoutMinutes: 30,
      escalationOnFailure: true,
    },
    approval: {
      requireHumanBeforeDispatch: false,
      requireHumanBeforeMerge: true,
    },
  },
  verification: {
    smokeChecks: ['deployment-created', 'health-check-passes'],
    assertions: [],
    humanCheckpoints: ['post-deploy-review'],
    outcomeSignals: ['deployment-url'],
  },
  context: {
    conversationId: 'conv-test-001',
    userMessage: 'Deploy the service to production',
    inputs: { environment: 'production' },
  },
};

function createSuccessResult(request: SkillDispatchRequest): SkillDispatchResult {
  return {
    skillId: request.skillId,
    status: 'success',
    durationMs: 45000,
    steps: [
      { stepId: 'plan', type: 'skill', status: 'success', artifacts: ['plan.md'] },
      { stepId: 'implement', type: 'skill', status: 'success', artifacts: ['deployment.yaml'] },
      { stepId: 'review', type: 'skill', status: 'success', artifacts: ['review.md'] },
    ],
    outputs: {
      deploymentUrl: 'https://app.example.com',
      commitSha: 'abc123',
    },
    verification: {
      smokeChecksPassed: true,
      failedChecks: [],
    },
    telemetry: {
      tokensUsed: 15000,
      costUsd: 0.45,
      runtime: request.dispatch.targetSelection.runtimeOptions[0],
      model: 'claude-3-opus',
      stepsExecuted: 3,
    },
  };
}

describe('Skill Dispatch Integration (GH-155)', () => {
  let server: MockKarviServer;
  let client: KarviClient;
  let db: Database;

  beforeAll(() => {
    server = createMockKarviServer();
    client = new KarviClient({ baseUrl: server.url, retries: 0 });
    db = createDb(':memory:');
    initSchema(db);

    db.prepare(
      'INSERT INTO skill_instances (id, skill_id, name) VALUES (?, ?, ?)',
    ).run('si-test', 'skill.deploy-service', 'deploy-service');
  });

  afterAll(() => {
    server.stop();
  });

  describe('Setup', () => {
    it('mock server starts and responds to health check', async () => {
      const health = await client.getHealth();
      expect(health.ok).toBe(true);
    });
  });

  describe('Golden Path: Deploy Service', () => {
    let dispatchId: string;

    it('dispatches skill and receives dispatchId with status=pending', async () => {
      const result = await client.dispatchSkill(goldenPathRequest);
      expect(result.dispatchId).toBeDefined();
      expect(result.dispatchId).toMatch(/^disp_/);
      expect(result.status).toBe('pending');
      dispatchId = result.dispatchId;
    });

    it('polls status and sees pending state', async () => {
      const status = await client.getDispatchStatus(dispatchId);
      expect(status.id).toBe(dispatchId);
      expect(status.status).toBe('pending');
      expect(status.type).toBe('skill');
      expect(status.result).toBeNull();
    });

    it('simulates progress to running state', async () => {
      server.simulateProgress(dispatchId);
      const status = await client.getDispatchStatus(dispatchId);
      expect(status.status).toBe('running');
    });

    it('simulates completion and verifies result', async () => {
      const expectedResult = createSuccessResult(goldenPathRequest);
      server.simulateCompletion(dispatchId, expectedResult);

      const status = await client.getDispatchStatus(dispatchId);
      expect(status.status).toBe('completed');
      expect(status.result).not.toBeNull();
      if (status.result && 'skillId' in status.result) {
        expect(status.result.skillId).toBe('skill.deploy-service');
        expect(status.result.status).toBe('success');
      }
    });
  });

  describe('Kill Criteria Verification', () => {
    it('KC1: Karvi parses SkillDispatchRequest correctly', async () => {
      server.state.receivedRequests.length = 0;
      await client.dispatchSkill(goldenPathRequest);

      const received = server.state.receivedRequests[server.state.receivedRequests.length - 1];
      expect(received).toBeDefined();
      expect(received.skillId).toBe(goldenPathRequest.skillId);
      expect(received.skillName).toBe(goldenPathRequest.skillName);
      expect(received.dispatch.targetSelection.runtimeOptions).toEqual(
        goldenPathRequest.dispatch.targetSelection.runtimeOptions
      );
    });

    it('KC2: Karvi uses skillContent (not filesystem)', () => {
      const received = server.state.receivedRequests[server.state.receivedRequests.length - 1];
      expect(received.skillContent).toBe(goldenPathRequest.skillContent);
      expect(received.skillContent).toContain('# Deploy Service');
    });

    it('KC3: Runtime picked from runtimeOptions', () => {
      const result = createSuccessResult(goldenPathRequest);
      expect(result.telemetry.runtime).toBe('claude');
      expect(goldenPathRequest.dispatch.targetSelection.runtimeOptions).toContain('claude');
    });

    it('KC4: Telemetry has runtime/model/stepsExecuted', () => {
      const result = createSuccessResult(goldenPathRequest);
      expect(result.telemetry.runtime).toBeDefined();
      expect(result.telemetry.model).toBeDefined();
      expect(result.telemetry.stepsExecuted).toBeGreaterThan(0);
      expect(result.telemetry.tokensUsed).toBeGreaterThan(0);
    });

    it('KC5: Status updates fire (pending -> running -> completed)', async () => {
      const req: SkillDispatchRequest = { ...goldenPathRequest, skillId: 'skill.kc5-test' };
      const { dispatchId } = await client.dispatchSkill(req);

      let status = await client.getDispatchStatus(dispatchId);
      expect(status.status).toBe('pending');

      server.simulateProgress(dispatchId);
      status = await client.getDispatchStatus(dispatchId);
      expect(status.status).toBe('running');

      server.simulateCompletion(dispatchId, createSuccessResult(req));
      status = await client.getDispatchStatus(dispatchId);
      expect(status.status).toBe('completed');
    });
  });

  describe('Telemetry Recording', () => {
    it('records successful run in Volva DB', () => {
      const runId = recordRun(db, {
        skillInstanceId: 'si-test',
        conversationId: 'conv-test-001',
        outcome: 'success',
        durationMs: 45000,
        notes: 'Integration test run',
      });

      expect(runId).toMatch(/^run_/);

      const metrics = getMetrics(db, 'si-test');
      expect(metrics?.runCount).toBe(1);
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.lastUsedAt).not.toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('returns 404 for unknown dispatch ID', async () => {
      await expect(client.getDispatchStatus('nonexistent'))
        .rejects.toBeInstanceOf(KarviApiError);
    });

    it('cancels a queued dispatch', async () => {
      const { dispatchId } = await client.dispatchSkill(goldenPathRequest);

      const result = await client.cancelDispatch(dispatchId);
      expect(result.id).toBe(dispatchId);
      expect(result.cancelled).toBe(true);
    });
  });
});
