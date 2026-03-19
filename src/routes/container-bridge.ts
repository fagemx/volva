import type { Container, ContainerSelection, RoutingContext } from '../containers/types';
import type { SkillLookup, SkillObjectLookup } from '../skills/types';
import type { ConversationMode } from '../schemas/conversation';
import { selectContainer, getConfidenceBehavior } from '../containers/router';

// ─── Types ───

export interface ContainerContext {
  selection: ContainerSelection;
  behavior: 'proceed' | 'showRationale' | 'askClarification';
  mappedMode: ConversationMode;
  redirectToDecisionPipeline: boolean;
}

// ─── Container → ConversationMode Mapping ───

const CONTAINER_MODE_MAP: Record<Container, ConversationMode> = {
  world: 'world_design',
  shape: 'world_design',
  skill: 'task',
  task: 'task',
  review: 'task',
  harvest: 'task',
};

/**
 * Map a container to an existing ConversationMode.
 * If currentMode is already set and valid, pass through unchanged
 * for containers that don't force a specific mode.
 */
export function containerToConversationMode(
  container: Container,
  currentMode?: ConversationMode,
): ConversationMode {
  if (currentMode && container !== 'world' && container !== 'shape') {
    return currentMode;
  }
  return CONTAINER_MODE_MAP[container];
}

// ─── Bypass Check ───

const BYPASS_MODES: Set<ConversationMode> = new Set(['world_management']);

/**
 * Some modes bypass container routing entirely.
 * world_management is a legacy mode that goes directly to conductor.
 */
export function shouldBypassContainerRouting(mode: ConversationMode): boolean {
  return BYPASS_MODES.has(mode);
}

// ─── Karvi Dispatch Check ───

/**
 * Check if a skill container selection should dispatch to Karvi
 * instead of executing locally.
 *
 * Returns true when:
 * - primary container is 'skill'
 * - skillId is present in selection
 * - skill object exists and has dispatch.mode === 'karvi'
 */
export function shouldDispatchToKarvi(
  selection: ContainerSelection,
  skillObjectLookup: SkillObjectLookup,
): boolean {
  if (selection.primary !== 'skill' || !selection.skillId) return false;
  const obj = skillObjectLookup.getSkillObject(selection.skillId);
  if (!obj) return false;
  return obj.dispatch.mode === 'karvi';
}

// ─── Main Bridge Function ───

/**
 * Resolve container selection and map to conductor context.
 *
 * This is the bridge between the container router (L1) and the
 * existing conductor (turn-handler). Placed in routes/ (assembly layer)
 * to comply with ARCH-02.
 *
 * When Shape container is selected, sets redirectToDecisionPipeline = true
 * so the route layer can redirect to POST /api/decisions/start instead
 * of entering the normal conductor flow.
 */
export function resolveContainer(
  ctx: RoutingContext,
  skillLookup: SkillLookup,
  currentMode?: ConversationMode,
): ContainerContext {
  const selection = selectContainer(ctx, skillLookup);
  const behavior = getConfidenceBehavior(selection);
  const mappedMode = containerToConversationMode(selection.primary, currentMode);

  // Shape container delegates to world-design decision pipeline
  const redirectToDecisionPipeline = selection.primary === 'shape';

  return {
    selection,
    behavior,
    mappedMode,
    redirectToDecisionPipeline,
  };
}
