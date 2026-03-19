import type { PostureSignal, RoutingContext } from './types';

const ACT_KEYWORDS = /\b(deploy|run|execute|build|install|start|launch|fix|create|do it)\b/i;
const INSPECT_KEYWORDS = /\b(why|diagnose|audit|compare|analyze|check|review|investigate)\b/i;
const HARVEST_KEYWORDS = /\b(save|capture|remember|extract|record|keep|reusable)\b/i;

/**
 * Detect internal posture signal from routing context.
 *
 * Works in two modes:
 * 1. With intentType (from previous turn or pre-parsed): uses intent mapping + keyword fallback
 * 2. Without intentType (first request, no prior context): uses keyword heuristics only
 *
 * No LLM call — COND-02 friendly.
 */
export function detectPosture(ctx: RoutingContext): PostureSignal {
  const { intentType, userMessage } = ctx;

  // Intent-type mapping takes priority when available
  if (intentType === 'settle_signal' && HARVEST_KEYWORDS.test(userMessage)) {
    return 'harvest';
  }

  if (intentType === 'question' || intentType === 'query_status' || intentType === 'query_history') {
    return 'inspect';
  }

  if (intentType === 'confirm' || intentType === 'settle_signal') {
    return 'act';
  }

  // Keyword heuristics (order matters: harvest > inspect > act > explore)
  if (HARVEST_KEYWORDS.test(userMessage)) {
    return 'harvest';
  }

  if (INSPECT_KEYWORDS.test(userMessage)) {
    return 'inspect';
  }

  if (ACT_KEYWORDS.test(userMessage)) {
    return 'act';
  }

  // Default fallback
  return 'explore';
}
