import { Hono } from 'hono';
import { ok, error } from './response';
import { selectContainer, getConfidenceBehavior } from '../containers/router';
import { checkContainerTransition } from '../containers/transitions';
import type { SkillLookup } from '../skills/types';
import type { Container, RoutingContext } from '../containers/types';
import type { IntentType } from '../schemas/intent';

// ─── DI Interface ───

export interface ContainerDeps {
  skillLookup: SkillLookup;
}

// ─── Helpers ───

const VALID_CONTAINERS: Container[] = ['world', 'shape', 'skill', 'task', 'review', 'harvest'];

function isValidContainer(value: string): value is Container {
  return (VALID_CONTAINERS as string[]).includes(value);
}

// ─── Route Factory ───

export function containerRoutes(deps: ContainerDeps): Hono {
  const app = new Hono();

  // ─── POST /api/containers/select ───
  // Container selection (0 LLM calls — keyword heuristics)
  app.post('/api/containers/select', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const userMessage = body.userMessage;

    if (!userMessage || typeof userMessage !== 'string') {
      return error(c, 'INVALID_INPUT', 'userMessage is required', 400);
    }

    const ctx: RoutingContext = { userMessage };

    if (typeof body.intentType === 'string') {
      ctx.intentType = body.intentType as IntentType;
    }
    if (typeof body.hasActiveWorld === 'boolean') {
      ctx.hasActiveWorld = body.hasActiveWorld;
    }
    if (Array.isArray(body.conversationHistory)) {
      ctx.conversationHistory = (body.conversationHistory as unknown[])
        .filter((s): s is string => typeof s === 'string');
    }

    const selection = selectContainer(ctx, deps.skillLookup);
    const behavior = getConfidenceBehavior(selection);

    return ok(c, { selection, behavior });
  });

  // ─── POST /api/containers/transition ───
  // Validate container transition (0 LLM calls — pure function)
  app.post('/api/containers/transition', async (c) => {
    const body: Record<string, unknown> = await c.req.json();
    const current = body.current;
    const proposed = body.proposed;
    const reason = body.reason;

    if (!current || typeof current !== 'string') {
      return error(c, 'INVALID_INPUT', 'current container is required', 400);
    }
    if (!proposed || typeof proposed !== 'string') {
      return error(c, 'INVALID_INPUT', 'proposed container is required', 400);
    }
    if (!reason || typeof reason !== 'string') {
      return error(c, 'INVALID_INPUT', 'reason is required', 400);
    }

    if (!isValidContainer(current)) {
      return error(c, 'INVALID_INPUT', `Invalid container: ${current}`, 400);
    }
    if (!isValidContainer(proposed)) {
      return error(c, 'INVALID_INPUT', `Invalid container: ${proposed}`, 400);
    }

    const result = checkContainerTransition(current, proposed, reason);
    return ok(c, result);
  });

  return app;
}
