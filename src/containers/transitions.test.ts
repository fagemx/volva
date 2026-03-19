import { describe, expect, it } from 'vitest';
import { checkContainerTransition, spawnFromWorld } from './transitions';
import type { Container } from './types';

describe('checkContainerTransition', () => {
  describe('allowed transitions', () => {
    const allowedCases: [Container, Container][] = [
      ['shape', 'skill'],
      ['shape', 'world'],
      ['shape', 'task'],
      ['shape', 'harvest'],
      ['task', 'harvest'],
      ['skill', 'review'],
      ['skill', 'harvest'],
      ['review', 'skill'],
      ['review', 'task'],
      ['review', 'harvest'],
    ];

    it.each(allowedCases)('%s -> %s is allowed', (from, to) => {
      const result = checkContainerTransition(from, to, 'test reason');
      expect(result.allowed).toBe(true);
      expect(result.newContainer).toBe(to);
      expect(result.reason).toBe('test reason');
    });
  });

  describe('same-container transition (no-op)', () => {
    const containers: Container[] = ['world', 'shape', 'skill', 'task', 'review', 'harvest'];

    it.each(containers)('%s -> %s is allowed (no-op)', (container) => {
      const result = checkContainerTransition(container, container, 'ignored');
      expect(result.allowed).toBe(true);
      expect(result.newContainer).toBe(container);
      expect(result.reason).toBe('No transition needed');
    });
  });

  describe('disallowed transitions', () => {
    const disallowedCases: [Container, Container][] = [
      // World has no exit transitions
      ['world', 'shape'],
      ['world', 'skill'],
      ['world', 'task'],
      ['world', 'review'],
      ['world', 'harvest'],
      // Harvest is terminal
      ['harvest', 'shape'],
      ['harvest', 'world'],
      ['harvest', 'skill'],
      ['harvest', 'task'],
      ['harvest', 'review'],
      // Task can only go to harvest
      ['task', 'shape'],
      ['task', 'skill'],
      ['task', 'world'],
      ['task', 'review'],
      // Skill can only go to review or harvest
      ['skill', 'shape'],
      ['skill', 'world'],
      ['skill', 'task'],
      // Shape cannot go to review
      ['shape', 'review'],
      // Review cannot go to world or shape
      ['review', 'world'],
      ['review', 'shape'],
    ];

    it.each(disallowedCases)('%s -> %s is disallowed', (from, to) => {
      const result = checkContainerTransition(from, to, 'test reason');
      expect(result.allowed).toBe(false);
      expect(result.newContainer).toBe(from);
      expect(result.reason).toContain('not allowed');
    });
  });
});

describe('spawnFromWorld', () => {
  it('spawns shape from world', () => {
    const result = spawnFromWorld('world-1', 'shape', 'fuzzy sub-problem');
    expect(result).not.toBeNull();
    expect(result!.parentWorld).toBe('world-1');
    expect(result!.childContainer).toBe('shape');
    expect(result!.childId).toMatch(/^world-1:shape:\d+$/);
    expect(result!.reason).toBe('fuzzy sub-problem');
  });

  it('spawns task from world', () => {
    const result = spawnFromWorld('world-1', 'task', 'bounded work item');
    expect(result).not.toBeNull();
    expect(result!.childContainer).toBe('task');
  });

  it('spawns skill from world', () => {
    const result = spawnFromWorld('world-1', 'skill', 'known capability');
    expect(result).not.toBeNull();
    expect(result!.childContainer).toBe('skill');
  });

  it('spawns review from world', () => {
    const result = spawnFromWorld('world-1', 'review', 'investigate');
    expect(result).not.toBeNull();
    expect(result!.childContainer).toBe('review');
  });

  it('spawns harvest from world', () => {
    const result = spawnFromWorld('world-1', 'harvest', 'capture pattern');
    expect(result).not.toBeNull();
    expect(result!.childContainer).toBe('harvest');
  });

  it('cannot spawn world (no recursive worlds)', () => {
    const result = spawnFromWorld('world-1', 'world', 'nested world');
    expect(result).toBeNull();
  });
});
