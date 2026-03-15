import type { WorldCard, WorkflowCard, TaskCard, AnyCard, CardType } from '../schemas/card';
import type { IntentType } from '../schemas/intent';

export type { IntentType } from '../schemas/intent';

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
  }
}
