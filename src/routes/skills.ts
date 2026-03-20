import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import type { LLMClient } from '../llm/client';
import { SkillRegistry } from '../skills/registry';
import { matchSkills } from '../skills/trigger-matcher';
import { recordRun, getMetrics } from '../skills/telemetry';
import { evaluatePromotionGates } from '../skills/promotion';
import { capturePattern } from '../skills/harvest';
import { crystallize } from '../skills/crystallizer';
import { SkillStatusEnum } from '../schemas/skill-object';

// ─── DI Interface ───

export interface SkillDeps {
  db: Database;
  llm: LLMClient;
  registry: SkillRegistry;
}

// ─── Input Schemas ───

const SkillRunInput = z.object({
  outcome: z.enum(['success', 'failure', 'partial']).default('success'),
  durationMs: z.number().optional(),
  notes: z.string().optional(),
  conversationId: z.string().optional(),
});

const SkillMatchInput = z.object({
  context: z.string().min(1),
});

const SkillHarvestInput = z.object({
  context: z.string().min(1),
  history: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).min(1),
});

const SkillCrystallizeInput = z.object({
  confirmation: z.literal(true),
  candidate: z.object({
    name: z.string(),
    summary: z.string(),
    problemShapes: z.array(z.string()).default([]),
    desiredOutcomes: z.array(z.string()).default([]),
    nonGoals: z.array(z.string()).default([]),
    triggerWhen: z.array(z.string()).default([]),
    doNotTriggerWhen: z.array(z.string()).default([]),
    methodOutline: z.array(z.string()).default([]),
    observedGotchas: z.array(z.string()).default([]),
  }),
});

// ─── Route Factory ───

export function skillRoutes(deps: SkillDeps): Hono {
  const app = new Hono();

  // ─── GET /api/skills ───
  // List skills with optional filters (0 LLM calls)
  app.get('/api/skills', (c) => {
    const status = c.req.query('status');
    const domain = c.req.query('domain');
    const tags = c.req.query('tags');

    const filter: { minStatus?: z.infer<typeof SkillStatusEnum>; domain?: string; tags?: string[] } = {};

    if (status) {
      const statusParsed = SkillStatusEnum.safeParse(status);
      if (!statusParsed.success) {
        return error(c, 'INVALID_INPUT', `Invalid status filter: ${status}`, 400);
      }
      filter.minStatus = statusParsed.data;
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
    const body: unknown = await c.req.json();

    // Verify skill exists in registry
    const skillObject = deps.registry.get(skillId);
    if (!skillObject) {
      return error(c, 'NOT_FOUND', `Skill ${skillId} not found`, 404);
    }

    const parsed = SkillRunInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
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

    const runId = recordRun(deps.db, {
      skillInstanceId: instanceId,
      conversationId: parsed.data.conversationId,
      outcome: parsed.data.outcome,
      durationMs: parsed.data.durationMs,
      notes: parsed.data.notes,
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
    const body: unknown = await c.req.json();
    const parsed = SkillMatchInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const entries = deps.registry.list();
    const matches = matchSkills(parsed.data.context, entries);

    return ok(c, { matches });
  });

  // ─── POST /api/skills/harvest ───
  // Pattern capture step 1 of 2 (SETTLE-01: returns candidate for review)
  // 1 LLM call — NOT inside handleTurn, satisfies COND-02
  app.post('/api/skills/harvest', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = SkillHarvestInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const conversationHistory = parsed.data.history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const result = await capturePattern(deps.llm, conversationHistory, parsed.data.context);

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
    const body: unknown = await c.req.json();
    const parsed = SkillCrystallizeInput.safeParse(body);
    if (!parsed.success) {
      // Check if it's specifically a confirmation issue
      const isConfirmationIssue = parsed.error.issues.some(
        (issue) => issue.path.includes('confirmation'),
      );
      if (isConfirmationIssue) {
        return error(
          c,
          'CONFIRMATION_REQUIRED',
          'Crystallize requires confirmation: true (CONTRACT SETTLE-01)',
          400,
        );
      }
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const skillCandidate = parsed.data.candidate;

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
