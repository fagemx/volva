import type { ContainerSelection, ConfidenceBehavior, Container, RoutingContext } from './types';
import type { SkillLookup } from '../skills/types';
import { detectPosture } from './posture';

const WORLD_KEYWORDS = /\b(long-term|project|workspace|world)\b/i;
const SECONDARY_HARVEST = /then\s+(capture|save|make.*reusable|skill)/i;
const SECONDARY_REVIEW = /then\s+(review|check|investigate)/i;

/**
 * 6-gate sequential container routing protocol.
 *
 * Gates execute in order; the first match wins.
 * No LLM call — uses keyword heuristics via detectPosture().
 */
export function selectContainer(
  ctx: RoutingContext,
  skillLookup: SkillLookup,
): ContainerSelection {
  // Gate 1: World detection — persistent long-term domain
  if (ctx.hasActiveWorld || WORLD_KEYWORDS.test(ctx.userMessage)) {
    return withSecondary(ctx.userMessage, {
      primary: 'world',
      confidence: 'high',
      rationale: 'Long-term domain detected',
    });
  }

  const posture = detectPosture(ctx);

  // Gate 2: Path clarity — explore posture → shape
  if (posture === 'explore') {
    return withSecondary(ctx.userMessage, {
      primary: 'shape',
      confidence: 'medium',
      rationale: 'Path unclear, entering Shape',
    });
  }

  // Gate 3: Inspect detection — inspect posture → review
  if (posture === 'inspect') {
    return withSecondary(ctx.userMessage, {
      primary: 'review',
      confidence: 'medium',
      rationale: 'Investigation posture detected',
    });
  }

  // Gate 4: Skill lookup — matching skill exists → skill
  if (posture === 'act') {
    const matches = skillLookup.findMatching(ctx.userMessage);
    if (matches.length > 0) {
      const best = matches[0];
      return withSecondary(ctx.userMessage, {
        primary: 'skill',
        confidence: best.confidence,
        rationale: `Matched skill: ${best.skillId} (triggers: ${best.matchedTriggers.join(', ')})`,
        skillId: best.skillId,
      });
    }
  }

  // Gate 5: Bounded work — act posture + no skill → task
  if (posture === 'act') {
    return withSecondary(ctx.userMessage, {
      primary: 'task',
      confidence: 'medium',
      rationale: 'Bounded work, no matching skill',
    });
  }

  // Gate 6: Harvest pattern — remaining posture is harvest
  // (explore → Gate 2, inspect → Gate 3, act → Gates 4/5, leaving harvest)
  return {
    primary: 'harvest',
    confidence: 'medium',
    rationale: 'User wants to capture pattern',
  };
}

/**
 * Detect secondary container from tail patterns in user message.
 * E.g., "Deploy checkout-service, then capture the flow as a skill"
 * → primary from gates, secondary: 'harvest'
 */
function detectSecondary(msg: string, primary: Container): Container | undefined {
  if (primary === 'harvest') return undefined;
  if (SECONDARY_HARVEST.test(msg)) return 'harvest';
  if (primary !== 'review' && SECONDARY_REVIEW.test(msg)) return 'review';
  return undefined;
}

function withSecondary(msg: string, selection: ContainerSelection): ContainerSelection {
  const secondary = detectSecondary(msg, selection.primary);
  if (secondary) {
    return { ...selection, secondary };
  }
  return selection;
}

/**
 * Map confidence level to routing behavior.
 *
 * - high   → proceed silently
 * - medium → proceed with rationale shown
 * - low    → fallback to Shape, ask clarification
 */
export function getConfidenceBehavior(selection: ContainerSelection): ConfidenceBehavior {
  switch (selection.confidence) {
    case 'high':
      return 'proceed';
    case 'medium':
      return 'showRationale';
    case 'low':
      return 'askClarification';
  }
}
