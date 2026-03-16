import yaml from 'js-yaml';
import type { OrgCard } from '../schemas/card';

interface OrgHierarchySpec {
  organization: {
    director: {
      name: string;
      role: string;
      style: string;
    } | null;
    departments: Array<{
      name: string;
      chief: string | null;
      workers: string[];
      pipelines: string[];
    }>;
    governance: {
      cycle: string | null;
      chief_order: string[];
      escalation: string | null;
    };
  };
}

export function buildOrgHierarchy(card: OrgCard): string {
  const spec: OrgHierarchySpec = {
    organization: {
      director: card.director
        ? {
            name: card.director.name ?? 'Director',
            role: card.director.role ?? 'leader',
            style: card.director.style ?? 'neutral',
          }
        : null,
      departments: card.departments.map((d) => ({
        name: d.name,
        chief: d.chief,
        workers: d.workers,
        pipelines: d.pipeline_refs,
      })),
      governance: {
        cycle: card.governance.cycle,
        chief_order: card.governance.chief_order,
        escalation: card.governance.escalation,
      },
    },
  };

  return yaml.dump(spec, { indent: 2, lineWidth: -1, noRefs: true });
}
