import type { SkillMetrics } from './telemetry';
import type { SkillObject } from '../schemas/skill-object';

// ─── Promotion Gate Evaluation ───

export interface GateResult {
  gate: string;
  passed: boolean;
  detail: string;
}

export interface PromotionResult {
  eligible: boolean;
  gates: GateResult[];
  blockers: string[];
}

export function evaluatePromotionGates(
  metrics: SkillMetrics,
  skillObject: SkillObject,
): PromotionResult {
  const gates: GateResult[] = [];
  const minSuccess =
    skillObject.telemetry?.thresholds.promotion_min_success ?? 3;

  // Gate 1: min_success — used successfully 3+ times
  const g1 = metrics.successCount >= minSuccess;
  gates.push({
    gate: 'min_success',
    passed: g1,
    detail: `${metrics.successCount}/${minSuccess} successful runs`,
  });

  // Gate 2: no_critical_gotchas — no gotchas with severity = critical
  // Gotchas are stored in package/gotchas.md and require manual review.
  // This gate always passes in code; human must verify during human_review gate.
  gates.push({
    gate: 'no_critical_gotchas',
    passed: true,
    detail: 'Requires manual review',
  });

  // Gate 3: trigger_boundary — both triggerWhen and doNotTriggerWhen non-empty
  const g3 =
    skillObject.routing.triggerWhen.length > 0 &&
    skillObject.routing.doNotTriggerWhen.length > 0;
  gates.push({
    gate: 'trigger_boundary',
    passed: g3,
    detail: `triggerWhen: ${skillObject.routing.triggerWhen.length}, doNotTriggerWhen: ${skillObject.routing.doNotTriggerWhen.length}`,
  });

  // Gate 4: verification_exists — smokeChecks has at least 1 item
  const g4 = skillObject.verification.smokeChecks.length > 0;
  gates.push({
    gate: 'verification_exists',
    passed: g4,
    detail: `smokeChecks: ${skillObject.verification.smokeChecks.length}`,
  });

  // Gate 5: human_review — always blocks until explicitly confirmed
  gates.push({
    gate: 'human_review',
    passed: false,
    detail: 'Requires explicit human approval',
  });

  const blockers = gates.filter((g) => !g.passed).map((g) => g.gate);
  return { eligible: blockers.length === 0, gates, blockers };
}

// ─── Retirement Check ───

export interface RetirementResult {
  shouldRetire: boolean;
  reason?: string;
}

export function checkRetirement(
  metrics: SkillMetrics,
  skillObject: SkillObject,
): RetirementResult {
  // Check 1: supersededBy has value
  if (skillObject.governance.supersession.supersededBy !== null) {
    return {
      shouldRetire: true,
      reason: `Superseded by ${skillObject.governance.supersession.supersededBy}`,
    };
  }

  // Check 2: idle >= 90 days (configurable via thresholds)
  const idleDays =
    skillObject.telemetry?.thresholds.retirement_idle_days ?? 90;
  if (metrics.lastUsedAt) {
    const daysSinceUse =
      (Date.now() - new Date(metrics.lastUsedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceUse >= idleDays) {
      return {
        shouldRetire: true,
        reason: `No usage for ${Math.floor(daysSinceUse)} days (threshold: ${idleDays})`,
      };
    }
  }

  return { shouldRetire: false };
}
