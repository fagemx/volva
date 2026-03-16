import yaml from 'js-yaml';
import type { WorldCard } from '../schemas/card';

function slugify(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return slug || `skill-${index}`;
}

interface VillagePack {
  village: { name: string; target_repo: string };
  constitution: {
    rules: Array<{ description: string; enforcement: string; scope: string[] }>;
    allowed_permissions: string[];
    budget_limits?: {
      max_cost_per_action: number;
      max_cost_per_day: number;
      max_cost_per_loop: number;
    };
  };
  chief?: {
    name: string;
    role: string;
    personality: string;
    permissions: string[];
  };
  llm?: { preset: string };
  skills: Array<{ name: string; type: string; description: string }>;
  laws: never[];
}

export function buildVillagePack(card: WorldCard): string {
  const pack: VillagePack = {
    village: {
      name: card.goal ?? 'Untitled Village',
      target_repo: card.target_repo ?? 'default',
    },
    constitution: {
      rules: [
        ...card.confirmed.hard_rules.map((r) => ({
          description: r.description,
          enforcement: 'hard',
          scope: r.scope,
        })),
        ...card.confirmed.soft_rules.map((r) => ({
          description: r.description,
          enforcement: 'soft',
          scope: r.scope,
        })),
      ],
      allowed_permissions: ['dispatch_task', 'propose_law'],
    },
    llm: { preset: card.llm_preset ?? 'balanced' },
    skills: card.confirmed.must_have.map((item, i) => ({
      name: slugify(item, i),
      type: 'generic',
      description: item,
    })),
    laws: [],
  };

  if (card.budget_draft) {
    pack.constitution.budget_limits = {
      max_cost_per_action: card.budget_draft.per_action ?? 0,
      max_cost_per_day: card.budget_draft.per_day ?? 0,
      max_cost_per_loop: 50,
    };
  }

  if (card.chief_draft) {
    pack.chief = {
      name: card.chief_draft.name ?? 'Chief',
      role: card.chief_draft.role ?? 'leader',
      personality: card.chief_draft.style ?? 'neutral',
      permissions: ['dispatch_task', 'propose_law'],
    };
  }

  return yaml.dump(pack, { indent: 2, lineWidth: -1, noRefs: true });
}
