import yaml from 'js-yaml';
import type { PipelineCard } from '../schemas/card';

interface PipelineSpec {
  pipeline: {
    name: string;
    schedule: string | null;
  };
  steps: Array<{
    order: number;
    type: string;
    label: string;
    skill_name: string | null;
    instruction: string | null;
    revision_target: string | null;
    max_revision_cycles: number | null;
    condition: string | null;
    on_true: string | null;
    on_false: string | null;
  }>;
  proposed_skills: Array<{
    name: string;
    type: string;
    description: string;
  }>;
}

export function buildPipelineSpec(card: PipelineCard): string {
  const spec: PipelineSpec = {
    pipeline: {
      name: card.name ?? 'Untitled Pipeline',
      schedule: card.schedule,
    },
    steps: card.steps.map((s) => ({
      order: s.order,
      type: s.type,
      label: s.label,
      skill_name: s.skill_name,
      instruction: s.instruction,
      revision_target: s.revision_target,
      max_revision_cycles: s.max_revision_cycles,
      condition: s.condition,
      on_true: s.on_true,
      on_false: s.on_false,
    })),
    proposed_skills: card.proposed_skills,
  };

  return yaml.dump(spec, { indent: 2, lineWidth: -1, noRefs: true });
}
