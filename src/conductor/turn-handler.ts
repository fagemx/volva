import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import { checkTransition, type Phase } from './state-machine';
import { pickStrategy } from './rhythm';
import type { WorldCard } from '../schemas/card';
import type { Intent } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';

export interface TurnResult {
  reply: string;
  intent: Intent;
  phase: Phase;
  phaseChanged: boolean;
  strategy: Strategy;
  cardVersion: number;
}

export function createEmptyWorldCard(): WorldCard {
  return {
    goal: null,
    confirmed: { hard_rules: [], soft_rules: [], must_have: [], success_criteria: [] },
    pending: [],
    chief_draft: null,
    budget_draft: null,
    current_proposal: null,
    version: 1,
  };
}

export function applyIntentToCard(card: WorldCard, intent: Intent): WorldCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) updated.goal = intent.summary;
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [, value] of Object.entries(intent.entities)) {
          if (!updated.confirmed.must_have.includes(value)) {
            updated.confirmed.must_have.push(value);
          }
        }
      }
      break;
    case 'set_boundary':
      if (intent.enforcement === 'hard') {
        updated.confirmed.hard_rules.push(intent.summary);
      } else {
        updated.confirmed.soft_rules.push(intent.summary);
      }
      break;
    case 'add_constraint':
      updated.confirmed.soft_rules.push(intent.summary);
      break;
    case 'style_preference':
      if (!updated.chief_draft) {
        updated.chief_draft = { name: null, role: null, style: null };
      }
      updated.chief_draft.style = intent.summary;
      break;
    case 'confirm':
    case 'settle_signal':
    case 'modify':
    case 'question':
    case 'off_topic':
      break;
  }

  return updated;
}

export async function handleTurn(
  llm: LLMClient,
  cardManager: CardManager,
  conversationId: string,
  userMessage: string,
  currentPhase: Phase,
): Promise<TurnResult> {
  const currentCard = cardManager.getLatest(conversationId);
  const cardContent = currentCard ? (currentCard.content as WorldCard) : createEmptyWorldCard();
  const cardSnapshot = JSON.stringify(cardContent, null, 2);

  // LLM #1: parse intent
  const intent = await parseIntent(llm, userMessage, cardSnapshot);

  // Update card content based on intent
  const updatedContent = applyIntentToCard(cardContent, intent);

  // Persist card
  let cardVersion: number;
  if (currentCard) {
    const { card } = cardManager.update(currentCard.id, updatedContent);
    cardVersion = card.version;
  } else {
    const card = cardManager.create(conversationId, 'world', updatedContent);
    cardVersion = card.version;
  }

  // Check state transition
  const transition = checkTransition(currentPhase, updatedContent, intent.type);

  // Pick reply strategy
  const strategy = pickStrategy(
    transition.newPhase,
    intent.type,
    updatedContent.pending.length > 0,
  );

  // LLM #2: generate reply
  const reply = await generateReply(llm, strategy, JSON.stringify(updatedContent, null, 2), userMessage);

  return {
    reply,
    intent,
    phase: transition.newPhase,
    phaseChanged: transition.reason !== null,
    strategy,
    cardVersion,
  };
}
