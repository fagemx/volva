import type { CardType, AnyCard, WorldCard, WorkflowCard } from '../schemas/card';
import type { SettlementTarget } from '../schemas/settlement';

export function classifySettlement(
  cardType: CardType,
  card: AnyCard,
): SettlementTarget | null {
  if (cardType === 'world') {
    const worldCard = card as WorldCard;
    if (worldCard.confirmed.hard_rules.length > 0 || worldCard.chief_draft !== null) {
      return 'village_pack';
    }
    return null;
  }

  if (cardType === 'workflow') {
    const workflowCard = card as WorkflowCard;
    if (workflowCard.steps.length > 0) {
      return 'workflow';
    }
    return null;
  }

  // cardType === 'task'
  return 'task';
}
