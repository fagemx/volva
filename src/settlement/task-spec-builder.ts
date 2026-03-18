import type { TaskCard } from '../schemas/card';

interface TaskSpec {
  intent: string;
  inputs: Record<string, string>;
  constraints: string[];
  success_condition: string | null;
}

export function buildTaskSpec(card: TaskCard): string {
  const spec: TaskSpec = {
    intent: card.intent,
    inputs: card.inputs,
    constraints: card.constraints,
    success_condition: card.success_condition,
  };

  return JSON.stringify(spec, null, 2);
}
