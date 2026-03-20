import type { CardType, AnyCard, OrgCard, PipelineCard } from '../schemas/card';

export interface Conflict {
  type: 'schedule' | 'permission' | 'budget' | 'unknown';
  cards: [CardType, CardType];
  description: string;
  severity: 'error' | 'warning' | 'info';
}

export function detectConflicts(cards: Map<CardType, AnyCard>): Conflict[] {
  const conflicts: Conflict[] = [];

  const orgCard = cards.get('org') as OrgCard | undefined;
  if (orgCard) {
    // TODO: Add permission conflict detection rules
  }

  const pipelineCard = cards.get('pipeline') as PipelineCard | undefined;
  if (pipelineCard) {
    // TODO: Add schedule conflict detection rules
  }

  return conflicts;
}

export function formatConflictMessage(conflicts: Conflict[]): string {
  if (conflicts.length === 0) return '';

  const lines = conflicts.map(c => {
    const severityIcon = c.severity === 'error' ? '❌' : c.severity === 'warning' ? '⚠️' : 'ℹ️';
    return `${severityIcon} [${c.cards.join(' ↔ ')}] ${c.description}`;
  });

  return `偵測到以下衝突：\n${lines.join('\n')}`;
}

export function hasBlockingConflicts(conflicts: Conflict[]): boolean {
  return conflicts.some(c => c.severity === 'error');
}
