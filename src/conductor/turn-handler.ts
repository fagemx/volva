import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import { checkTransition, type Phase } from './state-machine';
import { pickStrategy } from './rhythm';
import type { WorldCard, WorkflowCard, TaskCard, AnyCard, CardType, CardDiff } from '../schemas/card';
import type { Intent } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';
import type { ConversationMode } from '../schemas/conversation';

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

// ─── Empty Card Factories ───

export function createEmptyWorldCard(): WorldCard {
  return {
    goal: null,
    target_repo: null,
    confirmed: { hard_rules: [], soft_rules: [], must_have: [], success_criteria: [] },
    pending: [],
    chief_draft: null,
    budget_draft: null,
    current_proposal: null,
    version: 1,
  };
}

export function createEmptyWorkflowCard(): WorkflowCard {
  return {
    name: null,
    purpose: null,
    steps: [],
    confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
    pending: [],
    version: 1,
  };
}

export function createEmptyTaskCard(): TaskCard {
  return {
    intent: '',
    inputs: {},
    constraints: [],
    success_condition: null,
    version: 1,
  };
}

// ─── Mode / CardType Mapping ───

export function modeToCardType(mode: ConversationMode): CardType {
  switch (mode) {
    case 'world_design':
      return 'world';
    case 'workflow_design':
      return 'workflow';
    case 'task':
      return 'task';
  }
}

export function createEmptyCard(mode: ConversationMode): AnyCard {
  switch (mode) {
    case 'world_design':
      return createEmptyWorldCard();
    case 'workflow_design':
      return createEmptyWorkflowCard();
    case 'task':
      return createEmptyTaskCard();
  }
}

// ─── Modify Rule Helper ───

function applyModifyRule(updated: WorldCard, intent: Intent): void {
  if (!intent.entities?.target_rule) return;

  const targetRule = intent.entities.target_rule;

  for (const rule of updated.confirmed.hard_rules) {
    if (rule.description.includes(targetRule)) {
      rule.description = `[changed] ${intent.summary}`;
      return;
    }
  }

  for (const rule of updated.confirmed.soft_rules) {
    if (rule.description.includes(targetRule)) {
      rule.description = `[changed] ${intent.summary}`;
      return;
    }
  }

  updated.confirmed.soft_rules.push({ description: `[new] ${intent.summary}`, scope: ['*'] });
}

// ─── Intent Apply Functions ───

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
        updated.confirmed.hard_rules.push({ description: intent.summary, scope: ['*'] });
      } else {
        updated.confirmed.soft_rules.push({ description: intent.summary, scope: ['*'] });
      }
      break;
    case 'add_constraint':
      updated.confirmed.soft_rules.push({ description: intent.summary, scope: ['*'] });
      break;
    case 'style_preference':
      if (!updated.chief_draft) {
        updated.chief_draft = { name: null, role: null, style: null };
      }
      updated.chief_draft.style = intent.summary;
      break;
    case 'modify':
      applyModifyRule(updated, intent);
      break;
    case 'confirm':
    case 'settle_signal':
    case 'question':
    case 'off_topic':
      break;
  }

  return updated;
}

export function applyIntentToWorkflowCard(card: WorkflowCard, intent: Intent): WorkflowCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) {
        updated.name = intent.summary;
        updated.purpose = intent.summary;
      }
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [, value] of Object.entries(intent.entities)) {
          updated.steps.push({
            order: updated.steps.length,
            description: value,
            skill: null,
            conditions: null,
          });
        }
      }
      break;
    case 'set_boundary':
      if (intent.enforcement === 'hard') {
        updated.confirmed.triggers.push(intent.summary);
      } else {
        updated.confirmed.exit_conditions.push(intent.summary);
      }
      break;
    case 'add_constraint':
      updated.confirmed.failure_handling.push(intent.summary);
      break;
    case 'confirm':
    case 'settle_signal':
    case 'modify':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

export function applyIntentToTaskCard(card: TaskCard, intent: Intent): TaskCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) updated.intent = intent.summary;
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [key, value] of Object.entries(intent.entities)) {
          updated.inputs[key] = value;
        }
      }
      break;
    case 'set_boundary':
    case 'add_constraint':
      updated.constraints.push(intent.summary);
      break;
    case 'confirm':
    case 'settle_signal':
    case 'modify':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

export function applyIntent(cardType: CardType, card: AnyCard, intent: Intent): AnyCard {
  switch (cardType) {
    case 'world':
      return applyIntentToCard(card as WorldCard, intent);
    case 'workflow':
      return applyIntentToWorkflowCard(card as WorkflowCard, intent);
    case 'task':
      return applyIntentToTaskCard(card as TaskCard, intent);
  }
}

// ─── hasPending Helper ───

function cardHasPending(cardType: CardType, card: AnyCard): boolean {
  switch (cardType) {
    case 'world':
      return (card as WorldCard).pending.length > 0;
    case 'workflow':
      return (card as WorkflowCard).pending.length > 0;
    case 'task':
      return false;
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
): Promise<TurnResult> {
  const currentCard = cardManager.getLatest(conversationId);
  const isFirstTurn = !currentCard;
  const cardContent = currentCard ? currentCard.content : createEmptyCard(mode);
  const cardSnapshot = JSON.stringify(cardContent, null, 2);

  // LLM #1: parse intent
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

  // LLM #2: generate reply
  const reply = await generateReply(llm, strategy, JSON.stringify(updatedContent, null, 2), userMessage);

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
