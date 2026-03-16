import type { Phase } from './state-machine';
import type { IntentType } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';
import type { ConversationMode } from '../schemas/conversation';

export function pickStrategy(
  phase: Phase,
  intentType: IntentType,
  hasPending: boolean,
  mode?: ConversationMode,
): Strategy {
  switch (phase) {
    case 'explore':
      if (mode === 'task' && intentType === 'confirm') return 'settle';
      if (mode === 'pipeline_design' && intentType === 'add_info') return 'probe';
      if (mode === 'adapter_config' && intentType === 'add_info') return 'probe';
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
    default: {
      const exhaustiveCheck: never = phase;
      throw new Error(`Unknown phase: ${String(exhaustiveCheck)}`);
    }
  }
}
