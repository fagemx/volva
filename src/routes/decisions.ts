import { Hono } from 'hono';
import { z } from 'zod';
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
import {
  ForgeBuildResultSchema,
  KarviApiError,
  type ForgeBuildDispatchData,
} from '../karvi-client/schemas';
import { consumeForgeResult } from '../skills/telemetry-consumer';
import {
  RegimeEnum,
  type IntentRoute,
  type PathCheckResult,
  type RealizationCandidate,
  type CommitMemo,
  type SignalPacket,
  type Regime,
} from '../schemas/decision';

// ─── DI Interface ───

export interface DecisionDeps {
  db: Database;
  llm: LLMClient;
  sessionManager: DecisionSessionManager;
  karvi?: KarviClient;
}

// ─── Input Schemas ───

const StartDecisionInput = z.object({
  userMessage: z.string().min(1),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  title: z.string().optional(),
});

const ReclassifyInput = z.object({
  userMessage: z.string().min(1),
});

const PathCheckInput = z.object({
  domain: z.string().optional(),
  form: z.string().optional(),
  buyer: z.string().optional(),
  loop: z.string().optional(),
  buildTarget: z.string().optional(),
  rawSignals: z.array(z.string()).optional(),
});

const SpaceBuildInput = z.object({
  userMessage: z.string().optional(),
  edgeProfile: z.array(z.string()).optional(),
  timeHorizon: z.enum(['short', 'medium', 'long']).optional(),
  maxSearchFriction: z.enum(['low', 'medium', 'high']).optional(),
});

// Typed input schema for signal packets — context-derivable fields have defaults
const SignalPacketInputSchema = z.object({
  candidateId: z.string().default(''),
  probeId: z.string().default(''),
  regime: RegimeEnum.default('economic'),
  signalType: z.string().default('user_provided'),
  strength: z.enum(['weak', 'moderate', 'strong']).default('moderate'),
  evidence: z.array(z.string()).default([]),
  negativeEvidence: z.array(z.string()).optional(),
  interpretation: z.string().default(''),
  nextQuestions: z.array(z.string()).default([]),
});

const EvaluateInput = z.object({
  candidateId: z.string().min(1),
  signals: z.array(SignalPacketInputSchema).optional(),
});

const RetryEvaluateInput = z.object({
  candidateId: z.string().min(1),
  additionalSignals: z.array(SignalPacketInputSchema).optional(),
});

const ForgeInput = z.object({
  confirmation: z.literal(true),
  workingDir: z.string().optional(),
  targetRepo: z.string().optional(),
});

const DecisionStatusFilter = z.enum(['active', 'paused', 'promoted', 'archived']);

// ─── Helpers ───

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

type CommitMemoDraftRow = {
  candidate_id: string;
  regime: Regime;
  verdict: 'commit' | 'hold' | 'discard';
  rationale_json: string;
  evidence_used_json: string;
  unresolved_risks_json: string;
  recommended_next_step_json: string;
  what_forge_should_build_json: string;
  what_forge_must_not_build_json: string;
};

function getLatestCommitMemoDraft(db: Database, sessionId: string): CommitMemo | null {
  const row = db
    .query(
      `SELECT candidate_id, regime, verdict, rationale_json, evidence_used_json,
              unresolved_risks_json, recommended_next_step_json,
              what_forge_should_build_json, what_forge_must_not_build_json
       FROM commit_memo_drafts
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(sessionId) as CommitMemoDraftRow | null;

  if (!row) return null;
  if (row.verdict !== 'commit') return null;

  return {
    candidateId: row.candidate_id,
    regime: row.regime,
    verdict: 'commit',
    rationale: JSON.parse(row.rationale_json) as string[],
    evidenceUsed: JSON.parse(row.evidence_used_json) as string[],
    unresolvedRisks: JSON.parse(row.unresolved_risks_json) as string[],
    recommendedNextStep: JSON.parse(row.recommended_next_step_json) as string[],
    whatForgeShouldBuild: JSON.parse(row.what_forge_should_build_json) as string[],
    whatForgeMustNotBuild: JSON.parse(row.what_forge_must_not_build_json) as string[],
  };
}

// ─── Route Factory ───

export function decisionRoutes(deps: DecisionDeps): Hono {
  const app = new Hono();

  // ─── POST /api/decisions/start ───
  // Create session + classify intent (1 LLM call)
  app.post('/api/decisions/start', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = StartDecisionInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const { userMessage, conversationId, userId, title } = parsed.data;

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

    const body: unknown = await c.req.json();
    const parsed = ReclassifyInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const { userMessage } = parsed.data;

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

    const body: unknown = await c.req.json();
    const parsed = PathCheckInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    // Build PathCheckContext from validated data
    const context: PathCheckContext = {};
    if (parsed.data.domain) context.domain = parsed.data.domain;
    if (parsed.data.form) context.form = parsed.data.form;
    if (parsed.data.buyer) context.buyer = parsed.data.buyer;
    if (parsed.data.loop) context.loop = parsed.data.loop;
    if (parsed.data.buildTarget) context.buildTarget = parsed.data.buildTarget;
    if (parsed.data.rawSignals) context.rawSignals = parsed.data.rawSignals;

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

    const body: unknown = await c.req.json();
    const parsed = SpaceBuildInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const userMessage = parsed.data.userMessage ?? session.currentSummary ?? '';

    const constraints: KillFilterConstraints = {};
    if (parsed.data.edgeProfile) constraints.edgeProfile = parsed.data.edgeProfile;
    if (parsed.data.timeHorizon) constraints.timeHorizon = parsed.data.timeHorizon;
    if (parsed.data.maxSearchFriction) constraints.maxSearchFriction = parsed.data.maxSearchFriction;

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

    const body: unknown = await c.req.json();
    const parsed = EvaluateInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const { candidateId } = parsed.data;

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
    const signals: SignalPacket[] = (parsed.data.signals ?? []).map((s) => ({
      ...s,
      candidateId: s.candidateId || candidateId,
    }));

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

    const body: unknown = await c.req.json();
    const parsed = RetryEvaluateInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const { candidateId } = parsed.data;
    const additionalSignals: SignalPacket[] = (parsed.data.additionalSignals ?? []).map((s) => ({
      ...s,
      candidateId: s.candidateId || candidateId,
    }));

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

    const body: unknown = await c.req.json();

    // SETTLE-01: Forge requires explicit user confirmation
    const parsed = ForgeInput.safeParse(body);
    if (!parsed.success) {
      // Check if it's specifically a confirmation issue
      const isConfirmationIssue = parsed.error.issues.some(
        (issue) => issue.path.includes('confirmation'),
      );
      if (isConfirmationIssue) {
        return error(c, 'CONFIRMATION_REQUIRED', 'Forge requires confirmation: true (CONTRACT SETTLE-01)', 400);
      }
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    // Extract context fields from validated data
    const workingDir = parsed.data.workingDir;
    const targetRepo = parsed.data.targetRepo;

    // Fast-path: forge-fast-path at path-check stage
    if (session.routeDecision === 'forge-fast-path' && session.stage === 'path-check') {
      const syntheticMemo = buildFastPathCommitMemo(session);
      deps.sessionManager.fastPathToDone(session.id);

      // Build ForgeBuildRequest and dispatch to Karvi (graceful degradation)
      const forgeContext: ForgeHandoffContext = { sessionId: session.id, workingDir, targetRepo };
      const forgeBuildRequest = buildForgeBuildRequest(syntheticMemo, forgeContext);
      let forgeResult: ForgeBuildDispatchData | null = null;
      if (deps.karvi) {
        try {
          forgeResult = await deps.karvi.forgeBuild(forgeBuildRequest);
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

    const commitMemo = getLatestCommitMemoDraft(deps.db, session.id);
    if (!commitMemo) {
      return error(c, 'NOT_FOUND', 'No commit memo with verdict=commit found for this session', 404);
    }

    if (!deps.karvi) {
      return error(c, 'KARVI_UNAVAILABLE', 'Karvi client is not configured for forge dispatch', 503);
    }

    const forgeContext: ForgeHandoffContext = { sessionId: session.id, workingDir, targetRepo };
    const forgeBuildRequest = buildForgeBuildRequest(commitMemo, forgeContext);

    const forgeResult = await deps.karvi.forgeBuild(forgeBuildRequest).catch((err: unknown) => {
      if (err instanceof KarviApiError) {
        return { _error: true as const, code: err.code, message: err.message, status: 400 as const };
      }
      return { _error: true as const, code: 'KARVI_UNAVAILABLE', message: 'Failed to dispatch forge build to Karvi', status: 503 as const };
    });
    if ('_error' in forgeResult) {
      return error(c, forgeResult.code, forgeResult.message, forgeResult.status);
    }

    // Advance to done via remaining stages
    deps.sessionManager.advanceStage(session.id, 'spec-crystallization');
    deps.sessionManager.advanceStage(session.id, 'promotion-check');
    deps.sessionManager.advanceStage(session.id, 'done');
    deps.sessionManager.updateSession(session.id, { status: 'promoted' });

    return ok(c, {
      sessionId: session.id,
      commitMemo,
      forgeBuildRequest,
      forgeResult,
      forgeReady: true,
      fastPath: false,
      stage: 'done',
    });
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

    const body: unknown = await c.req.json();
    const parsed = ForgeBuildResultSchema.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', `Invalid ForgeBuildResult: ${parsed.error.message}`, 400);
    }

    const regime = session.primaryRegime ?? 'economic';
    // Override sessionId to match Volva's decision session (FK constraint)
    const resultWithSessionId = { ...parsed.data, sessionId: id };
    const outcome = consumeForgeResult(deps.db, resultWithSessionId, regime);

    return ok(c, { sessionId: id, buildId: outcome.buildId, outcome: outcome.outcome });
  });

  // ─── GET /api/decisions ───
  // List sessions (0 LLM calls)
  app.get('/api/decisions', (c) => {
    const status = c.req.query('status');

    let query = 'SELECT * FROM decision_sessions';
    const params: string[] = [];

    if (status) {
      const statusParsed = DecisionStatusFilter.safeParse(status);
      if (statusParsed.success) {
        query += ' WHERE status = ?';
        params.push(statusParsed.data);
      } else {
        return error(c, 'INVALID_INPUT', `Invalid status filter: ${status}. Must be one of: active, paused, promoted, archived`, 400);
      }
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
