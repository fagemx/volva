import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { DecisionSessionManager } from '../decision/session-manager';
import { decisionRoutes, type DecisionDeps } from './decisions';
import type { LLMClient } from '../llm/client';
import type { KarviClient } from '../karvi-client/client';
import type { IntentRoute, RealizationCandidate } from '../schemas/decision';

// ─── Test Helpers ───

function makeLLMClient(): LLMClient & { generateStructured: ReturnType<typeof vi.fn> } {
  return {
    generateStructured: vi.fn(),
    generateText: vi.fn(),
  } as unknown as LLMClient & { generateStructured: ReturnType<typeof vi.fn> };
}

function makeKarviClient(): KarviClient & { forgeBuild: ReturnType<typeof vi.fn> } {
  return {
    forgeBuild: vi.fn(),
  } as unknown as KarviClient & { forgeBuild: ReturnType<typeof vi.fn> };
}

function makeApp(
  db: Database,
  llm: LLMClient,
  karvi?: KarviClient,
): { app: Hono; sessionManager: DecisionSessionManager } {
  const sessionManager = new DecisionSessionManager(db);
  const deps: DecisionDeps = { db, llm, sessionManager, karvi };
  const root = new Hono();
  root.route('/', decisionRoutes(deps));
  return { app: root, sessionManager };
}

async function jsonPost(app: Hono, path: string, body: Record<string, unknown>): Promise<Response> {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

async function jsonGet(app: Hono, path: string): Promise<Response> {
  const res = await app.request(path, { method: 'GET' });
  return res;
}

// ─── Fixture Data ───

const economicIntentRoute: IntentRoute = {
  primaryRegime: 'economic',
  secondaryRegimes: ['leverage'],
  confidence: 0.9,
  signals: ['money goal', 'explicit budget'],
  rationale: ['Cash outcome is terminal intent'],
  keyUnknowns: ['edge profile', 'buyer proximity'],
  suggestedFollowups: ['Who are your most likely buyers?'],
};

const governanceIntentRoute: IntentRoute = {
  primaryRegime: 'governance',
  confidence: 0.93,
  signals: ['world/space language', 'self-operating place'],
  rationale: ['Terminal intent is to create and govern a consequential space'],
  keyUnknowns: ['world form', 'pressure source'],
  suggestedFollowups: ['What kind of place: market, commons, or something else?'],
};

const leverageIntentRoute: IntentRoute = {
  primaryRegime: 'leverage',
  confidence: 0.95,
  signals: ['automation pipeline', 'expert self-identification'],
  rationale: ['Terminal intent is systematizing production'],
  keyUnknowns: [],
  suggestedFollowups: [],
};

function makeEconomicCandidates(): RealizationCandidate[] {
  return [
    {
      id: 'video-gen-install-service',
      regime: 'economic',
      form: 'service',
      domain: 'video generation',
      vehicle: 'done_with_you_install',
      description: 'Install video generation workflow for design studios, buyer pays for setup',
      whyThisCandidate: ['Combines domain expertise with service delivery', 'Clear buyer signal from studios'],
      assumptions: ['Design studios need workflow setup help', 'Buyer willing to pay for install service'],
      probeReadinessHints: ['Direct offer to 3 studios to measure outcome and buyer interest'],
      timeToSignal: 'short',
      notes: ['Focus on small studios first'],
    },
    {
      id: 'video-gen-workflow-audit',
      regime: 'economic',
      form: 'service',
      domain: 'video generation',
      vehicle: 'workflow_audit',
      description: 'Audit existing video workflows for efficiency, buyer pays per evaluation',
      whyThisCandidate: ['Lower commitment for buyer', 'Quick signal on interest'],
      assumptions: ['Studios have existing workflows to audit', 'Buyer recognizes value in audit'],
      probeReadinessHints: ['Free audit offer to measure outcome response rate'],
      timeToSignal: 'short',
      notes: ['Entry point for upsell'],
    },
  ];
}

function makeGovernanceCandidates(): RealizationCandidate[] {
  return [
    {
      id: 'creator-market-world',
      regime: 'governance',
      form: 'world',
      worldForm: 'market',
      description: 'Exchange-driven creator market with AI governance cycle',
      whyThisCandidate: ['Market form supports natural pressure', 'Creator density enables closure'],
      assumptions: ['Creators will participate in governed market', 'AI governance achieves state density'],
      probeReadinessHints: ['Minimum state instantiation to observe outcome and consequence patterns'],
      timeToSignal: 'medium',
      notes: ['Requires constitution draft', 'Chief assignments needed'],
    },
    {
      id: 'knowledge-commons-world',
      regime: 'governance',
      form: 'world',
      worldForm: 'commons',
      description: 'Shared knowledge commons with self-governing rules and state changes',
      whyThisCandidate: ['Commons form for knowledge curation', 'Natural governance pressure from contributions'],
      assumptions: ['Contributors follow governance cycle', 'State changes are observable and consequential'],
      probeReadinessHints: ['Observe contribution patterns and governance outcome visibility'],
      timeToSignal: 'medium',
      notes: ['Need zone design', 'Cycle: observe-propose-judge-apply'],
    },
  ];
}

// ─── Tests ───

describe('Decision Routes E2E', () => {
  let db: Database;
  let llm: LLMClient & { generateStructured: ReturnType<typeof vi.fn> };
  let karvi: KarviClient & { forgeBuild: ReturnType<typeof vi.fn> };
  let app: Hono;
  let sessionManager: DecisionSessionManager;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    llm = makeLLMClient();
    karvi = makeKarviClient();
    karvi.forgeBuild.mockResolvedValue({
      buildId: 'build-default',
      status: 'queued',
      pipeline: 'forge-economic',
      steps: 3,
    });
    const result = makeApp(db, llm, karvi);
    app = result.app;
    sessionManager = result.sessionManager;
  });

  // ═══════════════════════════════════════════
  // GP-1: Economic Regime E2E
  // ═══════════════════════════════════════════
  describe('GP-1: Economic regime golden path', () => {
    it('completes start -> path-check -> space-build -> evaluate -> forge', async () => {
      // Step 1: Start (LLM call #1: classifyIntent)
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: economicIntentRoute,
      });

      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want to make money, here is $1000',
      });
      expect(startRes.status).toBe(201);
      const startBody = await startRes.json() as {
        ok: boolean;
        data: { sessionId: string; intentRoute: IntentRoute; stage: string };
      };
      expect(startBody.ok).toBe(true);
      expect(startBody.data.intentRoute.primaryRegime).toBe('economic');
      expect(startBody.data.stage).toBe('routing');
      const sessionId = startBody.data.sessionId;

      // Step 2: Path-check (0 LLM calls -- pure function)
      const pathRes = await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      expect(pathRes.status).toBe(200);
      const pathBody = await pathRes.json() as {
        ok: boolean;
        data: { pathCheckResult: { route: string; certainty: string }; stage: string };
      };
      expect(pathBody.ok).toBe(true);
      expect(pathBody.data.pathCheckResult.route).toBe('space-builder');
      expect(pathBody.data.stage).toBe('path-check');

      // Step 3: Space-build (LLM call #2: buildSpace)
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: makeEconomicCandidates(),
      });

      const spaceRes = await jsonPost(app, `/api/decisions/${sessionId}/space-build`, {
        userMessage: 'I want to make money with video generation',
      });
      expect(spaceRes.status).toBe(200);
      const spaceBody = await spaceRes.json() as {
        ok: boolean;
        data: { candidates: RealizationCandidate[]; killedCount: number; stage: string };
      };
      expect(spaceBody.ok).toBe(true);
      expect(spaceBody.data.candidates.length).toBeGreaterThanOrEqual(1);
      expect(spaceBody.data.stage).toBe('space-building');

      // Get the first candidate ID from the DB
      const candidates = sessionManager.getCandidates(sessionId);
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const candidateId = candidates[0].id;

      // Step 4: Evaluate (0 LLM calls in v0 -- pure function)
      const evalRes = await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId,
        signals: [
          {
            signalType: 'buyer_interest',
            strength: 'strong',
            evidence: ['3 studios expressed interest', 'willing to pay $200'],
            interpretation: 'Strong buyer signal',
            nextQuestions: ['What price point?'],
          },
        ],
      });
      expect(evalRes.status).toBe(200);
      const evalBody = await evalRes.json() as {
        ok: boolean;
        data: { commitMemo: { verdict: string; whatForgeShouldBuild: string[] }; stage: string };
      };
      expect(evalBody.ok).toBe(true);
      expect(evalBody.data.commitMemo.verdict).toBe('commit');
      expect(evalBody.data.commitMemo.whatForgeShouldBuild.length).toBeGreaterThan(0);
      expect(evalBody.data.stage).toBe('commit-review');

      // Step 5: Forge (0 LLM calls, requires confirmation)
      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {
        confirmation: true,
      });
      expect(forgeRes.status).toBe(200);
      const forgeBody = await forgeRes.json() as {
        ok: boolean;
        data: { forgeReady: boolean; fastPath: boolean; stage: string };
      };
      expect(forgeBody.ok).toBe(true);
      expect(forgeBody.data.forgeReady).toBe(true);
      expect(forgeBody.data.fastPath).toBe(false);
      expect(forgeBody.data.stage).toBe('done');

      // Verify final session state
      const finalSession = sessionManager.getSession(sessionId);
      expect(finalSession).not.toBeNull();
      expect(finalSession!.stage).toBe('done');
      expect(finalSession!.status).toBe('promoted');
    });

    it('dispatches forge build to Karvi with economic request payload', async () => {
      const karvi = makeKarviClient();
      karvi.forgeBuild.mockResolvedValueOnce({
        buildId: 'build-economic-001',
        status: 'queued',
        pipeline: 'forge-economic',
        steps: 3,
      });

      const result = makeApp(db, llm, karvi);
      app = result.app;
      sessionManager = result.sessionManager;

      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want to make money with automation',
      });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'video generation install service' });

      const candidates = sessionManager.getCandidates(sessionId);
      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [
          {
            signalType: 'buyer_interest',
            strength: 'strong',
            evidence: ['3 studios ready to pay'],
            interpretation: 'Strong demand',
            nextQuestions: [],
          },
        ],
      });

      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {
        confirmation: true,
      });
      expect(forgeRes.status).toBe(200);
      const forgeBody = await forgeRes.json() as {
        ok: boolean;
        data: {
          forgeBuildRequest: {
            regime: string;
            regimeContext: { kind: string };
          };
          forgeResult: { buildId: string; status: string; pipeline: string; steps: number };
          stage: string;
        };
      };

      expect(forgeBody.ok).toBe(true);
      expect(forgeBody.data.forgeBuildRequest.regime).toBe('economic');
      expect(forgeBody.data.forgeBuildRequest.regimeContext.kind).toBe('economic');
      expect(forgeBody.data.forgeResult.buildId).toBe('build-economic-001');
      expect(forgeBody.data.forgeResult.status).toBe('queued');
      expect(forgeBody.data.forgeResult.pipeline).toBe('forge-economic');
      expect(forgeBody.data.forgeResult.steps).toBe(3);
      expect(forgeBody.data.stage).toBe('done');

      expect(karvi.forgeBuild).toHaveBeenCalledTimes(1);
      const req = karvi.forgeBuild.mock.calls[0][0] as {
        regime: string;
        regimeContext: { kind: string };
      };
      expect(req.regime).toBe('economic');
      expect(req.regimeContext.kind).toBe('economic');
    });
  });

  // ═══════════════════════════════════════════
  // GP-2: Governance Regime E2E
  // ═══════════════════════════════════════════
  describe('GP-2: Governance regime golden path', () => {
    it('completes start -> path-check -> space-build -> evaluate -> forge', async () => {
      // Step 1: Start
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: governanceIntentRoute,
      });

      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want to open a self-operating place and let AI manage it',
      });
      expect(startRes.status).toBe(201);
      const startBody = await startRes.json() as {
        ok: boolean;
        data: { sessionId: string; intentRoute: IntentRoute };
      };
      expect(startBody.data.intentRoute.primaryRegime).toBe('governance');
      const sessionId = startBody.data.sessionId;

      // Step 2: Path-check
      const pathRes = await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      expect(pathRes.status).toBe(200);
      const pathBody = await pathRes.json() as {
        ok: boolean;
        data: { pathCheckResult: { route: string } };
      };
      expect(pathBody.data.pathCheckResult.route).toBe('space-builder');

      // Step 3: Space-build
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: makeGovernanceCandidates(),
      });

      const spaceRes = await jsonPost(app, `/api/decisions/${sessionId}/space-build`, {
        userMessage: 'I want to open a self-operating place',
      });
      expect(spaceRes.status).toBe(200);
      const spaceBody = await spaceRes.json() as {
        ok: boolean;
        data: { candidates: RealizationCandidate[] };
      };
      expect(spaceBody.data.candidates.length).toBeGreaterThanOrEqual(1);

      // Get candidate
      const candidates = sessionManager.getCandidates(sessionId);
      const candidateId = candidates[0].id;

      // Step 4: Evaluate with strong signal
      const evalRes = await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId,
        signals: [
          {
            signalType: 'world_density',
            strength: 'strong',
            evidence: ['governance cycle runs', 'state changes observed'],
            interpretation: 'World has density',
            nextQuestions: [],
          },
        ],
      });
      expect(evalRes.status).toBe(200);
      const evalBody = await evalRes.json() as {
        ok: boolean;
        data: { commitMemo: { verdict: string; regime: string } };
      };
      expect(evalBody.data.commitMemo.verdict).toBe('commit');
      expect(evalBody.data.commitMemo.regime).toBe('governance');

      // Step 5: Forge with confirmation
      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {
        confirmation: true,
      });
      expect(forgeRes.status).toBe(200);
      const forgeBody = await forgeRes.json() as {
        ok: boolean;
        data: { forgeReady: boolean; stage: string };
      };
      expect(forgeBody.data.forgeReady).toBe(true);
      expect(forgeBody.data.stage).toBe('done');
    });

    it('dispatches forge build to Karvi with governance request payload', async () => {
      const karvi = makeKarviClient();
      karvi.forgeBuild.mockResolvedValueOnce({
        buildId: 'build-governance-001',
        status: 'queued',
        pipeline: 'forge-governance',
        steps: 3,
      });

      const result = makeApp(db, llm, karvi);
      app = result.app;
      sessionManager = result.sessionManager;

      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: governanceIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want a self-governing creator market',
      });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeGovernanceCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, {
        userMessage: 'governed creator world',
      });

      const candidates = sessionManager.getCandidates(sessionId);
      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [
          {
            signalType: 'world_density',
            strength: 'strong',
            evidence: ['state transitions observed'],
            interpretation: 'governance pressure exists',
            nextQuestions: [],
          },
        ],
      });

      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {
        confirmation: true,
      });
      expect(forgeRes.status).toBe(200);

      const forgeBody = await forgeRes.json() as {
        ok: boolean;
        data: {
          forgeBuildRequest: {
            regime: string;
            regimeContext: { kind: string; worldForm?: string };
          };
          forgeResult: { pipeline: string; steps: number };
        };
      };

      expect(forgeBody.ok).toBe(true);
      expect(forgeBody.data.forgeBuildRequest.regime).toBe('governance');
      expect(forgeBody.data.forgeBuildRequest.regimeContext.kind).toBe('governance');
      expect(forgeBody.data.forgeResult.pipeline).toBe('forge-governance');
      expect(forgeBody.data.forgeResult.steps).toBe(3);

      expect(karvi.forgeBuild).toHaveBeenCalledTimes(1);
      const req = karvi.forgeBuild.mock.calls[0][0] as {
        regimeContext: { kind: string; worldForm?: string };
      };
      expect(req.regimeContext.kind).toBe('governance');
      expect(req.regimeContext.worldForm).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════
  // GP-3: Forge Fast-Path
  // ═══════════════════════════════════════════
  describe('GP-3: Forge fast-path', () => {
    it('start -> path-check(high certainty) -> forge directly', async () => {
      // Step 1: Start with high-confidence leverage intent
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: leverageIntentRoute,
      });

      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'Build me a video generation workflow install service for design studios',
      });
      expect(startRes.status).toBe(201);
      const startBody = await startRes.json() as {
        ok: boolean;
        data: { sessionId: string; intentRoute: IntentRoute };
      };
      expect(startBody.data.intentRoute.primaryRegime).toBe('leverage');
      const sessionId = startBody.data.sessionId;

      // Step 2: Path-check with all elements fixed -> forge-fast-path
      const pathRes = await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {
        domain: 'video generation',
        form: 'workflow_pack',
        buyer: 'design studios',
        loop: 'concept -> produce -> publish',
        buildTarget: 'workflow install service',
      });
      expect(pathRes.status).toBe(200);
      const pathBody = await pathRes.json() as {
        ok: boolean;
        data: { pathCheckResult: { route: string; certainty: string } };
      };
      expect(pathBody.data.pathCheckResult.route).toBe('forge-fast-path');
      expect(pathBody.data.pathCheckResult.certainty).toBe('high');

      // Step 3: Forge directly (skip space-build and evaluate)
      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {
        confirmation: true,
      });
      expect(forgeRes.status).toBe(200);
      const forgeBody = await forgeRes.json() as {
        ok: boolean;
        data: {
          forgeReady: boolean;
          fastPath: boolean;
          commitMemo: { verdict: string; whatForgeShouldBuild: string[] };
          stage: string;
        };
      };
      expect(forgeBody.data.forgeReady).toBe(true);
      expect(forgeBody.data.fastPath).toBe(true);
      expect(forgeBody.data.commitMemo.verdict).toBe('commit');
      expect(forgeBody.data.commitMemo.whatForgeShouldBuild.length).toBeGreaterThan(0);
      expect(forgeBody.data.stage).toBe('done');

      // Verify session used fastPathToDone, not advanceStage
      const finalSession = sessionManager.getSession(sessionId);
      expect(finalSession!.stage).toBe('done');
    });
  });

  // ═══════════════════════════════════════════
  // GP-4: Low Confidence + Reclassify
  // ═══════════════════════════════════════════
  describe('GP-4: Low confidence + follow-up reclassify', () => {
    it('low confidence stays at routing, reclassify updates regime', async () => {
      // Step 1: Start with ambiguous message -> low confidence
      const lowConfidenceRoute: IntentRoute = {
        primaryRegime: 'economic',
        confidence: 0.4,
        signals: ['vague intent'],
        rationale: ['Unclear terminal intent'],
        keyUnknowns: ['everything'],
        suggestedFollowups: ['What do you actually want to change?'],
      };
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: lowConfidenceRoute,
      });

      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want to do something',
      });
      expect(startRes.status).toBe(201);
      const startBody = await startRes.json() as {
        ok: boolean;
        data: { sessionId: string; intentRoute: IntentRoute; stage: string };
      };
      expect(startBody.data.intentRoute.confidence).toBeLessThan(0.5);
      expect(startBody.data.stage).toBe('routing');
      const sessionId = startBody.data.sessionId;

      // Step 2: Reclassify with clearer message
      const clearRoute: IntentRoute = {
        primaryRegime: 'governance',
        confidence: 0.88,
        signals: ['world/space language'],
        rationale: ['Clear governance intent after follow-up'],
        keyUnknowns: ['world form'],
        suggestedFollowups: [],
      };
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: clearRoute,
      });

      const reclassifyRes = await jsonPost(app, `/api/decisions/${sessionId}/reclassify`, {
        userMessage: 'I want to build a self-operating marketplace where AI governs it',
      });
      expect(reclassifyRes.status).toBe(200);
      const reclassifyBody = await reclassifyRes.json() as {
        ok: boolean;
        data: { intentRoute: IntentRoute; stage: string };
      };
      expect(reclassifyBody.data.intentRoute.primaryRegime).toBe('governance');
      expect(reclassifyBody.data.intentRoute.confidence).toBeGreaterThanOrEqual(0.7);
      expect(reclassifyBody.data.stage).toBe('routing');
    });
  });

  // ═══════════════════════════════════════════
  // GP-5: Hold Verdict -> Retry Evaluate
  // ═══════════════════════════════════════════
  describe('GP-5: Hold verdict -> retry with new signals', () => {
    it('hold verdict allows retry-evaluate with additional signals', async () => {
      // Setup: run through start -> path-check -> space-build -> evaluate(hold)
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want to make money',
      });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});

      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'money' });

      const candidates = sessionManager.getCandidates(sessionId);
      const candidateId = candidates[0].id;

      // Evaluate with moderate signal -> hold
      const evalRes = await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId,
        signals: [
          {
            signalType: 'buyer_interest',
            strength: 'moderate',
            evidence: ['1 studio interested'],
            interpretation: 'Moderate interest',
            nextQuestions: ['Need more data'],
          },
        ],
      });
      const evalBody = await evalRes.json() as {
        ok: boolean;
        data: { commitMemo: { verdict: string }; stage: string };
      };
      expect(evalBody.data.commitMemo.verdict).toBe('hold');
      expect(evalBody.data.stage).toBe('commit-review');

      // Forge should reject (verdict is hold, but endpoint checks confirmation, not verdict)
      // Actually the forge endpoint doesn't check verdict, but we can test retry-evaluate
      const retryRes = await jsonPost(app, `/api/decisions/${sessionId}/retry-evaluate`, {
        candidateId,
        additionalSignals: [
          {
            signalType: 'buyer_conversion',
            strength: 'strong',
            evidence: ['Studio signed contract', 'Paid $500 deposit'],
            interpretation: 'Converted buyer',
            nextQuestions: [],
          },
        ],
      });
      expect(retryRes.status).toBe(200);
      const retryBody = await retryRes.json() as {
        ok: boolean;
        data: { commitMemo: { verdict: string }; stage: string };
      };
      expect(retryBody.data.commitMemo.verdict).toBe('commit');
      expect(retryBody.data.stage).toBe('commit-review');
    });
  });

  // ═══════════════════════════════════════════
  // GP-6: Kill-All Recovery
  // ═══════════════════════════════════════════
  describe('GP-6: All candidates killed -> retry space-build', () => {
    it('returns 0 candidates when all killed, allows retry', async () => {
      // Setup
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', {
        userMessage: 'I want to make money',
      });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});

      // First space-build: all candidates killed (bad bet patterns)
      const killableCandidates: RealizationCandidate[] = [
        {
          id: 'seo-blog',
          regime: 'economic',
          form: 'tool',
          description: 'SEO content calendar tool for everyone',
          whyThisCandidate: ['Anyone can do generic template'],
          assumptions: ['no special skill'],
          probeReadinessHints: [],
          timeToSignal: 'long',
          notes: ['build first, months of content, accumulate audience'],
        },
      ];
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: killableCandidates });

      const spaceRes1 = await jsonPost(app, `/api/decisions/${sessionId}/space-build`, {
        userMessage: 'money from seo',
      });
      expect(spaceRes1.status).toBe(200);
      const spaceBody1 = await spaceRes1.json() as {
        ok: boolean;
        data: { candidates: RealizationCandidate[]; killedCount: number; stage: string };
      };
      expect(spaceBody1.data.candidates).toHaveLength(0);
      expect(spaceBody1.data.killedCount).toBeGreaterThan(0);

      // Session advanced to space-building, can try space-build endpoint again
      // Need to reset to path-check first (space-building -> path-check is allowed)
      sessionManager.resetToStage(sessionId, 'path-check');

      // Retry space-build with better candidates
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      const spaceRes2 = await jsonPost(app, `/api/decisions/${sessionId}/space-build`, {
        userMessage: 'video generation install service for studios',
      });
      expect(spaceRes2.status).toBe(200);
      const spaceBody2 = await spaceRes2.json() as {
        ok: boolean;
        data: { candidates: RealizationCandidate[] };
      };
      expect(spaceBody2.data.candidates.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════
  // CONTRACT Validation
  // ═══════════════════════════════════════════
  describe('CONTRACT validation', () => {
    // COND-02: Each endpoint makes at most 1 LLM call (VALIDATION.md says <=1 actually)
    it('COND-02: start endpoint makes exactly 1 LLM call', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const callsBefore = llm.generateStructured.mock.calls.length;
      await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const callsAfter = llm.generateStructured.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(1);
    });

    it('COND-02: path-check endpoint makes 0 LLM calls', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      const callsBefore = llm.generateStructured.mock.calls.length;
      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      const callsAfter = llm.generateStructured.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(0);
    });

    it('COND-02: space-build endpoint makes exactly 1 LLM call', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});

      const callsBefore = llm.generateStructured.mock.calls.length;
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });
      const callsAfter = llm.generateStructured.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(1);
    });

    it('COND-02: evaluate endpoint makes 0 LLM calls (v0 pure)', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });
      const candidates = sessionManager.getCandidates(sessionId);

      const callsBefore = llm.generateStructured.mock.calls.length;
      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [{ signalType: 'test', strength: 'strong', evidence: ['e'], interpretation: 'i', nextQuestions: [] }],
      });
      const callsAfter = llm.generateStructured.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(0);
    });

    it('COND-02: forge endpoint makes 0 LLM calls', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });
      const candidates = sessionManager.getCandidates(sessionId);

      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [{ signalType: 'x', strength: 'strong', evidence: ['e'], interpretation: 'i', nextQuestions: [] }],
      });

      const callsBefore = llm.generateStructured.mock.calls.length;
      await jsonPost(app, `/api/decisions/${sessionId}/forge`, { confirmation: true });
      const callsAfter = llm.generateStructured.mock.calls.length;
      expect(callsAfter - callsBefore).toBe(0);
    });

    // SETTLE-01: Forge requires confirmation
    it('SETTLE-01: forge rejects without confirmation', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });
      const candidates = sessionManager.getCandidates(sessionId);

      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [{ signalType: 'x', strength: 'strong', evidence: ['e'], interpretation: 'i', nextQuestions: [] }],
      });

      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {});
      expect(forgeRes.status).toBe(400);
      const forgeBody = await forgeRes.json() as {
        ok: boolean;
        error: { code: string };
      };
      expect(forgeBody.ok).toBe(false);
      expect(forgeBody.error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('SETTLE-01: forge rejects with confirmation: false', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });
      const candidates = sessionManager.getCandidates(sessionId);

      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [{ signalType: 'x', strength: 'strong', evidence: ['e'], interpretation: 'i', nextQuestions: [] }],
      });

      const forgeRes = await jsonPost(app, `/api/decisions/${sessionId}/forge`, {
        confirmation: false,
      });
      expect(forgeRes.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════
  // List and Get endpoints
  // ═══════════════════════════════════════════
  describe('List and Get endpoints', () => {
    it('GET /api/decisions lists sessions', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });

      const listRes = await jsonGet(app, '/api/decisions');
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json() as {
        ok: boolean;
        data: { sessions: { id: string; primaryRegime: string }[] };
      };
      expect(listBody.ok).toBe(true);
      expect(listBody.data.sessions.length).toBe(1);
      expect(listBody.data.sessions[0].primaryRegime).toBe('economic');
    });

    it('GET /api/decisions/:id returns session detail', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      const getRes = await jsonGet(app, `/api/decisions/${sessionId}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json() as {
        ok: boolean;
        data: { session: { id: string; primaryRegime: string } };
      };
      expect(getBody.data.session.id).toBe(sessionId);
      expect(getBody.data.session.primaryRegime).toBe('economic');
    });

    it('GET /api/decisions/:id returns 404 for nonexistent session', async () => {
      const getRes = await jsonGet(app, '/api/decisions/ds_nonexistent');
      expect(getRes.status).toBe(404);
    });

    it('GET /api/decisions returns 400 for invalid status filter', async () => {
      const res = await jsonGet(app, '/api/decisions?status=invalid');
      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_INPUT');
    });
  });

  // ═══════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════
  describe('Error handling', () => {
    it('start rejects missing userMessage', async () => {
      const res = await jsonPost(app, '/api/decisions/start', {});
      expect(res.status).toBe(400);
    });

    it('path-check rejects wrong stage', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      // First path-check succeeds (routing -> path-check)
      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});

      // Second path-check fails (already at path-check, not routing)
      const pathRes = await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      expect(pathRes.status).toBe(400);
    });

    it('evaluate rejects missing candidateId', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });

      const evalRes = await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {});
      expect(evalRes.status).toBe(400);
    });

    it('forge rejects nonexistent session', async () => {
      const forgeRes = await jsonPost(app, '/api/decisions/ds_nonexistent/forge', {
        confirmation: true,
      });
      expect(forgeRes.status).toBe(404);
    });

    it('reclassify rejects wrong stage (not routing)', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      // Advance past routing
      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});

      const reclassifyRes = await jsonPost(app, `/api/decisions/${sessionId}/reclassify`, {
        userMessage: 'new message',
      });
      expect(reclassifyRes.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════
  // Forge Result Telemetry (Issue #153)
  // ═══════════════════════════════════════════
  describe('forge-result telemetry recording', () => {
    async function createDoneSession(): Promise<string> {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      await jsonPost(app, `/api/decisions/${sessionId}/path-check`, {});
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: makeEconomicCandidates() });
      await jsonPost(app, `/api/decisions/${sessionId}/space-build`, { userMessage: 'test' });
      const candidates = sessionManager.getCandidates(sessionId);

      await jsonPost(app, `/api/decisions/${sessionId}/evaluate`, {
        candidateId: candidates[0].id,
        signals: [{ signalType: 'x', strength: 'strong', evidence: ['e'], interpretation: 'i', nextQuestions: [] }],
      });

      await jsonPost(app, `/api/decisions/${sessionId}/forge`, { confirmation: true });
      return sessionId;
    }

    function makeForgeResultPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        sessionId: 'sess-test',
        status: 'success',
        durationMs: 5000,
        artifacts: [
          { type: 'file', path: '/src/main.ts', description: 'Main entry' },
        ],
        steps: [
          { stepId: 'plan-1', type: 'plan', status: 'success', artifacts: [] },
          { stepId: 'implement-1', type: 'implement', status: 'success', artifacts: ['/src/main.ts'] },
          { stepId: 'review-1', type: 'review', status: 'success', artifacts: [] },
        ],
        telemetry: {
          tokensUsed: 25000,
          costUsd: 0.10,
          runtime: 'karvi-worker',
          model: 'claude-sonnet-4-20250514',
          stepsExecuted: 3,
        },
        ...overrides,
      };
    }

    it('records multi-step forge result (3 steps)', async () => {
      const sessionId = await createDoneSession();
      const res = await jsonPost(app, `/api/decisions/${sessionId}/forge-result`, makeForgeResultPayload());
      expect(res.status).toBe(200);

      const body = await res.json() as {
        ok: boolean;
        data: { sessionId: string; buildId: string; outcome: string };
      };
      expect(body.ok).toBe(true);
      expect(body.data.buildId).toMatch(/^forge_/);
      expect(body.data.outcome).toBe('success');

      // Verify DB record
      const row = db.prepare('SELECT * FROM forge_builds WHERE id = ?').get(body.data.buildId) as Record<string, unknown>;
      expect(row.tokens_used).toBe(25000);
      expect(row.cost_usd).toBe(0.10);
      expect(row.artifact_count).toBe(1);
      expect(row.failed_steps_json).toBeNull();
    });

    it('records single-step forge result (fallback)', async () => {
      const sessionId = await createDoneSession();
      const payload = makeForgeResultPayload({
        steps: [
          { stepId: 'exec-1', type: 'execute', status: 'success', artifacts: [] },
        ],
        telemetry: {
          tokensUsed: 8000,
          costUsd: 0.03,
          runtime: 'karvi-worker',
          model: 'claude-sonnet-4-20250514',
          stepsExecuted: 1,
        },
      });

      const res = await jsonPost(app, `/api/decisions/${sessionId}/forge-result`, payload);
      expect(res.status).toBe(200);

      const body = await res.json() as {
        ok: boolean;
        data: { buildId: string; outcome: string };
      };
      expect(body.data.outcome).toBe('success');

      const row = db.prepare('SELECT tokens_used FROM forge_builds WHERE id = ?').get(body.data.buildId) as Record<string, unknown>;
      expect(row.tokens_used).toBe(8000);
    });

    it('records partial failure with failed steps', async () => {
      const sessionId = await createDoneSession();
      const payload = makeForgeResultPayload({
        status: 'partial',
        steps: [
          { stepId: 'plan-1', type: 'plan', status: 'success', artifacts: [] },
          { stepId: 'implement-1', type: 'implement', status: 'failure', artifacts: [] },
          { stepId: 'review-1', type: 'review', status: 'skipped', artifacts: [] },
        ],
      });

      const res = await jsonPost(app, `/api/decisions/${sessionId}/forge-result`, payload);
      expect(res.status).toBe(200);

      const body = await res.json() as {
        ok: boolean;
        data: { buildId: string; outcome: string };
      };
      expect(body.data.outcome).toBe('partial');

      const row = db.prepare('SELECT failed_steps_json, status FROM forge_builds WHERE id = ?').get(body.data.buildId) as Record<string, unknown>;
      expect(row.status).toBe('partial');
      expect(JSON.parse(row.failed_steps_json as string)).toEqual(['implement-1: implement']);
    });

    it('returns 404 for nonexistent session', async () => {
      const res = await jsonPost(app, '/api/decisions/ds_nonexistent/forge-result', makeForgeResultPayload());
      expect(res.status).toBe(404);
    });

    it('returns 400 for session not in done stage', async () => {
      llm.generateStructured.mockResolvedValueOnce({ ok: true, data: economicIntentRoute });
      const startRes = await jsonPost(app, '/api/decisions/start', { userMessage: 'test' });
      const startBody = await startRes.json() as { ok: boolean; data: { sessionId: string } };
      const sessionId = startBody.data.sessionId;

      const res = await jsonPost(app, `/api/decisions/${sessionId}/forge-result`, makeForgeResultPayload());
      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; error: { code: string } };
      expect(body.error.code).toBe('INVALID_STAGE');
    });

    it('returns 400 for invalid payload', async () => {
      const sessionId = await createDoneSession();
      const res = await jsonPost(app, `/api/decisions/${sessionId}/forge-result`, { invalid: true });
      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; error: { code: string } };
      expect(body.error.code).toBe('INVALID_INPUT');
    });
  });
});
