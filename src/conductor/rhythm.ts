import type { Phase } from './state-machine';
import type { IntentType } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';

export function pickStrategy(phase: Phase, intentType: IntentType, hasPending: boolean): Strategy {
  if (phase === 'explore') {
    if (intentType === 'new_intent') return 'mirror';
    if (intentType === 'set_boundary') return 'mirror';
    return 'probe';
  }

  if (phase === 'focus') {
    if (intentType === 'confirm' && !hasPending) return 'settle';
    if (intentType === 'confirm') return 'propose';
    if (intentType === 'modify') return 'confirm';
    return 'propose';
  }

  if (phase === 'settle') {
    if (intentType === 'settle_signal') return 'settle';
    if (intentType === 'confirm') return 'settle';
    return 'confirm';
  }

  return 'probe';
}
