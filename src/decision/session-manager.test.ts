import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from '../db';
import { DecisionSessionManager } from './session-manager';
import type { Database } from 'bun:sqlite';

describe('DecisionSessionManager', () => {
  let db: Database;
  let manager: DecisionSessionManager;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    manager = new DecisionSessionManager(db);
  });

  // ─── CRUD ───

  it('creates a session with default stage and status', () => {
    const session = manager.createSession({ title: 'test' });
    expect(session.id).toMatch(/^ds_/);
    expect(session.stage).toBe('routing');
    expect(session.status).toBe('active');
    expect(session.title).toBe('test');
    expect(session.keyUnknowns).toEqual([]);
    expect(session.secondaryRegimes).toEqual([]);
  });

  it('creates a session with no options', () => {
    const session = manager.createSession();
    expect(session.id).toMatch(/^ds_/);
    expect(session.conversationId).toBeNull();
    expect(session.userId).toBeNull();
    expect(session.title).toBeNull();
  });

  it('returns null for nonexistent session', () => {
    expect(manager.getSession('ds_nonexistent')).toBeNull();
  });

  it('updates session fields', () => {
    const session = manager.createSession({ title: 'original' });
    const updated = manager.updateSession(session.id, {
      title: 'updated',
      primaryRegime: 'economic',
      secondaryRegimes: ['capability'],
      routingConfidence: 0.85,
      pathCertainty: 'medium',
      keyUnknowns: ['market size'],
      currentSummary: 'testing update',
    });
    expect(updated.title).toBe('updated');
    expect(updated.primaryRegime).toBe('economic');
    expect(updated.secondaryRegimes).toEqual(['capability']);
    expect(updated.routingConfidence).toBe(0.85);
    expect(updated.pathCertainty).toBe('medium');
    expect(updated.keyUnknowns).toEqual(['market size']);
    expect(updated.currentSummary).toBe('testing update');
  });

  it('throws when updating nonexistent session', () => {
    expect(() => manager.updateSession('ds_nonexistent', { title: 'x' }))
      .toThrow('Session not found');
  });

  // ─── Stage Machine ───

  it('advances routing -> path-check when primaryRegime is set', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic' });
    const advanced = manager.advanceStage(session.id, 'path-check');
    expect(advanced.stage).toBe('path-check');
  });

  it('rejects path-check advance without primaryRegime', () => {
    const session = manager.createSession();
    expect(() => manager.advanceStage(session.id, 'path-check'))
      .toThrow('primaryRegime not set');
  });

  it('rejects space-building advance without routeDecision', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic' });
    manager.advanceStage(session.id, 'path-check');
    expect(() => manager.advanceStage(session.id, 'space-building'))
      .toThrow('routeDecision not set');
  });

  it('rejects backward stage transition', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic' });
    manager.advanceStage(session.id, 'path-check');
    expect(() => manager.advanceStage(session.id, 'routing'))
      .toThrow('must advance forward');
  });

  it('rejects stage skip', () => {
    const session = manager.createSession();
    expect(() => manager.advanceStage(session.id, 'space-building'))
      .toThrow('Cannot skip stages');
  });

  it('rejects advance on nonexistent session', () => {
    expect(() => manager.advanceStage('ds_nonexistent', 'path-check'))
      .toThrow('Session not found');
  });

  it('advances through all stages in order', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, {
      primaryRegime: 'economic',
      routeDecision: 'space-builder',
    });

    const stages = [
      'path-check',
      'space-building',
      'probe-design',
      'probe-review',
      'commit-review',
      'spec-crystallization',
      'promotion-check',
      'done',
    ] as const;

    for (const stage of stages) {
      const result = manager.advanceStage(session.id, stage);
      expect(result.stage).toBe(stage);
    }
  });

  // ─── Fast-Path ───

  it('fastPathToDone jumps from path-check to done when forge-fast-path', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, {
      primaryRegime: 'leverage',
      routeDecision: 'forge-fast-path',
    });
    manager.advanceStage(session.id, 'path-check');
    const done = manager.fastPathToDone(session.id);
    expect(done.stage).toBe('done');
  });

  it('rejects fastPathToDone when not at path-check stage', () => {
    const session = manager.createSession();
    expect(() => manager.fastPathToDone(session.id))
      .toThrow('only allowed at path-check stage');
  });

  it('rejects fastPathToDone when not forge-fast-path', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, {
      primaryRegime: 'economic',
      routeDecision: 'space-builder',
    });
    manager.advanceStage(session.id, 'path-check');
    expect(() => manager.fastPathToDone(session.id)).toThrow('forge-fast-path');
  });

  it('rejects fastPathToDone on nonexistent session', () => {
    expect(() => manager.fastPathToDone('ds_nonexistent'))
      .toThrow('Session not found');
  });

  // ─── Reset ───

  it('resets from commit-review to space-building', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic', routeDecision: 'space-builder' });
    manager.advanceStage(session.id, 'path-check');
    manager.advanceStage(session.id, 'space-building');
    manager.advanceStage(session.id, 'probe-design');
    manager.advanceStage(session.id, 'probe-review');
    manager.advanceStage(session.id, 'commit-review');
    const reset = manager.resetToStage(session.id, 'space-building');
    expect(reset.stage).toBe('space-building');
  });

  it('resets from probe-review to probe-design', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic', routeDecision: 'space-builder' });
    manager.advanceStage(session.id, 'path-check');
    manager.advanceStage(session.id, 'space-building');
    manager.advanceStage(session.id, 'probe-design');
    manager.advanceStage(session.id, 'probe-review');
    const reset = manager.resetToStage(session.id, 'probe-design');
    expect(reset.stage).toBe('probe-design');
  });

  it('resets from space-building to path-check', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic', routeDecision: 'space-builder' });
    manager.advanceStage(session.id, 'path-check');
    manager.advanceStage(session.id, 'space-building');
    const reset = manager.resetToStage(session.id, 'path-check');
    expect(reset.stage).toBe('path-check');
  });

  it('rejects invalid reset from routing', () => {
    const session = manager.createSession();
    expect(() => manager.resetToStage(session.id, 'done')).toThrow('Cannot reset');
  });

  it('rejects reset to disallowed target', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic', routeDecision: 'space-builder' });
    manager.advanceStage(session.id, 'path-check');
    manager.advanceStage(session.id, 'space-building');
    manager.advanceStage(session.id, 'probe-design');
    manager.advanceStage(session.id, 'probe-review');
    manager.advanceStage(session.id, 'commit-review');
    expect(() => manager.resetToStage(session.id, 'routing')).toThrow('Cannot reset');
  });

  it('rejects reset on nonexistent session', () => {
    expect(() => manager.resetToStage('ds_nonexistent', 'routing'))
      .toThrow('Session not found');
  });

  // ─── Helpers: Candidates ───

  it('adds and retrieves candidates for a session', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic',
      form: 'service',
      description: 'test candidate',
      whyExists: ['reason 1'],
      assumptions: ['assumption 1'],
    });
    expect(candId).toMatch(/^cand_/);
    const candidates = manager.getCandidates(session.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toBe('test candidate');
    expect(candidates[0].whyExists).toEqual(['reason 1']);
    expect(candidates[0].assumptions).toEqual(['assumption 1']);
    expect(candidates[0].regime).toBe('economic');
    expect(candidates[0].form).toBe('service');
    expect(candidates[0].status).toBe('generated');
  });

  it('adds candidate with optional fields', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'governance',
      form: 'world',
      description: 'governance world',
      whyExists: [],
      assumptions: [],
      domain: 'marketplace',
      vehicle: 'thyra',
      worldForm: 'market',
    });
    expect(candId).toMatch(/^cand_/);
    const candidates = manager.getCandidates(session.id);
    expect(candidates[0].domain).toBe('marketplace');
    expect(candidates[0].vehicle).toBe('thyra');
    expect(candidates[0].worldForm).toBe('market');
  });

  // ─── Helpers: Probes ───

  it('adds probe and retrieves by candidate', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic', form: 'tool', description: 'x',
      whyExists: [], assumptions: [],
    });
    const probeId = manager.addProbe(session.id, candId, {
      regime: 'economic',
      hypothesis: 'people will pay',
      judge: 'revenue > 0',
      probeForm: 'interview',
      cheapestProbe: 'ask 3 people',
      disconfirmers: ['no interest'],
    });
    expect(probeId).toMatch(/^probe_/);
    const probes = manager.getProbes(candId);
    expect(probes).toHaveLength(1);
    expect(probes[0].hypothesis).toBe('people will pay');
    expect(probes[0].disconfirmers).toEqual(['no interest']);
    expect(probes[0].status).toBe('draft');
  });

  // ─── Helpers: Signals ───

  it('adds signal and retrieves by probe', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic', form: 'tool', description: 'x',
      whyExists: [], assumptions: [],
    });
    const probeId = manager.addProbe(session.id, candId, {
      regime: 'economic', hypothesis: 'h', judge: 'j',
      probeForm: 'interview', cheapestProbe: 'ask', disconfirmers: [],
    });
    const sigId = manager.addSignal(probeId, candId, {
      regime: 'economic',
      signalType: 'buyer_interest',
      strength: 'moderate',
      evidence: ['2/3 interested'],
      interpretation: 'promising',
      nextQuestions: ['price?'],
    });
    expect(sigId).toMatch(/^sig_/);
    const signals = manager.getSignals(probeId);
    expect(signals).toHaveLength(1);
    expect(signals[0].strength).toBe('moderate');
    expect(signals[0].evidence).toEqual(['2/3 interested']);
    expect(signals[0].negativeEvidence).toEqual([]);
  });

  // ─── Helpers: Commit Memo ───

  it('adds commit memo', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic', form: 'tool', description: 'x',
      whyExists: [], assumptions: [],
    });
    const memoId = manager.addCommitMemo(session.id, candId, {
      regime: 'economic',
      verdict: 'commit',
      rationale: ['strong signal'],
      evidenceUsed: ['buyer interest'],
      unresolvedRisks: [],
      recommendedNextStep: ['build MVP'],
      whatForgeShouldBuild: ['landing page'],
      whatForgeMustNotBuild: ['full platform'],
    });
    expect(memoId).toMatch(/^commit_/);
  });

  // ─── Helpers: Events ───

  it('records decision events', () => {
    const session = manager.createSession();
    const evtId = manager.addEvent(session.id, {
      eventType: 'route_assigned',
      objectType: 'session',
      objectId: session.id,
      payload: { regime: 'economic' },
    });
    expect(evtId).toMatch(/^evt_/);
  });

  // ─── Full flow: probe, signal, commit memo in sequence ───

  it('adds probe, signal, and commit memo in sequence', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic', form: 'tool', description: 'x',
      whyExists: [], assumptions: [],
    });
    const probeId = manager.addProbe(session.id, candId, {
      regime: 'economic', hypothesis: 'h', judge: 'j',
      probeForm: 'interview', cheapestProbe: 'ask 3 people',
      disconfirmers: ['no interest'],
    });
    expect(probeId).toMatch(/^probe_/);

    const sigId = manager.addSignal(probeId, candId, {
      regime: 'economic', signalType: 'buyer_interest',
      strength: 'moderate', evidence: ['2/3 interested'],
      interpretation: 'promising', nextQuestions: ['price?'],
    });
    expect(sigId).toMatch(/^sig_/);

    const memoId = manager.addCommitMemo(session.id, candId, {
      regime: 'economic', verdict: 'commit',
      rationale: ['strong signal'], evidenceUsed: ['buyer interest'],
      unresolvedRisks: [], recommendedNextStep: ['build MVP'],
      whatForgeShouldBuild: ['landing page'],
      whatForgeMustNotBuild: ['full platform'],
    });
    expect(memoId).toMatch(/^commit_/);
  });
});
