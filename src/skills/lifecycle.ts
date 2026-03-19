import type { LifecycleStage } from '../schemas/skill-object';

const STAGE_ORDER: LifecycleStage[] = [
  'capture',
  'crystallize',
  'package',
  'route',
  'execute',
  'verify',
  'learn',
  'govern',
];

/**
 * Validates whether a stage transition is allowed.
 *
 * Rules:
 * - Linear forward progression (next stage only)
 * - Cyclic loop: execute -> verify -> learn -> execute (stages 5-7)
 * - Govern -> execute re-entry (after governance review)
 * - All other transitions rejected
 */
export function advanceStage(
  current: LifecycleStage,
  target: LifecycleStage,
): { allowed: boolean; reason: string } {
  const currentIdx = STAGE_ORDER.indexOf(current);
  const targetIdx = STAGE_ORDER.indexOf(target);

  // Forward progression: next stage in order
  if (targetIdx === currentIdx + 1) {
    return { allowed: true, reason: `Advanced from ${current} to ${target}` };
  }

  // Cyclic: learn -> execute (re-enter execution loop)
  if (current === 'learn' && target === 'execute') {
    return { allowed: true, reason: 'Cyclic: re-entering execute from learn' };
  }

  // Govern -> execute (re-entry after governance review)
  if (current === 'govern' && target === 'execute') {
    return {
      allowed: true,
      reason: 'Re-entering execute after governance',
    };
  }

  return {
    allowed: false,
    reason: `Cannot transition from ${current} to ${target}`,
  };
}
