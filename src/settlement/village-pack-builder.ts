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
  village: { name: string };
  constitution: {
    rules: Array<{ description: string; enforcement: string }>;
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
  skills: Array<{ name: string; type: string; description: string }>;
  laws: never[];
}

export function buildVillagePack(card: WorldCard): string {
  const pack: VillagePack = {
    village: {
      name: card.goal ?? 'Untitled Village',
    },
    constitution: {
      rules: [
        ...card.confirmed.hard_rules.map((r) => ({
          description: r,
          enforcement: 'hard',
        })),
        ...card.confirmed.soft_rules.map((r) => ({
          description: r,
          enforcement: 'soft',
        })),
      ],
      allowed_permissions: ['dispatch_task', 'propose_law'],
    },
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
      permissions: ['manage_skills', 'review_output'],
    };
  }

  return yaml.dump(pack, { indent: 2, lineWidth: -1, noRefs: true });
}
