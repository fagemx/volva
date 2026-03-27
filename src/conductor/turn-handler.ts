import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import { checkTransition, type Phase } from './state-machine';
import { pickStrategy } from './rhythm';
import type { AnyCard, CardType, CardDiff } from '../schemas/card';
import type { Intent } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';
import type { ConversationMode } from '../schemas/conversation';
import type { SkillData } from '../thyra-client/schemas';
import { createEmptyCard, modeToCardType } from './card-factories';
import { applyIntent } from './card-mutations';

export interface TurnResult {
  reply: string;
  intent: Intent;
  phase: Phase;
  phaseChanged: boolean;
  strategy: Strategy;
  cardVersion: number;
  detectedMode?: ConversationMode;
  nomodStreak: number;
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
  const currentCard = cardManager.getLatest(conversationId);
  const isFirstTurn = !currentCard;
  const cardContent = currentCard ? currentCard.content : createEmptyCard(mode);
  const cardSnapshot = JSON.stringify(cardContent, null, 2);

  // LLM #1: parse intent (CONTRACT LLM-02 satisfied by LLMClient)
  const intent = await parseIntent(llm, userMessage, cardSnapshot);

  // Auto-detect mode on first turn if LLM returned detected_mode
  let effectiveMode = mode;
  let detectedMode: ConversationMode | undefined;
  if (isFirstTurn && intent.detected_mode) {
    effectiveMode = intent.detected_mode;
    detectedMode = intent.detected_mode;
  }

  const cardType = modeToCardType(effectiveMode);
  const effectiveCardContent = isFirstTurn ? createEmptyCard(effectiveMode) : cardContent;

  // Update card content based on intent
  const updatedContent = applyIntent(cardType, effectiveCardContent, intent);

  // Persist card and compute diff-based nomod streak
  let cardVersion: number;
  let newNomodStreak: number;
  if (currentCard) {
    const { card, diff } = cardManager.update(currentCard.id, updatedContent);
    cardVersion = card.version;
    newNomodStreak = isDiffEmpty(diff) ? nomodStreak + 1 : 0;
  } else {
    const card = cardManager.create(conversationId, cardType, updatedContent);
    cardVersion = card.version;
    newNomodStreak = 0;
  }

  // Check state transition
  const transition = checkTransition(currentPhase, cardType, updatedContent, intent.type, newNomodStreak);

  // Pick reply strategy
  const hasPending = cardHasPending(cardType, updatedContent);
  const strategy = pickStrategy(transition.newPhase, intent.type, hasPending, effectiveMode);

  // LLM #2: generate reply (CONTRACT LLM-02 satisfied by LLMClient)
  const reply = await generateReply(llm, strategy, JSON.stringify(updatedContent, null, 2), userMessage, availableSkills);

  return {
    reply,
    intent,
    phase: transition.newPhase,
    phaseChanged: transition.reason !== null,
    strategy,
    cardVersion,
    ...(detectedMode !== undefined && { detectedMode }),
    nomodStreak: newNomodStreak,
  };
}
