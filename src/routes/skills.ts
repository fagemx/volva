import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { LLMClient } from '../llm/client';
import { SkillRegistry } from '../skills/registry';
import { matchSkills } from '../skills/trigger-matcher';
import { recordRun, getMetrics } from '../skills/telemetry';
import { evaluatePromotionGates } from '../skills/promotion';
import { capturePattern } from '../skills/harvest';
import { crystallize } from '../skills/crystallizer';
import type { SkillStatus } from '../schemas/skill-object';

// ─── DI Interface ───

export interface SkillDeps {
  db: Database;
  llm: LLMClient;
  registry: SkillRegistry;
}

// ─── Route Factory ───

export function skillRoutes(deps: SkillDeps): Hono {
  const app = new Hono();

  // ─── GET /api/skills ───
  // List skills with optional filters (0 LLM calls)
  app.get('/api/skills', (c) => {
    const status = c.req.query('status');
    const domain = c.req.query('domain');
    const tags = c.req.query('tags');

    const filter: { minStatus?: SkillStatus; domain?: string; tags?: string[] } = {};

    if (status) {
      const validStatuses: SkillStatus[] = ['draft', 'sandbox', 'promoted', 'core', 'deprecated', 'superseded'];
      if (!validStatuses.includes(status as SkillStatus)) {
        return error(c, 'INVALID_INPUT', `Invalid status filter: ${status}`, 400);
      }
      filter.minStatus = status as SkillStatus;
    }

    if (domain) {
      filter.domain = domain;
    }

    if (tags) {
      filter.tags = tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    }

    const entries = deps.registry.list(filter);
    const skills = entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      status: entry.status,
      priority: entry.priority,
      domain: entry.skillObject.identity.domain,
      tags: entry.skillObject.identity.tags,
      maturity: entry.skillObject.identity.maturity,
    }));

    return ok(c, { skills, total: skills.length });
  });

  // ─── GET /api/skills/:id ───
  // Get skill detail (0 LLM calls)
  app.get('/api/skills/:id', (c) => {
    const id = c.req.param('id');
    const skillObject = deps.registry.get(id);

    if (!skillObject) {
      return error(c, 'NOT_FOUND', `Skill ${id} not found`, 404);
    }

    return ok(c, { skill: skillObject });
  });

  // ─── POST /api/skills/:id/run ───
  // Record a skill run (telemetry) (0 LLM calls)
  app.post('/api/skills/:id/run', async (c) => {
    const skillId = c.req.param('id');
    const body: Record<string, unknown> = await c.req.json();

    // Verify skill exists in registry
    const skillObject = deps.registry.get(skillId);
    if (!skillObject) {
      return error(c, 'NOT_FOUND', `Skill ${skillId} not found`, 404);
    }

    // Look up or create skill_instance row
    const instanceRow = deps.db
      .query('SELECT id FROM skill_instances WHERE skill_id = ?')
      .get(skillId) as Record<string, unknown> | null;

    let instanceId: string;
    if (instanceRow) {
      instanceId = instanceRow.id as string;
    } else {
      instanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      deps.db.run(
        'INSERT INTO skill_instances (id, skill_id, name, status, current_stage) VALUES (?, ?, ?, ?, ?)',
        [instanceId, skillId, skillObject.name, skillObject.status, skillObject.lifecycle?.currentStage ?? 'capture'],
      );
    }

    const outcome = typeof body.outcome === 'string' ? body.outcome : 'success';
    const validOutcomes = ['success', 'failure', 'partial'];
    if (!validOutcomes.includes(outcome)) {
      return error(c, 'INVALID_INPUT', `Invalid outcome: ${outcome}`, 400);
    }

    const durationMs = typeof body.durationMs === 'number' ? body.durationMs : undefined;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined;

    const runId = recordRun(deps.db, {
      skillInstanceId: instanceId,
      conversationId,
      outcome: outcome as 'success' | 'failure' | 'partial',
      durationMs,
      notes,
    });

    return ok(c, { runId, skillId, instanceId }, 201);
  });

  // ─── GET /api/skills/:id/promotion ───
  // Evaluate promotion gates (0 LLM calls)
  app.get('/api/skills/:id/promotion', (c) => {
    const skillId = c.req.param('id');
    const skillObject = deps.registry.get(skillId);

    if (!skillObject) {
      return error(c, 'NOT_FOUND', `Skill ${skillId} not found`, 404);
    }

    // Look up skill instance for metrics
    const instanceRow = deps.db
      .query('SELECT id FROM skill_instances WHERE skill_id = ?')
      .get(skillId) as Record<string, unknown> | null;

    if (!instanceRow) {
      return ok(c, {
        eligible: false,
        gates: [],
        blockers: ['no_runs'],
        message: 'No recorded runs for this skill',
      });
    }

    const metrics = getMetrics(deps.db, instanceRow.id as string);
    if (!metrics) {
      return ok(c, {
        eligible: false,
        gates: [],
        blockers: ['no_metrics'],
        message: 'No metrics available',
      });
    }

    const result = evaluatePromotionGates(metrics, skillObject);
    return ok(c, result);
  });

  // ─── POST /api/skills/match ───
  // Trigger matching against context (0 LLM calls)
  app.post('/api/skills/match', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const context = body.context;

    if (!context || typeof context !== 'string') {
      return error(c, 'INVALID_INPUT', 'context is required', 400);
    }

    const entries = deps.registry.list();
    const matches = matchSkills(context, entries);

    return ok(c, { matches });
  });

  // ─── POST /api/skills/harvest ───
  // Pattern capture step 1 of 2 (SETTLE-01: returns candidate for review)
  // 1 LLM call — NOT inside handleTurn, satisfies COND-02
  app.post('/api/skills/harvest', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const context = body.context;
    const history = body.history;

    if (!context || typeof context !== 'string') {
      return error(c, 'INVALID_INPUT', 'context is required', 400);
    }

    if (!Array.isArray(history) || history.length === 0) {
      return error(c, 'INVALID_INPUT', 'history is required (non-empty array of {role, content})', 400);
    }

    const conversationHistory = history
      .filter(
        (msg): msg is { role: string; content: string } =>
          typeof msg === 'object' &&
          msg !== null &&
          typeof (msg as Record<string, unknown>).role === 'string' &&
          typeof (msg as Record<string, unknown>).content === 'string',
      )
      .map((msg) => ({ role: msg.role, content: msg.content }));

    if (conversationHistory.length === 0) {
      return error(c, 'INVALID_INPUT', 'history must contain messages with role and content', 400);
    }

    const result = await capturePattern(deps.llm, conversationHistory, context);

    if (!result.ok) {
      return error(c, 'LLM_ERROR', result.error, 500);
    }

    // SETTLE-01: Return candidate for user review, do NOT auto-crystallize
    return ok(c, {
      candidate: result.data,
      awaitConfirmation: true,
      message: 'Review the captured pattern. POST /api/skills/crystallize with the candidate to finalize.',
    });
  });

  // ─── POST /api/skills/crystallize ───
  // Crystallize candidate step 2 of 2 (SETTLE-01: requires confirmation)
  // 0 LLM calls — pure function
  app.post('/api/skills/crystallize', async (c) => {
    const body: Record<string, unknown> = await c.req.json();

    // SETTLE-01: requires explicit confirmation
    if (body.confirmation !== true) {
      return error(
        c,
        'CONFIRMATION_REQUIRED',
        'Crystallize requires confirmation: true (CONTRACT SETTLE-01)',
        400,
      );
    }

    const candidate = body.candidate;
    if (!candidate || typeof candidate !== 'object') {
      return error(c, 'INVALID_INPUT', 'candidate is required', 400);
    }

    const candidateRecord = candidate as Record<string, unknown>;

    // Validate required fields
    const name = candidateRecord.name;
    const summary = candidateRecord.summary;
    if (typeof name !== 'string' || typeof summary !== 'string') {
      return error(c, 'INVALID_INPUT', 'candidate must have name and summary', 400);
    }

    const skillCandidate = {
      name,
      summary,
      problemShapes: Array.isArray(candidateRecord.problemShapes)
        ? (candidateRecord.problemShapes as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      desiredOutcomes: Array.isArray(candidateRecord.desiredOutcomes)
        ? (candidateRecord.desiredOutcomes as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      nonGoals: Array.isArray(candidateRecord.nonGoals)
        ? (candidateRecord.nonGoals as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      triggerWhen: Array.isArray(candidateRecord.triggerWhen)
        ? (candidateRecord.triggerWhen as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      doNotTriggerWhen: Array.isArray(candidateRecord.doNotTriggerWhen)
        ? (candidateRecord.doNotTriggerWhen as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      methodOutline: Array.isArray(candidateRecord.methodOutline)
        ? (candidateRecord.methodOutline as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
      observedGotchas: Array.isArray(candidateRecord.observedGotchas)
        ? (candidateRecord.observedGotchas as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
    };

    try {
      const result = crystallize(skillCandidate);
      return ok(c, {
        skillObject: result.skillObject,
        yaml: result.yaml,
        skillMd: result.skillMd,
      }, 201);
    } catch (err) {
      return error(
        c,
        'CRYSTALLIZE_ERROR',
        err instanceof Error ? err.message : 'Crystallization failed',
        500,
      );
    }
  });

  return app;
}
