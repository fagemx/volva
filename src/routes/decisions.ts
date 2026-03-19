import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { LLMClient } from '../llm/client';
import type { KarviClient } from '../karvi-client/client';
import {
  DecisionSessionManager,
  type DecisionSession,
  type CandidateRow,
} from '../decision/session-manager';
import { classifyIntent, type ClassifyIntentContext } from '../decision/intent-router';
import { checkPath, type PathCheckContext } from '../decision/path-check';
import { buildSpace } from '../decision/space-builder';
import { applyKillFilters, type KillFilterConstraints } from '../decision/kill-filters';
import { isProbeReady, packageProbe } from '../decision/probe-shell';
import { buildForgeBuildRequest, type ForgeHandoffContext } from '../decision/forge-handoff';
import { ForgeBuildResultSchema } from '../karvi-client/schemas';
import { consumeForgeResult } from '../skills/telemetry-consumer';
import {
  recordEddaEvent,
  buildForgeDispatchedEvent,
  buildForgeCompletedEvent,
  buildForgeFailedEvent,
} from '../decision/edda-events';
import type {
  IntentRoute,
  PathCheckResult,
  RealizationCandidate,
  CommitMemo,
  SignalPacket,
  Regime,
} from '../schemas/decision';

// ─── DI Interface ───

export interface DecisionDeps {
  db: Database;
  llm: LLMClient;
  sessionManager: DecisionSessionManager;
  karvi?: KarviClient;
}

// ─── Helpers ───

function filterStrings(arr: unknown[]): string[] {
  return arr.filter((e): e is string => typeof e === 'string');
}

function buildIntentRouteFromSession(session: DecisionSession): IntentRoute {
  return {
    primaryRegime: session.primaryRegime ?? 'economic',
    secondaryRegimes: session.secondaryRegimes,
    confidence: session.routingConfidence ?? 0,
    signals: [],
    rationale: [],
    keyUnknowns: session.keyUnknowns,
    suggestedFollowups: [],
  };
}

function parseSignalPacket(
  raw: Record<string, unknown>,
  defaultCandidateId: string,
  defaultRegime: Regime,
): SignalPacket {
  return {
    candidateId: typeof raw.candidateId === 'string' ? raw.candidateId : defaultCandidateId,
    probeId: typeof raw.probeId === 'string' ? raw.probeId : '',
    regime: (typeof raw.regime === 'string' ? raw.regime : defaultRegime) as Regime,
    signalType: typeof raw.signalType === 'string' ? raw.signalType : 'user_provided',
    strength: (typeof raw.strength === 'string' ? raw.strength : 'moderate') as SignalPacket['strength'],
    evidence: Array.isArray(raw.evidence) ? filterStrings(raw.evidence as unknown[]) : [],
    negativeEvidence: Array.isArray(raw.negativeEvidence)
      ? filterStrings(raw.negativeEvidence as unknown[])
      : undefined,
    interpretation: typeof raw.interpretation === 'string' ? raw.interpretation : '',
    nextQuestions: Array.isArray(raw.nextQuestions) ? filterStrings(raw.nextQuestions as unknown[]) : [],
  };
}

function parseSignals(
  rawSignals: unknown[],
  defaultCandidateId: string,
  defaultRegime: Regime,
): SignalPacket[] {
  const signals: SignalPacket[] = [];
  for (const raw of rawSignals) {
    if (typeof raw === 'object' && raw !== null) {
      signals.push(parseSignalPacket(raw as Record<string, unknown>, defaultCandidateId, defaultRegime));
    }
  }
  return signals;
}

function parseConstraints(body: Record<string, unknown>): KillFilterConstraints {
  const constraints: KillFilterConstraints = {};
  if (Array.isArray(body.edgeProfile)) {
    constraints.edgeProfile = filterStrings(body.edgeProfile as unknown[]);
  }
  if (typeof body.timeHorizon === 'string') {
    const th = body.timeHorizon;
    if (th === 'short' || th === 'medium' || th === 'long') {
      constraints.timeHorizon = th;
    }
  }
  if (typeof body.maxSearchFriction === 'string') {
    const msf = body.maxSearchFriction;
    if (msf === 'low' || msf === 'medium' || msf === 'high') {
      constraints.maxSearchFriction = msf;
    }
  }
  return constraints;
}

function candidateToRealization(candidate: CandidateRow): RealizationCandidate {
  return {
    id: candidate.id,
    regime: candidate.regime,
    form: candidate.form as RealizationCandidate['form'],
    domain: candidate.domain ?? undefined,
    vehicle: candidate.vehicle ?? undefined,
    worldForm: candidate.worldForm as RealizationCandidate['worldForm'],
    description: candidate.description,
    whyThisCandidate: candidate.whyExists,
    assumptions: candidate.assumptions,
    probeReadinessHints: candidate.assumptions.length > 0
      ? candidate.assumptions.map((a) => `Validate: ${a}`)
      : ['Validate core assumptions'],
    timeToSignal: 'medium',
    notes: [],
  };
}

function buildCommitMemoFromSignals(
  candidateId: string,
  candidate: CandidateRow,
  signals: SignalPacket[],
  rationale: string[],
): CommitMemo {
  const verdict = signals.some((s) => s.strength === 'strong')
    ? 'commit' as const
    : 'hold' as const;

  return {
    candidateId,
    regime: candidate.regime,
    verdict,
    rationale,
    evidenceUsed: signals.flatMap((s) => s.evidence),
    unresolvedRisks: candidate.assumptions,
    whatForgeShouldBuild: [`Build ${candidate.form}: ${candidate.description}`],
    whatForgeMustNotBuild: [],
    recommendedNextStep: verdict === 'commit'
      ? ['Proceed to forge handoff']
      : ['Gather additional signals before committing'],
  };
}

function storeCommitMemo(
  sessionManager: DecisionSessionManager,
  sessionId: string,
  candidateId: string,
  memo: CommitMemo,
): void {
  sessionManager.addCommitMemo(sessionId, candidateId, {
    regime: memo.regime,
    verdict: memo.verdict,
    rationale: memo.rationale,
    evidenceUsed: memo.evidenceUsed,
    unresolvedRisks: memo.unresolvedRisks,
    recommendedNextStep: memo.recommendedNextStep,
    whatForgeShouldBuild: memo.whatForgeShouldBuild,
    whatForgeMustNotBuild: memo.whatForgeMustNotBuild,
  });
}

function advanceToCommitReview(sessionManager: DecisionSessionManager, sessionId: string): void {
  sessionManager.advanceStage(sessionId, 'probe-design');
  sessionManager.advanceStage(sessionId, 'probe-review');
  sessionManager.advanceStage(sessionId, 'commit-review');
}

/**
 * Build a synthetic CommitMemo for forge-fast-path.
 * When path certainty is high and all elements are fixed,
 * we skip space-build/evaluate and synthesize directly from fixed elements.
 */
function buildFastPathCommitMemo(session: DecisionSession): CommitMemo {
  return {
    candidateId: `fast-path-${session.id}`,
    regime: session.primaryRegime ?? 'economic',
    verdict: 'commit',
    rationale: ['Fast-path: all elements fixed, high certainty'],
    evidenceUsed: ['Path check fixed elements'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['Implement based on fixed elements from path check'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['Proceed to Forge implementation'],
  };
}

// ─── Route Factory ───

export function decisionRoutes(deps: DecisionDeps): Hono {
  const app = new Hono();

  // ─── POST /api/decisions/start ───
  // Create session + classify intent (1 LLM call)
  app.post('/api/decisions/start', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const userMessage = body.userMessage;

    if (!userMessage || typeof userMessage !== 'string') {
      return error(c, 'INVALID_INPUT', 'userMessage is required', 400);
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined;
    const userId = typeof body.userId === 'string' ? body.userId : undefined;
    const title = typeof body.title === 'string' ? body.title : undefined;

    // LLM call #1: classify intent
    const intentRoute = await classifyIntent(deps.llm, userMessage);

    // Create session
    const session = deps.sessionManager.createSession({ conversationId, userId, title });

    // Update session with intent route results
    deps.sessionManager.updateSession(session.id, {
      primaryRegime: intentRoute.primaryRegime,
      secondaryRegimes: intentRoute.secondaryRegimes ?? [],
      routingConfidence: intentRoute.confidence,
      keyUnknowns: intentRoute.keyUnknowns,
      currentSummary: userMessage,
    });

    return ok(c, { sessionId: session.id, intentRoute, stage: 'routing' }, 201);
  });

  // ─── POST /api/decisions/:id/reclassify ───
  // Re-classify after follow-up (1 LLM call)
  app.post('/api/decisions/:id/reclassify', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);
    if (session.stage !== 'routing') {
      return error(c, 'INVALID_STAGE', `Expected routing, got ${session.stage}`, 400);
    }

    const body: Record<string, unknown> = await c.req.json();
    const userMessage = body.userMessage;

    if (!userMessage || typeof userMessage !== 'string') {
      return error(c, 'INVALID_INPUT', 'userMessage is required', 400);
    }

    // Build context with previous route
    const context: ClassifyIntentContext = {};
    if (session.primaryRegime) {
      context.previousRoute = buildIntentRouteFromSession(session);
    }

    // LLM call #1: re-classify intent
    const intentRoute = await classifyIntent(deps.llm, userMessage, context);

    deps.sessionManager.updateSession(session.id, {
      primaryRegime: intentRoute.primaryRegime,
      secondaryRegimes: intentRoute.secondaryRegimes ?? [],
      routingConfidence: intentRoute.confidence,
      keyUnknowns: intentRoute.keyUnknowns,
      currentSummary: userMessage,
    });

    return ok(c, { sessionId: session.id, intentRoute, stage: 'routing' });
  });

  // ─── POST /api/decisions/:id/path-check ───
  // Assess path certainty (0 LLM calls — pure function)
  app.post('/api/decisions/:id/path-check', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);
    if (session.stage !== 'routing') {
      return error(c, 'INVALID_STAGE', `Expected routing, got ${session.stage}`, 400);
    }
    if (!session.primaryRegime) {
      return error(c, 'MISSING_REGIME', 'No primaryRegime set (run start first)', 400);
    }

    const body: Record<string, unknown> = await c.req.json();

    // Build PathCheckContext from request body
    const context: PathCheckContext = {};
    if (typeof body.domain === 'string') context.domain = body.domain;
    if (typeof body.form === 'string') context.form = body.form;
    if (typeof body.buyer === 'string') context.buyer = body.buyer;
    if (typeof body.loop === 'string') context.loop = body.loop;
    if (typeof body.buildTarget === 'string') context.buildTarget = body.buildTarget;
    if (Array.isArray(body.rawSignals)) {
      context.rawSignals = filterStrings(body.rawSignals as unknown[]);
    }

    const intentRoute = buildIntentRouteFromSession(session);
    const pathCheckResult = checkPath(intentRoute, context);

    deps.sessionManager.updateSession(session.id, {
      pathCertainty: pathCheckResult.certainty,
      routeDecision: pathCheckResult.route,
    });
    deps.sessionManager.advanceStage(session.id, 'path-check');

    return ok(c, { sessionId: session.id, pathCheckResult, stage: 'path-check' });
  });

  // ─── POST /api/decisions/:id/space-build ───
  // Generate + filter candidates (1 LLM call)
  app.post('/api/decisions/:id/space-build', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);
    if (session.stage !== 'path-check') {
      return error(c, 'INVALID_STAGE', `Expected path-check, got ${session.stage}`, 400);
    }
    if (!session.primaryRegime) {
      return error(c, 'MISSING_REGIME', 'No primaryRegime set', 400);
    }

    const body: Record<string, unknown> = await c.req.json();
    const userMessage = typeof body.userMessage === 'string'
      ? body.userMessage
      : session.currentSummary ?? '';

    const constraints = parseConstraints(body);
    const intentRoute = buildIntentRouteFromSession(session);

    const pathCheck: PathCheckResult = {
      certainty: session.pathCertainty ?? 'medium',
      route: session.routeDecision ?? 'space-builder',
      fixedElements: [],
      unresolvedElements: [],
      recommendedNextStep: '',
    };

    // LLM call #1: build space
    const candidates = await buildSpace(deps.llm, intentRoute, pathCheck, {
      userMessage,
      edgeProfile: constraints.edgeProfile,
    });

    // Pure filter: apply kill filters
    const { survivors, killed } = applyKillFilters(candidates, session.primaryRegime, constraints);

    // Store surviving candidates
    for (const candidate of survivors) {
      deps.sessionManager.addCandidate(session.id, {
        regime: candidate.regime,
        form: candidate.form,
        description: candidate.description,
        whyExists: candidate.whyThisCandidate,
        assumptions: candidate.assumptions,
        domain: candidate.domain,
        vehicle: candidate.vehicle,
        worldForm: candidate.worldForm,
      });
    }

    deps.sessionManager.advanceStage(session.id, 'space-building');

    return ok(c, {
      sessionId: session.id,
      candidates: survivors,
      killedCount: killed.length,
      stage: 'space-building',
    });
  });

  // ─── POST /api/decisions/:id/evaluate ───
  // Evaluate candidate (1 LLM call budget, currently pure for v0)
  app.post('/api/decisions/:id/evaluate', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);
    if (session.stage !== 'space-building') {
      return error(c, 'INVALID_STAGE', `Expected space-building, got ${session.stage}`, 400);
    }

    const body: Record<string, unknown> = await c.req.json();
    const candidateId = body.candidateId;
    if (!candidateId || typeof candidateId !== 'string') {
      return error(c, 'INVALID_INPUT', 'candidateId is required', 400);
    }

    const candidates = deps.sessionManager.getCandidates(session.id);
    const candidate = candidates.find((cd) => cd.id === candidateId);
    if (!candidate) {
      return error(c, 'NOT_FOUND', `Candidate ${candidateId} not found in session`, 404);
    }

    const realizationCandidate = candidateToRealization(candidate);
    if (!isProbeReady(realizationCandidate)) {
      return error(c, 'NOT_PROBE_READY', 'Candidate lacks required fields for probing', 400);
    }

    const probeableForm = packageProbe(realizationCandidate);
    const rawSignals = Array.isArray(body.signals) ? body.signals as unknown[] : [];
    const signals = parseSignals(rawSignals, candidateId, session.primaryRegime ?? 'economic');

    const commitMemo = buildCommitMemoFromSignals(
      candidateId,
      candidate,
      signals,
      probeableForm.hypothesis ? [probeableForm.hypothesis] : ['Evaluated based on available signals'],
    );

    storeCommitMemo(deps.sessionManager, session.id, candidateId, commitMemo);
    advanceToCommitReview(deps.sessionManager, session.id);

    return ok(c, { sessionId: session.id, commitMemo, stage: 'commit-review' });
  });

  // ─── POST /api/decisions/:id/retry-evaluate ───
  // Re-evaluate after hold verdict (1 LLM call budget, currently pure)
  app.post('/api/decisions/:id/retry-evaluate', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);
    if (session.stage !== 'commit-review') {
      return error(c, 'INVALID_STAGE', `Expected commit-review, got ${session.stage}`, 400);
    }

    const body: Record<string, unknown> = await c.req.json();
    const candidateId = body.candidateId;
    if (!candidateId || typeof candidateId !== 'string') {
      return error(c, 'INVALID_INPUT', 'candidateId is required', 400);
    }

    const rawSignals = Array.isArray(body.additionalSignals) ? body.additionalSignals as unknown[] : [];
    const additionalSignals = parseSignals(rawSignals, candidateId, session.primaryRegime ?? 'economic');

    // Reset to space-building, then re-advance
    deps.sessionManager.resetToStage(session.id, 'space-building');

    const candidates = deps.sessionManager.getCandidates(session.id);
    const candidate = candidates.find((cd) => cd.id === candidateId);
    if (!candidate) {
      return error(c, 'NOT_FOUND', `Candidate ${candidateId} not found in session`, 404);
    }

    const hasStrongSignal = additionalSignals.some((s) => s.strength === 'strong');
    const commitMemo = buildCommitMemoFromSignals(
      candidateId,
      candidate,
      additionalSignals,
      hasStrongSignal
        ? ['Strong signal received in retry evaluation']
        : ['Insufficient signal strength after retry'],
    );

    storeCommitMemo(deps.sessionManager, session.id, candidateId, commitMemo);
    advanceToCommitReview(deps.sessionManager, session.id);

    return ok(c, { sessionId: session.id, commitMemo, stage: 'commit-review' });
  });

  // ─── POST /api/decisions/:id/forge ───
  // Forge handoff (0 LLM calls). Requires confirmation (SETTLE-01).
  app.post('/api/decisions/:id/forge', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);

    const body: Record<string, unknown> = await c.req.json();

    // SETTLE-01: Forge requires explicit user confirmation
    if (body.confirmation !== true) {
      return error(c, 'CONFIRMATION_REQUIRED', 'Forge requires confirmation: true (CONTRACT SETTLE-01)', 400);
    }

    // Extract context fields from request body
    const workingDir = typeof body.workingDir === 'string' ? body.workingDir : undefined;
    const targetRepo = typeof body.targetRepo === 'string' ? body.targetRepo : undefined;

    // Fast-path: forge-fast-path at path-check stage
    if (session.routeDecision === 'forge-fast-path' && session.stage === 'path-check') {
      const syntheticMemo = buildFastPathCommitMemo(session);
      deps.sessionManager.fastPathToDone(session.id);

      // Build ForgeBuildRequest and dispatch to Karvi (graceful degradation)
      const forgeContext: ForgeHandoffContext = { sessionId: session.id, workingDir, targetRepo };
      const forgeBuildRequest = buildForgeBuildRequest(syntheticMemo, forgeContext);
      let forgeResult: { buildId: string; status: string; pipeline: string } | null = null;
      if (deps.karvi) {
        try {
          forgeResult = await deps.karvi.forgeBuild(forgeBuildRequest);

          // Record forge_dispatched event
          recordEddaEvent(deps.db, session.id, buildForgeDispatchedEvent(
            forgeResult.buildId,
            syntheticMemo.regime,
            syntheticMemo.whatForgeShouldBuild.length,
          ));

          // Record forge_completed event (fast-path dispatches synchronously)
          if (forgeResult.status === 'success' || forgeResult.status === 'partial' || forgeResult.status === 'running') {
            recordEddaEvent(deps.db, session.id, buildForgeCompletedEvent(
              forgeResult.buildId,
              syntheticMemo.regime,
              {},
            ));
          } else {
            recordEddaEvent(deps.db, session.id, buildForgeFailedEvent(
              forgeResult.buildId,
              syntheticMemo.regime,
              `Build status: ${forgeResult.status}`,
            ));
          }
        } catch (err) {
          console.error('[forge] karvi.forgeBuild failed (fast-path):', err);
        }
      }

      return ok(c, { sessionId: session.id, commitMemo: syntheticMemo, forgeBuildRequest, forgeResult, forgeReady: true, fastPath: true, stage: 'done' });
    }

    // Normal path: must be at commit-review stage
    if (session.stage !== 'commit-review') {
      return error(c, 'INVALID_STAGE', `Expected commit-review or fast-path, got ${session.stage}`, 400);
    }

    // Advance to done via remaining stages
    deps.sessionManager.advanceStage(session.id, 'spec-crystallization');
    deps.sessionManager.advanceStage(session.id, 'promotion-check');
    deps.sessionManager.advanceStage(session.id, 'done');
    deps.sessionManager.updateSession(session.id, { status: 'promoted' });

    return ok(c, { sessionId: session.id, forgeReady: true, fastPath: false, stage: 'done' });
  });

  // ─── POST /api/decisions/:id/forge-result ───
  // Record forge build result telemetry (0 LLM calls)
  app.post('/api/decisions/:id/forge-result', async (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);
    if (session.stage !== 'done') {
      return error(c, 'INVALID_STAGE', `Expected done, got ${session.stage}`, 400);
    }

    const body: Record<string, unknown> = await c.req.json();
    const parsed = ForgeBuildResultSchema.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', `Invalid ForgeBuildResult: ${parsed.error.message}`, 400);
    }

    const regime = session.primaryRegime ?? 'economic';
    // Override sessionId to match Volva's decision session (FK constraint)
    const resultWithSessionId = { ...parsed.data, sessionId: id };
    const outcome = consumeForgeResult(deps.db, resultWithSessionId, regime);

    // Record forge event based on outcome
    if (outcome.outcome === 'success' || outcome.outcome === 'partial') {
      recordEddaEvent(deps.db, id, buildForgeCompletedEvent(
        outcome.buildId,
        regime,
        {
          tokensUsed: parsed.data.telemetry.tokensUsed,
          costUsd: parsed.data.telemetry.costUsd,
          durationMs: parsed.data.durationMs,
          runtime: parsed.data.telemetry.runtime,
          model: parsed.data.telemetry.model,
          stepsExecuted: parsed.data.telemetry.stepsExecuted,
        },
        parsed.data.artifacts.length,
      ));
    } else {
      recordEddaEvent(deps.db, id, buildForgeFailedEvent(
        outcome.buildId,
        regime,
        `Build result: ${outcome.outcome}`,
        parsed.data.steps.filter((s) => s.status === 'success').length,
      ));
    }

    return ok(c, { sessionId: id, buildId: outcome.buildId, outcome: outcome.outcome });
  });

  // ─── GET /api/decisions ───
  // List sessions (0 LLM calls)
  app.get('/api/decisions', (c) => {
    const status = c.req.query('status');

    let query = 'SELECT * FROM decision_sessions';
    const params: string[] = [];

    if (status && ['active', 'paused', 'promoted', 'archived'].includes(status)) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY updated_at DESC';

    const rows = deps.db.query(query).all(...params) as Record<string, unknown>[];

    const sessions = rows.map((row) => ({
      id: row.id as string,
      title: row.title as string | null,
      primaryRegime: row.primary_regime as string | null,
      stage: row.stage as string,
      status: row.status as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));

    return ok(c, { sessions });
  });

  // ─── GET /api/decisions/:id ───
  // Get session detail (0 LLM calls)
  app.get('/api/decisions/:id', (c) => {
    const id = c.req.param('id');
    const session = deps.sessionManager.getSession(id);

    if (!session) return error(c, 'NOT_FOUND', 'Session not found', 404);

    const candidates = deps.sessionManager.getCandidates(session.id);

    return ok(c, { session, candidates });
  });

  return app;
}
