import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import { checkTransition, type Phase } from './state-machine';
import { pickStrategy } from './rhythm';
import type { AnyCard, CardType, CardDiff, CardEnvelope } from '../schemas/card';
import type { Intent } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';
import type { ConversationMode } from '../schemas/conversation';
import type { SkillData } from '../thyra-client/schemas';
import { createEmptyCard, modeToCardType } from './card-factories';
import { applyIntent, applyIntentToCards } from './card-mutations';
import { detectConflicts, formatConflictMessage, type Conflict } from './conflict-detector';

// Re-export everything from card-factories and card-mutations for backward compatibility
export {
  createEmptyWorldCard,
  createEmptyWorkflowCard,
  createEmptyTaskCard,
  createEmptyPipelineCard,
  createEmptyAdapterCard,
  createEmptyCommerceCard,
  createEmptyOrgCard,
  modeToCardType,
  createEmptyCard,
} from './card-factories';

export {
  applyIntentToCard,
  applyIntentToWorkflowCard,
  applyIntentToTaskCard,
  applyIntentToPipelineCard,
  applyIntentToAdapterCard,
  applyIntentToCommerceCard,
  applyIntentToOrgCard,
  applyIntent,
} from './card-mutations';

export interface TurnResult {
  reply: string;
  intent: Intent;
  phase: Phase;
  phaseChanged: boolean;
  strategy: Strategy;
  cardVersion: number;
  cardVersions: Map<CardType, number>;
  detectedMode?: ConversationMode;
  nomodStreak: number;
  conflicts: Conflict[];
}

export function isDiffEmpty(diff: CardDiff): boolean {
  return diff.added.length === 0
    && diff.removed.length === 0
    && diff.changed.filter(k => k !== 'version').length === 0;
}

// ─── hasPending Helper ───

function cardHasPending(cardType: CardType, card: AnyCard): boolean {
  switch (cardType) {
    case 'world':
      return (card as import('../schemas/card').WorldCard).pending.length > 0;
    case 'workflow':
      return (card as import('../schemas/card').WorkflowCard).pending.length > 0;
    case 'task':
      return false;
    case 'pipeline':
      return (card as import('../schemas/card').PipelineCard).pending.length > 0;
    case 'adapter':
      return false;
    case 'commerce':
      return (card as import('../schemas/card').CommerceCard).pending.length > 0;
    case 'org':
      return (card as import('../schemas/card').OrgCard).pending.length > 0;
  }
}

// ─── handleTurn ───

export async function handleTurn(
  llm: LLMClient,
  cardManager: CardManager,
  conversationId: string,
  userMessage: string,
  currentPhase: Phase,
  mode: ConversationMode = 'world_design',
  nomodStreak = 0,
  availableSkills?: SkillData[],
): Promise<TurnResult> {
  const activeCards = cardManager.getActiveCards(conversationId);
  const isFirstTurn = activeCards.size === 0;

  const cardSnapshots = Array.from(activeCards.entries())
    .map(([type, card]) => `[${type}]: ${JSON.stringify(card.content, null, 2)}`)
    .join('\n\n');

  const intent = await parseIntent(llm, userMessage, cardSnapshots || '(no cards yet)');

  let effectiveMode = mode;
  let detectedMode: ConversationMode | undefined;
  if (isFirstTurn && intent.detected_mode) {
    effectiveMode = intent.detected_mode;
    detectedMode = intent.detected_mode;
  }

  const primaryCardType = modeToCardType(effectiveMode);

  if (isFirstTurn) {
    const emptyCard = createEmptyCard(effectiveMode);
    cardManager.create(conversationId, primaryCardType, emptyCard);
    activeCards.set(primaryCardType, {
      id: '',
      conversationId,
      type: primaryCardType,
      content: emptyCard,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const activeCardsContent = new Map<CardType, AnyCard>();
  for (const [type, envelope] of activeCards) {
    activeCardsContent.set(type, envelope.content);
  }

  const updatedCards = applyIntentToCards(activeCardsContent, intent);

  const cardVersions = new Map<CardType, number>();
  let newNomodStreak = nomodStreak;
  let anyChanges = false;

  for (const [cardType, updatedContent] of updatedCards) {
    const existingEnvelope = activeCards.get(cardType);
    if (existingEnvelope && existingEnvelope.id) {
      const { card, diff } = cardManager.update(existingEnvelope.id, updatedContent);
      cardVersions.set(cardType, card.version);
      if (!isDiffEmpty(diff)) {
        anyChanges = true;
      }
    } else {
      const card = cardManager.create(conversationId, cardType, updatedContent);
      cardVersions.set(cardType, card.version);
      anyChanges = true;
    }
  }

  if (anyChanges) {
    newNomodStreak = 0;
  } else {
    newNomodStreak = nomodStreak + 1;
  }

  const conflicts = detectConflicts(updatedCards);
  const conflictMessage = formatConflictMessage(conflicts);

  const primaryCard = updatedCards.get(primaryCardType);
  const transition = primaryCard
    ? checkTransition(currentPhase, primaryCardType, primaryCard, intent.type, newNomodStreak)
    : { newPhase: currentPhase, reason: null };

  const hasPending = primaryCard ? cardHasPending(primaryCardType, primaryCard) : false;
  const strategy = pickStrategy(transition.newPhase, intent.type, hasPending, effectiveMode);

  const cardsJson = Array.from(updatedCards.entries())
    .map(([type, card]) => `[${type}]: ${JSON.stringify(card, null, 2)}`)
    .join('\n\n');

  let reply = await generateReply(llm, strategy, cardsJson, userMessage, availableSkills);

  if (conflictMessage) {
    reply = `${reply}\n\n${conflictMessage}`;
  }

  return {
    reply,
    intent,
    phase: transition.newPhase,
    phaseChanged: transition.reason !== null,
    strategy,
    cardVersion: cardVersions.get(primaryCardType) || 1,
    cardVersions,
    ...(detectedMode !== undefined && { detectedMode }),
    nomodStreak: newNomodStreak,
    conflicts,
  };
}
