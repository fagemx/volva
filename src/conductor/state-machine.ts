import type { WorldCard, WorkflowCard, TaskCard, PipelineCard, AdapterCard, CommerceCard, OrgCard, AnyCard, CardType } from '../schemas/card';
import type { IntentType } from '../schemas/intent';

export type Phase = 'explore' | 'focus' | 'settle';

export interface TransitionResult {
  newPhase: Phase;
  reason: string | null;
}

// ─── WorldCard Transitions ───

function checkWorldTransition(
  currentPhase: Phase,
  card: WorldCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> FOCUS
  if (currentPhase === 'explore') {
    if (card.confirmed.hard_rules.length > 0 && card.confirmed.must_have.length >= 3) {
      return { newPhase: 'focus', reason: 'hard_rule + must_have >= 3' };
    }
    if (intentType === 'set_boundary' && card.confirmed.must_have.length >= 2) {
      return { newPhase: 'focus', reason: 'boundary set + must_have >= 2' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── WorkflowCard Transitions ───

function checkWorkflowTransition(
  currentPhase: Phase,
  card: WorkflowCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> FOCUS
  if (currentPhase === 'explore') {
    if (card.steps.length > 0 && card.confirmed.triggers.length > 0) {
      return { newPhase: 'focus', reason: 'steps defined + triggers set' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── TaskCard Transitions ───

function checkTaskTransition(
  currentPhase: Phase,
  card: TaskCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> SETTLE (fast-path)
  if (currentPhase === 'explore') {
    if (card.intent !== '' && (intentType === 'confirm' || intentType === 'settle_signal')) {
      return { newPhase: 'settle', reason: 'task intent set + user confirmed' };
    }
    // EXPLORE -> FOCUS
    if (card.constraints.length > 0 && intentType !== 'confirm' && intentType !== 'settle_signal') {
      return { newPhase: 'focus', reason: 'constraints defined' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    if (intentType === 'confirm' || intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user confirmed task' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new task after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── PipelineCard Transitions ───

function checkPipelineTransition(
  currentPhase: Phase,
  card: PipelineCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> FOCUS: at least 2 steps defined
  if (currentPhase === 'explore') {
    if (card.steps.length >= 2) {
      return { newPhase: 'focus', reason: 'pipeline has >= 2 steps' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── AdapterCard Transitions ───

function checkAdapterTransition(
  currentPhase: Phase,
  card: AdapterCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> FOCUS: at least 1 platform added
  if (currentPhase === 'explore') {
    if (card.platforms.length >= 1) {
      return { newPhase: 'focus', reason: 'platform added' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    const allHaveRoles = card.platforms.filter((p) => p.enabled).every((p) => p.role !== '');
    if (allHaveRoles && (intentType === 'confirm' || intentType === 'settle_signal')) {
      return { newPhase: 'settle', reason: 'all enabled platforms have roles + user confirmed' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── CommerceCard Transitions ───

function checkCommerceTransition(
  currentPhase: Phase,
  card: CommerceCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> FOCUS: at least 1 offering + 1 pricing rule
  if (currentPhase === 'explore') {
    if (card.offerings.length >= 1 && card.pricing_rules.length >= 1) {
      return { newPhase: 'focus', reason: 'offerings >= 1 + pricing_rules >= 1' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── OrgCard Transitions ───

function checkOrgTransition(
  currentPhase: Phase,
  card: OrgCard,
  intentType: IntentType,
  consecutiveNoModTurns: number,
): TransitionResult {
  // EXPLORE -> FOCUS: director set and at least 1 department
  if (currentPhase === 'explore') {
    if (card.director !== null && card.departments.length >= 1) {
      return { newPhase: 'focus', reason: 'director set + departments >= 1' };
    }
  }

  // FOCUS -> SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
    if (consecutiveNoModTurns >= 2) {
      return { newPhase: 'settle', reason: 'consecutive 2 turns with no modification' };
    }
  }

  // SETTLE -> EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS -> EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}

// ─── Dispatcher ───

export function checkTransition(
  currentPhase: Phase,
  cardType: CardType,
  card: AnyCard,
  intentType: IntentType,
  consecutiveNoModTurns = 0,
): TransitionResult {
  switch (cardType) {
    case 'world':
      return checkWorldTransition(currentPhase, card as WorldCard, intentType, consecutiveNoModTurns);
    case 'workflow':
      return checkWorkflowTransition(currentPhase, card as WorkflowCard, intentType, consecutiveNoModTurns);
    case 'task':
      return checkTaskTransition(currentPhase, card as TaskCard, intentType, consecutiveNoModTurns);
    case 'pipeline':
      return checkPipelineTransition(currentPhase, card as PipelineCard, intentType, consecutiveNoModTurns);
    case 'adapter':
      return checkAdapterTransition(currentPhase, card as AdapterCard, intentType, consecutiveNoModTurns);
    case 'commerce':
      return checkCommerceTransition(currentPhase, card as CommerceCard, intentType, consecutiveNoModTurns);
    case 'org':
      return checkOrgTransition(currentPhase, card as OrgCard, intentType, consecutiveNoModTurns);
  }
}
