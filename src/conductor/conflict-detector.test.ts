import { describe, it, expect } from 'vitest';
import { detectConflicts, formatConflictMessage, hasBlockingConflicts } from './conflict-detector';
import type { CardType, AnyCard } from '../schemas/card';

describe('conflict-detector', () => {
  it('returns empty array when no conflicts', () => {
    const cards = new Map<CardType, AnyCard>();
    const conflicts = detectConflicts(cards);
    expect(conflicts).toEqual([]);
  });

  it('returns empty array for single card', () => {
    const cards = new Map<CardType, AnyCard>();
    cards.set('world', {
      goal: 'test',
      target_repo: null,
      confirmed: {
        hard_rules: [],
        soft_rules: [],
        must_have: [],
        success_criteria: [],
        evaluator_rules: [],
      },
      pending: [],
      chief_draft: null,
      budget_draft: null,
      llm_preset: null,
      current_proposal: null,
      version: 1,
    });
    const conflicts = detectConflicts(cards);
    expect(conflicts).toEqual([]);
  });

  it('formatConflictMessage returns empty string for no conflicts', () => {
    expect(formatConflictMessage([])).toBe('');
  });

  it('hasBlockingConflicts returns false for empty array', () => {
    expect(hasBlockingConflicts([])).toBe(false);
  });

  it('hasBlockingConflicts returns true for error severity', () => {
    expect(hasBlockingConflicts([
      { type: 'unknown', cards: ['org', 'pipeline'], description: 'test', severity: 'error' }
    ])).toBe(true);
  });

  it('hasBlockingConflicts returns false for warning severity', () => {
    expect(hasBlockingConflicts([
      { type: 'unknown', cards: ['org', 'pipeline'], description: 'test', severity: 'warning' }
    ])).toBe(false);
  });

  it('hasBlockingConflicts returns false for info severity', () => {
    expect(hasBlockingConflicts([
      { type: 'unknown', cards: ['org', 'pipeline'], description: 'test', severity: 'info' }
    ])).toBe(false);
  });

  it('formatConflictMessage formats error with correct icon', () => {
    const message = formatConflictMessage([
      { type: 'permission', cards: ['org', 'world'], description: 'Permission conflict', severity: 'error' }
    ]);
    expect(message).toContain('❌');
    expect(message).toContain('Permission conflict');
  });

  it('formatConflictMessage formats warning with correct icon', () => {
    const message = formatConflictMessage([
      { type: 'schedule', cards: ['pipeline', 'org'], description: 'Schedule conflict', severity: 'warning' }
    ]);
    expect(message).toContain('⚠️');
    expect(message).toContain('Schedule conflict');
  });

  it('formatConflictMessage formats multiple conflicts', () => {
    const message = formatConflictMessage([
      { type: 'permission', cards: ['org', 'world'], description: 'Permission conflict', severity: 'error' },
      { type: 'schedule', cards: ['pipeline', 'org'], description: 'Schedule conflict', severity: 'warning' }
    ]);
    expect(message).toContain('❌');
    expect(message).toContain('⚠️');
    expect(message).toContain('偵測到以下衝突');
  });
});
