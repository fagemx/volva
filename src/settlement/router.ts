import type { CardType, AnyCard, WorldCard, WorkflowCard } from '../schemas/card';
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
    default: {
      const exhaustiveCheck: never = cardType;
      throw new Error(`Unknown card type: ${String(exhaustiveCheck)}`);
    }
  }
}
