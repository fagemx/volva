import { describe, it, expect } from 'vitest';
import { pickStrategy } from './rhythm';

describe('pickStrategy', () => {
  // EXPLORE phase
  it('explore + new_intent → mirror', () => {
    expect(pickStrategy('explore', 'new_intent', false)).toBe('mirror');
  });

  it('explore + add_info → probe', () => {
    expect(pickStrategy('explore', 'add_info', false)).toBe('probe');
  });

  it('explore + set_boundary → mirror', () => {
    expect(pickStrategy('explore', 'set_boundary', false)).toBe('mirror');
  });

  it('explore + confirm → probe', () => {
    expect(pickStrategy('explore', 'confirm', false)).toBe('probe');
  });

  it('explore + question → probe', () => {
    expect(pickStrategy('explore', 'question', false)).toBe('probe');
  });

  it('explore + add_evaluator_rule -> probe', () => {
    expect(pickStrategy('explore', 'add_evaluator_rule', false)).toBe('probe');
  });

  // FOCUS phase
  it('focus + confirm + no pending → settle', () => {
    expect(pickStrategy('focus', 'confirm', false)).toBe('settle');
  });

  it('focus + confirm + has pending → propose', () => {
    expect(pickStrategy('focus', 'confirm', true)).toBe('propose');
  });

  it('focus + modify → confirm', () => {
    expect(pickStrategy('focus', 'modify', false)).toBe('confirm');
  });

  it('focus + add_info → propose', () => {
    expect(pickStrategy('focus', 'add_info', false)).toBe('propose');
  });

  // SETTLE phase
  it('settle + settle_signal → settle', () => {
    expect(pickStrategy('settle', 'settle_signal', false)).toBe('settle');
  });

  it('settle + confirm → settle', () => {
    expect(pickStrategy('settle', 'confirm', false)).toBe('settle');
  });

  it('settle + modify → confirm', () => {
    expect(pickStrategy('settle', 'modify', false)).toBe('confirm');
  });
});
