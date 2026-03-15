import type { WorldCard } from '../schemas/card';
import type { IntentType } from '../schemas/intent';

export type { IntentType } from '../schemas/intent';

export type Phase = 'explore' | 'focus' | 'settle';

export interface TransitionResult {
  newPhase: Phase;
  reason: string | null;
}

export function checkTransition(
  currentPhase: Phase,
  card: WorldCard,
  intentType: IntentType,
): TransitionResult {
  // EXPLORE → FOCUS
  if (currentPhase === 'explore') {
    if (card.confirmed.hard_rules.length > 0 && card.confirmed.must_have.length >= 3) {
      return { newPhase: 'focus', reason: 'hard_rule + must_have >= 3' };
    }
    if (intentType === 'set_boundary' && card.confirmed.must_have.length >= 2) {
      return { newPhase: 'focus', reason: 'boundary set + must_have >= 2' };
    }
  }

  // FOCUS → SETTLE
  if (currentPhase === 'focus') {
    if (card.pending.length === 0 && intentType === 'confirm') {
      return { newPhase: 'settle', reason: 'pending empty + user confirmed' };
    }
    if (intentType === 'settle_signal') {
      return { newPhase: 'settle', reason: 'user explicit settle signal' };
    }
  }

  // SETTLE → EXPLORE
  if (currentPhase === 'settle') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'new topic after settlement' };
    }
  }

  // FOCUS → EXPLORE (rollback)
  if (currentPhase === 'focus') {
    if (intentType === 'new_intent') {
      return { newPhase: 'explore', reason: 'major direction change' };
    }
  }

  return { newPhase: currentPhase, reason: null };
}
