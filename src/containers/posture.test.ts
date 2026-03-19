import { describe, it, expect } from 'vitest';
import { detectPosture } from './posture';
import type { RoutingContext } from './types';

describe('detectPosture', () => {
  describe('keyword-only detection (no intentType)', () => {
    it('detects act from action keywords', () => {
      const cases = [
        'deploy checkout-service to staging',
        'run the migration script',
        'execute the build pipeline',
        'build the frontend',
        'install the dependencies',
        'start the server',
        'launch the app',
        'fix the broken test',
        'create a new service',
      ];
      for (const msg of cases) {
        expect(detectPosture({ userMessage: msg })).toBe('act');
      }
    });

    it('detects inspect from investigation keywords', () => {
      const cases = [
        'why did the last deploy fail?',
        'diagnose the memory leak',
        'audit the security config',
        'compare staging and production',
        'analyze the performance data',
        'check the deployment logs',
        'review the PR changes',
        'investigate the timeout errors',
      ];
      for (const msg of cases) {
        expect(detectPosture({ userMessage: msg })).toBe('inspect');
      }
    });

    it('detects harvest from capture keywords', () => {
      const cases = [
        'save this as a reusable skill',
        'capture the deployment workflow',
        'remember this pattern for later',
        'extract the method from this work',
        'record this approach',
        'keep this workflow',
      ];
      for (const msg of cases) {
        expect(detectPosture({ userMessage: msg })).toBe('harvest');
      }
    });

    it('defaults to explore for generic messages', () => {
      const cases = [
        'I have a product direction but dont know how',
        'tell me about video generation',
        'what options do I have',
        'hello',
        '',
      ];
      for (const msg of cases) {
        expect(detectPosture({ userMessage: msg })).toBe('explore');
      }
    });
  });

  describe('intentType mapping', () => {
    it('maps confirm to act', () => {
      const ctx: RoutingContext = { userMessage: 'yes, go ahead', intentType: 'confirm' };
      expect(detectPosture(ctx)).toBe('act');
    });

    it('maps settle_signal to act (without harvest keywords)', () => {
      const ctx: RoutingContext = { userMessage: 'lets finalize this', intentType: 'settle_signal' };
      expect(detectPosture(ctx)).toBe('act');
    });

    it('maps settle_signal + harvest keyword to harvest', () => {
      const ctx: RoutingContext = {
        userMessage: 'save this as a reusable skill',
        intentType: 'settle_signal',
      };
      expect(detectPosture(ctx)).toBe('harvest');
    });

    it('maps question to inspect', () => {
      const ctx: RoutingContext = { userMessage: 'how does this work', intentType: 'question' };
      expect(detectPosture(ctx)).toBe('inspect');
    });

    it('maps query_status to inspect', () => {
      const ctx: RoutingContext = { userMessage: 'whats the status', intentType: 'query_status' };
      expect(detectPosture(ctx)).toBe('inspect');
    });

    it('maps query_history to inspect', () => {
      const ctx: RoutingContext = {
        userMessage: 'show me previous runs',
        intentType: 'query_history',
      };
      expect(detectPosture(ctx)).toBe('inspect');
    });

    it('falls back to keyword detection for other intent types', () => {
      const ctx: RoutingContext = { userMessage: 'deploy the service', intentType: 'new_intent' };
      expect(detectPosture(ctx)).toBe('act');
    });

    it('falls back to explore when intentType is unmapped and no keywords match', () => {
      const ctx: RoutingContext = {
        userMessage: 'I want to explore options',
        intentType: 'add_info',
      };
      expect(detectPosture(ctx)).toBe('explore');
    });
  });

  describe('priority: harvest > inspect > act', () => {
    it('harvest keyword wins over act keyword', () => {
      const ctx: RoutingContext = { userMessage: 'save and deploy this' };
      expect(detectPosture(ctx)).toBe('harvest');
    });

    it('inspect keyword wins over act keyword', () => {
      const ctx: RoutingContext = { userMessage: 'check why the build failed' };
      expect(detectPosture(ctx)).toBe('inspect');
    });
  });
});
