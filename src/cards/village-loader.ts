import type { VillageData, ActiveConstitutionData, ChiefData } from '../thyra-client/schemas';
import type { WorldCard } from '../schemas/card';

/**
 * Maps existing Thyra village data into a pre-populated WorldCard.
 * Pure function — no side effects, no imports from llm/, conductor/, or settlement/.
 */
export function loadVillageState(
  village: VillageData,
  constitution: ActiveConstitutionData,
  chiefs: ChiefData[],
): WorldCard {
  const hardRules = constitution.rules
    .filter((r) => r.enforcement === 'hard')
    .map((r) => ({ description: `[existing] ${r.description}`, scope: r.scope }));

  const softRules = constitution.rules
    .filter((r) => r.enforcement === 'soft')
    .map((r) => ({ description: `[existing] ${r.description}`, scope: r.scope }));

  const firstChief = chiefs.length > 0 ? chiefs[0] : null;
  const chiefDraft = firstChief
    ? {
        name: firstChief.name,
        role: firstChief.role ?? null,
        style: firstChief.personality ?? null,
      }
    : null;

  const budgetDraft = constitution.budget_limits
    ? {
        per_action: constitution.budget_limits.max_cost_per_action,
        per_day: constitution.budget_limits.max_cost_per_day,
      }
    : null;

  return {
    goal: `Modify: ${village.name}`,
    target_repo: village.target_repo,
    confirmed: {
      hard_rules: hardRules,
      soft_rules: softRules,
      must_have: [],
      success_criteria: [],
      evaluator_rules: [],
    },
    pending: [],
    chief_draft: chiefDraft,
    budget_draft: budgetDraft,
    llm_preset: null,
    current_proposal: null,
    version: 1,
  };
}
