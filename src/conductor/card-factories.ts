import type { WorldCard, WorkflowCard, TaskCard, PipelineCard, AdapterCard, CommerceCard, OrgCard, AnyCard, CardType } from '../schemas/card';
import type { ConversationMode } from '../schemas/conversation';

// ─── Empty Card Factories ───

export function createEmptyWorldCard(): WorldCard {
  return {
    goal: null,
    target_repo: null,
    confirmed: { hard_rules: [], soft_rules: [], must_have: [], success_criteria: [], evaluator_rules: [] },
    pending: [],
    chief_draft: null,
    budget_draft: null,
    llm_preset: null,
    current_proposal: null,
    version: 1,
  };
}

export function createEmptyWorkflowCard(): WorkflowCard {
  return {
    name: null,
    purpose: null,
    steps: [],
    confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
    pending: [],
    version: 1,
  };
}

export function createEmptyTaskCard(): TaskCard {
  return {
    intent: '',
    inputs: {},
    constraints: [],
    success_condition: null,
    version: 1,
  };
}

export function createEmptyPipelineCard(): PipelineCard {
  return {
    name: null,
    steps: [],
    schedule: null,
    proposed_skills: [],
    pending: [],
    version: 1,
  };
}

export function createEmptyAdapterCard(): AdapterCard {
  return {
    platforms: [],
    version: 1,
  };
}

export function createEmptyCommerceCard(): CommerceCard {
  return {
    offerings: [],
    pricing_rules: [],
    pending: [],
    version: 1,
  };
}

export function createEmptyOrgCard(): OrgCard {
  return {
    director: null,
    departments: [],
    governance: { cycle: null, chief_order: [], escalation: null },
    pending: [],
    version: 1,
  };
}

// ─── Mode / CardType Mapping ───

export function modeToCardType(mode: ConversationMode): CardType {
  switch (mode) {
    case 'world_design':
    case 'world_management':
      return 'world';
    case 'workflow_design':
      return 'workflow';
    case 'task':
      return 'task';
    case 'pipeline_design':
      return 'pipeline';
    case 'adapter_config':
      return 'adapter';
    case 'commerce_design':
      return 'commerce';
    case 'org_design':
      return 'org';
  }
}

export function createEmptyCard(mode: ConversationMode): AnyCard {
  switch (mode) {
    case 'world_design':
    case 'world_management':
      return createEmptyWorldCard();
    case 'workflow_design':
      return createEmptyWorkflowCard();
    case 'task':
      return createEmptyTaskCard();
    case 'pipeline_design':
      return createEmptyPipelineCard();
    case 'adapter_config':
      return createEmptyAdapterCard();
    case 'commerce_design':
      return createEmptyCommerceCard();
    case 'org_design':
      return createEmptyOrgCard();
  }
}
