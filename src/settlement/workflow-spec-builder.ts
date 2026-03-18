import yaml from 'js-yaml';
import type { WorkflowCard } from '../schemas/card';

interface WorkflowSpec {
  workflow: {
    name: string;
    purpose: string;
  };
  steps: Array<{
    order: number;
    description: string;
    skill: string | null;
    conditions: string | null;
  }>;
  triggers: string[];
  exit_conditions: string[];
  failure_handling: string[];
}

export function buildWorkflowSpec(card: WorkflowCard): string {
  const spec: WorkflowSpec = {
    workflow: {
      name: card.name ?? 'Untitled Workflow',
      purpose: card.purpose ?? '',
    },
    steps: card.steps.map((s) => ({
      order: s.order,
      description: s.description,
      skill: s.skill,
      conditions: s.conditions,
    })),
    triggers: card.confirmed.triggers,
    exit_conditions: card.confirmed.exit_conditions,
    failure_handling: card.confirmed.failure_handling,
  };

  return yaml.dump(spec, { indent: 2, lineWidth: -1, noRefs: true });
}
