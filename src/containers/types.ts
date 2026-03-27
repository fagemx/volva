import type { IntentType } from '../schemas/intent';

export const ContainerEnum = ['world', 'shape', 'skill', 'task', 'review', 'harvest'] as const;
export type Container = (typeof ContainerEnum)[number];

export type PostureSignal = 'explore' | 'act' | 'inspect' | 'harvest';

export type Confidence = 'low' | 'medium' | 'high';

export type ConfidenceBehavior = 'proceed' | 'showRationale' | 'askClarification';

export interface ContainerSelection {
  primary: Container;
  secondary?: Container;
  confidence: Confidence;
  rationale: string;
  skillId?: string;
}

export interface RoutingContext {
  userMessage: string;
  intentType?: IntentType;
  hasActiveWorld?: boolean;
  conversationHistory?: string[];
}

