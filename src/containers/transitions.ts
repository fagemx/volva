import type { Container } from './types';

export interface TransitionResult {
  allowed: boolean;
  newContainer: Container;
  reason: string;
}

export interface SpawnResult {
  parentWorld: string;
  childContainer: Container;
  childId: string;
  reason: string;
}

/**
 * Valid container transitions (replace current container).
 *
 * From spec Section 5:
 * - Shape  -> Skill, World, Task, Harvest
 * - Task   -> Harvest
 * - Skill  -> Review, Harvest
 * - Review -> Skill, Task, Harvest
 * - World  -> (no exit transitions, uses spawn)
 * - Harvest -> (terminal)
 */
const VALID_TRANSITIONS: Record<string, Container[]> = {
  shape: ['skill', 'world', 'task', 'harvest'],
  task: ['harvest'],
  skill: ['review', 'harvest'],
  review: ['skill', 'task', 'harvest'],
  // world and harvest have no exit transitions
};

/**
 * Containers that World can spawn. World cannot spawn World (no recursion in v0).
 */
const SPAWNABLE_CONTAINERS: Container[] = ['shape', 'task', 'skill', 'review', 'harvest'];

/**
 * Check whether a container transition from `current` to `proposed` is allowed.
 *
 * Same-container "transition" is always allowed (no-op).
 * World has no exit transitions; Harvest is terminal.
 */
export function checkContainerTransition(
  current: Container,
  proposed: Container,
  reason: string,
): TransitionResult {
  if (current === proposed) {
    return { allowed: true, newContainer: current, reason: 'No transition needed' };
  }
  const valid = VALID_TRANSITIONS[current] ?? [];
  if (valid.includes(proposed)) {
    return { allowed: true, newContainer: proposed, reason };
  }
  return {
    allowed: false,
    newContainer: current,
    reason: `Transition ${current} \u2192 ${proposed} not allowed`,
  };
}

/**
 * Spawn a child container from a World.
 *
 * World is a persistent environment that spawns child containers instead of
 * transitioning. Cannot spawn World (no recursive worlds in v0).
 *
 * Returns null if the child container type is not spawnable.
 */
export function spawnFromWorld(
  worldId: string,
  childContainer: Container,
  reason: string,
): SpawnResult | null {
  if (!SPAWNABLE_CONTAINERS.includes(childContainer)) {
    return null;
  }
  return {
    parentWorld: worldId,
    childContainer,
    childId: `${worldId}:${childContainer}:${Date.now()}`,
    reason,
  };
}
