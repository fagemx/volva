import type { Phase } from './state-machine';
import type { IntentType } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';

export function pickStrategy(phase: Phase, intentType: IntentType, hasPending: boolean): Strategy {
  switch (phase) {
    case 'explore':
      if (intentType === 'new_intent') return 'mirror';
      if (intentType === 'set_boundary') return 'mirror';
      return 'probe';
    case 'focus':
      if (intentType === 'confirm' && !hasPending) return 'settle';
      if (intentType === 'confirm') return 'propose';
      if (intentType === 'modify') return 'confirm';
      return 'propose';
    case 'settle':
      if (intentType === 'settle_signal') return 'settle';
      if (intentType === 'confirm') return 'settle';
      return 'confirm';
  }
}
