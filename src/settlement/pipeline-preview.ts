import type { PipelineCard } from '../schemas/card';

export function formatPipelinePreview(card: PipelineCard): string {
  const lines: string[] = [];

  lines.push(`Pipeline: ${card.name ?? '(unnamed)'}`);
  lines.push('');

  if (card.steps.length === 0) {
    lines.push('  (no steps defined)');
    return lines.join('\n');
  }

  for (const step of card.steps) {
    const prefix = `  [${step.order}]`;
    switch (step.type) {
      case 'skill':
        lines.push(`${prefix} ⚙ ${step.label}${step.skill_name ? ` (skill: ${step.skill_name})` : ''}`);
        break;
      case 'gate':
        lines.push(`${prefix} 🚧 GATE: ${step.label}`);
        if (step.condition) {
          lines.push(`        condition: ${step.condition}`);
        }
        break;
      case 'branch':
        lines.push(`${prefix} 🔀 BRANCH: ${step.label}`);
        if (step.condition) {
          lines.push(`        condition: ${step.condition}`);
        }
        lines.push(`        on_true:  ${step.on_true ?? '(not set)'}`);
        lines.push(`        on_false: ${step.on_false ?? '(not set)'}`);
        break;
    }
  }

  return lines.join('\n');
}
