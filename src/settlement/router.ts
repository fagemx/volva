import type { CardType, AnyCard, WorldCard, WorkflowCard, PipelineCard, AdapterCard, CommerceCard, OrgCard } from '../schemas/card';
import type { SettlementTarget } from '../schemas/settlement';

export function classifySettlement(
  cardType: CardType,
  card: AnyCard,
): SettlementTarget | null {
  switch (cardType) {
    case 'world': {
      const worldCard = card as WorldCard;
      if (worldCard.confirmed.hard_rules.length > 0 || worldCard.chief_draft !== null) {
        return 'village_pack';
      }
      return null;
    }
    case 'workflow': {
      const workflowCard = card as WorkflowCard;
      if (workflowCard.steps.length > 0) {
        return 'workflow';
      }
      return null;
    }
    case 'task':
      return 'task';
    case 'pipeline': {
      const pipelineCard = card as PipelineCard;
      if (pipelineCard.steps.length > 0) {
        return 'pipeline';
      }
      return null;
    }
    case 'adapter': {
      const adapterCard = card as AdapterCard;
      if (adapterCard.platforms.some((p) => p.enabled)) {
        return 'adapter_config';
      }
      return null;
    }
    case 'commerce': {
      const commerceCard = card as CommerceCard;
      if (commerceCard.offerings.length > 0) {
        return 'market_init';
      }
      return null;
    }
    case 'org': {
      const orgCard = card as OrgCard;
      if (orgCard.departments.length > 0) {
        return 'org_hierarchy';
      }
      return null;
    }
    default: {
      const exhaustiveCheck: never = cardType;
      throw new Error(`Unknown card type: ${String(exhaustiveCheck)}`);
    }
  }
}
