import { Hono } from 'hono';
import { z } from 'zod';
import { ok, error } from './response';
import { selectContainer, getConfidenceBehavior } from '../containers/router';
import { checkContainerTransition } from '../containers/transitions';
import type { SkillLookup } from '../skills/types';
import type { RoutingContext } from '../containers/types';
import { IntentType } from '../schemas/intent';

// ─── DI Interface ───

export interface ContainerDeps {
  skillLookup: SkillLookup;
}

// ─── Input Schemas ───

const ContainerEnum = z.enum(['world', 'shape', 'skill', 'task', 'review', 'harvest']);

const ContainerSelectInput = z.object({
  userMessage: z.string().min(1),
  intentType: IntentType.optional(),
  hasActiveWorld: z.boolean().optional(),
  conversationHistory: z.array(z.string()).optional(),
});

const ContainerTransitionInput = z.object({
  current: ContainerEnum,
  proposed: ContainerEnum,
  reason: z.string().min(1),
});

// ─── Route Factory ───

export function containerRoutes(deps: ContainerDeps): Hono {
  const app = new Hono();

  // ─── POST /api/containers/select ───
  // Container selection (0 LLM calls — keyword heuristics)
  app.post('/api/containers/select', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = ContainerSelectInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const ctx: RoutingContext = { userMessage: parsed.data.userMessage };

    if (parsed.data.intentType) {
      ctx.intentType = parsed.data.intentType;
    }
    if (parsed.data.hasActiveWorld !== undefined) {
      ctx.hasActiveWorld = parsed.data.hasActiveWorld;
    }
    if (parsed.data.conversationHistory) {
      ctx.conversationHistory = parsed.data.conversationHistory;
    }

    const selection = selectContainer(ctx, deps.skillLookup);
    const behavior = getConfidenceBehavior(selection);

    return ok(c, { selection, behavior });
  });

  // ─── POST /api/containers/transition ───
  // Validate container transition (0 LLM calls — pure function)
  app.post('/api/containers/transition', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = ContainerTransitionInput.safeParse(body);
    if (!parsed.success) {
      return error(c, 'INVALID_INPUT', parsed.error.issues[0].message, 400);
    }

    const result = checkContainerTransition(parsed.data.current, parsed.data.proposed, parsed.data.reason);
    return ok(c, result);
  });

  return app;
}
