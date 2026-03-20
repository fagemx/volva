import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from 'bun:sqlite';
import { ok, error } from './response';
import { dispatchToKarvi, resubmitWithApproval } from './skill-dispatcher';
import type { SkillDispatchContext, DispatchDeps } from './skill-dispatcher';
import type { SkillObjectLookup } from '../skills/types';
import type { KarviClient } from '../karvi-client/client';
import {
  buildApprovalRequestedEvent,
  buildApprovalGrantedEvent,
  buildApprovalDeniedEvent,
  buildApprovalExpiredEvent,
  recordEddaEventWithConversation,
} from '../decision/edda-events';

// ─── Constants ───

const APPROVAL_TTL_MS = 30 * 60 * 1000; // 30 minutes (R2)

// ─── DI Interface ───

export interface ApprovalDeps {
  db: Database;
  skillObjectLookup: SkillObjectLookup;
  karviClient: KarviClient;
  readSkillContent?: (skillFilePath: string) => string;
  dispatchOverlay?: Record<string, unknown>;
}

// ─── Input Schemas ───

const DispatchInputSchema = z.object({
  skillId: z.string().min(1),
  conversationId: z.string().optional(),
  sessionId: z.string().optional(),
  userMessage: z.string().min(1),
  workingDir: z.string().optional(),
  inputs: z.record(z.string()).default({}),
});

const ApproveInputSchema = z.object({
  pendingId: z.string().min(1),
  approvedBy: z.string().optional(),
});

const DenyInputSchema = z.object({
  pendingId: z.string().min(1),
});

// ─── Route Factory ───

export function approvalRoutes(deps: ApprovalDeps): Hono {
  const app = new Hono();

  const dispatchDeps: DispatchDeps = {
    skillObjectLookup: deps.skillObjectLookup,
    karviClient: deps.karviClient,
    db: deps.db,
    readSkillContent: deps.readSkillContent,
    dispatchOverlay: deps.dispatchOverlay,
  };

  // ─── POST /api/dispatch ───
  app.post('/api/dispatch', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = DispatchInputSchema.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const ctx: SkillDispatchContext = {
      skillId: parsed.data.skillId,
      conversationId: parsed.data.conversationId,
      sessionId: parsed.data.sessionId,
      userMessage: parsed.data.userMessage,
      workingDir: parsed.data.workingDir,
      inputs: parsed.data.inputs,
    };

    const outcome = await dispatchToKarvi(ctx, dispatchDeps);

    if (outcome.type === 'dispatched') {
      return ok(c, { type: 'dispatched' as const, result: outcome.result });
    }

    if (outcome.type === 'approval_required') {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS).toISOString();

      recordEddaEventWithConversation(
        deps.db,
        ctx.sessionId,
        ctx.conversationId,
        buildApprovalRequestedEvent(outcome.pendingId, outcome.skillName, outcome.permissions),
      );

      // Persist audit row
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      deps.db.run(
        `INSERT INTO approval_audits
         (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          auditId,
          outcome.pendingId,
          ctx.skillId,
          outcome.skillName,
          outcome.executionMode,
          JSON.stringify(outcome.permissions),
          outcome.sideEffects ? 1 : 0,
          JSON.stringify(ctx),
        ],
      );

      // Look up skill object for version + timeout info
      const skillObj = deps.skillObjectLookup.getSkillObject(ctx.skillId);

      return ok(c, {
        type: 'approval_required' as const,
        pendingId: outcome.pendingId,
        presentation: {
          skillName: outcome.skillName,
          skillVersion: skillObj?.version ?? 'unknown',
          permissions: outcome.permissions,
          externalSideEffects: outcome.sideEffects,
          executionMode: outcome.executionMode,
          estimatedTimeout: skillObj
            ? `${skillObj.dispatch.executionPolicy.timeoutMinutes} minutes`
            : 'unknown',
        },
        expiresAt,
      });
    }

    // fallback_local
    return ok(c, { type: 'fallback_local' as const, reason: outcome.reason });
  });

  // ─── POST /api/dispatch/approve ───
  app.post('/api/dispatch/approve', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = ApproveInputSchema.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const { pendingId, approvedBy } = parsed.data;

    // Look up pending audit
    const row = deps.db
      .query("SELECT * FROM approval_audits WHERE pending_id = ? AND decision = 'pending'")
      .get(pendingId) as Record<string, unknown> | null;

    if (!row) {
      return error(c, 'NOT_FOUND', `No pending approval found for id: ${pendingId}`, 404);
    }

    // Check TTL
    const createdAt = new Date(row.created_at as string);
    const elapsed = Date.now() - createdAt.getTime();
    if (elapsed > APPROVAL_TTL_MS) {
      deps.db.run(
        "UPDATE approval_audits SET decision = 'expired', decided_at = datetime('now') WHERE id = ?",
        [row.id as string],
      );

      const ctxFromAudit = JSON.parse(row.dispatch_context_json as string) as SkillDispatchContext;
      recordEddaEventWithConversation(
        deps.db,
        ctxFromAudit.sessionId,
        ctxFromAudit.conversationId,
        buildApprovalExpiredEvent(pendingId),
      );

      return error(c, 'APPROVAL_EXPIRED', 'Approval token has expired (30 minute TTL exceeded)', 410);
    }

    // Build approval token
    const now = new Date().toISOString();
    const approvalToken = {
      pendingId,
      approvedBy: approvedBy ?? 'human',
      approvedAt: now,
    };

    // Reconstruct dispatch context
    const ctx = JSON.parse(row.dispatch_context_json as string) as SkillDispatchContext;

    // Re-submit with approval
    const outcome = await resubmitWithApproval(ctx, approvalToken, dispatchDeps);

    // Update audit
    deps.db.run(
      "UPDATE approval_audits SET decision = 'approved', decided_by = ?, decided_at = ? WHERE id = ?",
      [approvalToken.approvedBy, now, row.id as string],
    );

    recordEddaEventWithConversation(
      deps.db,
      ctx.sessionId,
      ctx.conversationId,
      buildApprovalGrantedEvent(pendingId, approvalToken.approvedBy),
    );

    if (outcome.type === 'dispatched') {
      return ok(c, { type: 'dispatched' as const, result: outcome.result });
    }

    // fallback_local on resubmit
    return ok(c, { type: 'fallback_local' as const, reason: outcome.type === 'fallback_local' ? outcome.reason : 'Unexpected outcome' });
  });

  // ─── POST /api/dispatch/deny ───
  app.post('/api/dispatch/deny', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = DenyInputSchema.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const { pendingId } = parsed.data;

    // Look up pending audit
    const row = deps.db
      .query("SELECT * FROM approval_audits WHERE pending_id = ? AND decision = 'pending'")
      .get(pendingId) as Record<string, unknown> | null;

    if (!row) {
      return error(c, 'NOT_FOUND', `No pending approval found for id: ${pendingId}`, 404);
    }

    // Record denial
    deps.db.run(
      "UPDATE approval_audits SET decision = 'denied', decided_at = datetime('now') WHERE id = ?",
      [row.id as string],
    );

    const ctxFromAudit = JSON.parse(row.dispatch_context_json as string) as SkillDispatchContext;
    recordEddaEventWithConversation(
      deps.db,
      ctxFromAudit.sessionId,
      ctxFromAudit.conversationId,
      buildApprovalDeniedEvent(pendingId),
    );

    return ok(c, { denied: true, pendingId });
  });

  return app;
}
