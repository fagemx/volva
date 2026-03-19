import { describe, it, expect, vi } from 'vitest';
import { classifyIntent } from './intent-router';
import type { LLMClient } from '../llm/client';
import type { IntentRoute } from '../schemas/decision';

// ─── Mock Helpers ───

function mockLLMClient(response: IntentRoute): LLMClient {
  return {
    generateStructured: vi.fn().mockResolvedValueOnce({
      ok: true,
      data: response,
    }),
    generateText: vi.fn(),
  } as unknown as LLMClient;
}

function mockLLMClientFailure(error: string): LLMClient {
  return {
    generateStructured: vi.fn().mockResolvedValueOnce({
      ok: false,
      error,
    }),
    generateText: vi.fn(),
  } as unknown as LLMClient;
}

// ─── Test Cases (from router-test-cases.md) ───

describe('Intent Router: classifyIntent', () => {
  // ═══════════════════════════════════════════
  // Group A: Economic regime
  // ═══════════════════════════════════════════
  describe('Group A: Economic regime', () => {
    it('A1: classifies clear money intent as economic', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'economic',
        confidence: 0.95,
        signals: ['money goal', 'explicit budget', 'no domain fixed'],
        rationale: ['Cash outcome is the terminal intent'],
        keyUnknowns: ['edge profile', 'buyer proximity', 'time horizon'],
        suggestedFollowups: ['What are you better at than most people?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(llm, 'I want to make money, here is $1000');
      expect(result.primaryRegime).toBe('economic');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('A2: classifies money + domain as economic with expression secondary', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'economic',
        secondaryRegimes: ['expression'],
        confidence: 0.88,
        signals: ['money goal', 'domain bounded by video generation'],
        rationale: ['Video generation is domain, money is terminal intent'],
        keyUnknowns: ['vehicle', 'buyer', 'edge within video generation'],
        suggestedFollowups: ['What part of video generation are you strongest at?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(llm, 'I want to make money with video generation');
      expect(result.primaryRegime).toBe('economic');
      expect(result.secondaryRegimes).toContain('expression');
    });

    it('A3: classifies commercializing leverage edge as economic', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'economic',
        secondaryRegimes: ['leverage'],
        confidence: 0.82,
        signals: ['commercial intent', 'leverage as means'],
        rationale: ['Monetizing a leverage skill'],
        keyUnknowns: ['buyer shape', 'offer shape', 'payment model'],
        suggestedFollowups: ['Who would pay for this?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to help designers install AI workflows and maybe make money from it',
      );
      expect(result.primaryRegime).toBe('economic');
    });
  });

  // ═══════════════════════════════════════════
  // Group B: Capability vs Leverage
  // ═══════════════════════════════════════════
  describe('Group B: Capability vs Leverage', () => {
    it('B1: classifies mastery intent as capability', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'capability',
        secondaryRegimes: ['leverage'],
        confidence: 0.9,
        signals: ['mastery language', 'workflow familiarity goal'],
        rationale: ['Terminal intent is skill acquisition'],
        keyUnknowns: ['current level', 'target quality bar', 'practice frequency'],
        suggestedFollowups: ['Where are you stuck right now?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(llm, 'I want to master the video generation workflow');
      expect(result.primaryRegime).toBe('capability');
    });

    it('B2: classifies automation intent as leverage', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'leverage',
        confidence: 0.91,
        signals: ['time cost', 'automation desire', 'repetitive task'],
        rationale: ['Terminal intent is saving time and reducing friction'],
        keyUnknowns: ['bottleneck definition', 'frequency', 'baseline time cost'],
        suggestedFollowups: ['Which step takes the most time?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I spend too much time organizing assets every day, I want to automate this',
      );
      expect(result.primaryRegime).toBe('leverage');
    });

    it('B3: classifies learning to design automation as capability', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'capability',
        secondaryRegimes: ['leverage'],
        confidence: 0.87,
        signals: ['learning intent', 'design skill'],
        rationale: ['Goal is learning to design, not immediate time saving'],
        keyUnknowns: ['current level', 'target skill bar'],
        suggestedFollowups: ['What kind of automations have you tried before?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to learn how to design actually useful automation flows',
      );
      expect(result.primaryRegime).toBe('capability');
    });
  });

  // ═══════════════════════════════════════════
  // Group C: Expression vs Economic
  // ═══════════════════════════════════════════
  describe('Group C: Expression vs Economic', () => {
    it('C1: classifies taste-driven work with money secondary as expression', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'expression',
        secondaryRegimes: ['economic'],
        confidence: 0.85,
        signals: ['taste/aesthetic language', 'work completion'],
        rationale: ['Primary goal is the work and its taste'],
        keyUnknowns: ['medium/form', 'completion scope', 'what "stylish" means'],
        suggestedFollowups: ['What feeling do you want to preserve?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to make a very stylish ancient-style short film, if it makes money even better',
      );
      expect(result.primaryRegime).toBe('expression');
      expect(result.secondaryRegimes).toContain('economic');
    });

    it('C2: classifies selling with aesthetic edge as economic', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'economic',
        secondaryRegimes: ['expression'],
        confidence: 0.84,
        signals: ['sell intent', 'aesthetic as edge'],
        rationale: ['Terminal goal is selling; aesthetics is the edge, not the end'],
        keyUnknowns: ['vehicle', 'buyer shape'],
        suggestedFollowups: ['Who would buy this?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to use my aesthetics and storyboarding ability to make something I can sell',
      );
      expect(result.primaryRegime).toBe('economic');
    });

    it('C3: classifies pure medium search as expression', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'expression',
        confidence: 0.92,
        signals: ['medium search', 'story carrier'],
        rationale: ['Classic medium-bearing question'],
        keyUnknowns: ['story properties', 'candidate media', 'completion constraints'],
        suggestedFollowups: ['What feeling should this story evoke?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to find the best form to carry this story, not necessarily video',
      );
      expect(result.primaryRegime).toBe('expression');
    });
  });

  // ═══════════════════════════════════════════
  // Group D: Governance
  // ═══════════════════════════════════════════
  describe('Group D: Governance', () => {
    it('D1: classifies self-operating place as governance', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'governance',
        confidence: 0.93,
        signals: ['world/space language', 'self-operating place', 'AI as operator'],
        rationale: ['Terminal intent is to create and govern a consequential space'],
        keyUnknowns: ['world form', 'pressure source', 'outcome surface'],
        suggestedFollowups: ['What kind of place: market, commons, or something else?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to open a self-operating place and let AI run it',
      );
      expect(result.primaryRegime).toBe('governance');
    });

    it('D2: classifies creator market with economic secondary as governance', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'governance',
        secondaryRegimes: ['economic'],
        confidence: 0.88,
        signals: ['market creation', 'night engine', 'monetization secondary'],
        rationale: ['Primary is building a place; monetization is secondary wish'],
        keyUnknowns: ['market vs night-engine form', 'pressure sources'],
        suggestedFollowups: ['Where would the pressure come from in this place?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to make a creator market that runs itself at night, maybe monetize later',
      );
      expect(result.primaryRegime).toBe('governance');
      expect(result.secondaryRegimes).toContain('economic');
    });

    it('D3: classifies self-governing system as governance not leverage', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'governance',
        secondaryRegimes: ['leverage'],
        confidence: 0.86,
        signals: ['self-governing', 'rule-changing', 'judgment'],
        rationale: ['Core is governance/judgment, not mere automation'],
        keyUnknowns: ['world form', 'consequence structure'],
        suggestedFollowups: ['What consequences should this system bear?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want a system that observes, proposes changes, and modifies its own rules',
      );
      expect(result.primaryRegime).toBe('governance');
    });
  });

  // ═══════════════════════════════════════════
  // Group E: Identity
  // ═══════════════════════════════════════════
  describe('Group E: Identity', () => {
    it('E1: classifies career transition as identity', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'identity',
        secondaryRegimes: ['economic'],
        confidence: 0.86,
        signals: ['role transition', 'life path change'],
        rationale: ['Primary concern is path transition, not immediate execution'],
        keyUnknowns: ['reversibility requirement', 'timeline', 'current constraints'],
        suggestedFollowups: ['Do you want a reversible trial or are you ready to commit?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to gradually transition from freelancing to making my own product',
      );
      expect(result.primaryRegime).toBe('identity');
    });

    it('E2: classifies life-fit question as identity not capability', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'identity',
        secondaryRegimes: ['capability'],
        confidence: 0.83,
        signals: ['self-fit', 'long-term path'],
        rationale: ['Primary is life-path question, AI is path content'],
        keyUnknowns: ['values', 'current strengths', 'risk tolerance'],
        suggestedFollowups: ['What would a good day look like in 2 years?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        "I'm not sure if I should focus on AI, I want to know which path fits me long-term",
      );
      expect(result.primaryRegime).toBe('identity');
    });

    it('E3: classifies lifestyle change as identity not economic', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'identity',
        secondaryRegimes: ['economic'],
        confidence: 0.88,
        signals: ['lifestyle change', 'role escape'],
        rationale: ['Asking about life structure, not business model'],
        keyUnknowns: ['what to keep', 'what to leave', 'timeline'],
        suggestedFollowups: ['What can you not afford to lose right now?'],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I want to change my lifestyle, I am tired of always chasing the next project',
      );
      expect(result.primaryRegime).toBe('identity');
    });
  });

  // ═══════════════════════════════════════════
  // Group F: High certainty (no followup needed)
  // ═══════════════════════════════════════════
  describe('Group F: High certainty / should not over-explore', () => {
    it('F1: classifies detailed governance request without followup', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'governance',
        confidence: 0.97,
        signals: ['explicit world form', 'explicit cycle', 'build request'],
        rationale: ['World form and cycle are already specified'],
        keyUnknowns: [],
        suggestedFollowups: [],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'Build Midnight Market, 2 zones, 3 chiefs, run observe-judge-apply-outcome, give me the engineering plan',
      );
      expect(result.primaryRegime).toBe('governance');
      expect(result.suggestedFollowups).toHaveLength(0);
    });

    it('F2: classifies expert pipeline request as leverage without followup', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'leverage',
        secondaryRegimes: ['expression'],
        confidence: 0.91,
        signals: ['automation pipeline', 'expert self-identification'],
        rationale: ['Terminal intent is systematizing production'],
        keyUnknowns: [],
        suggestedFollowups: [],
      };
      const llm = mockLLMClient(expected);
      const result = await classifyIntent(
        llm,
        'I am a video generation expert, plan me an automated pipeline from concept to publish',
      );
      expect(result.primaryRegime).toBe('leverage');
      expect(result.suggestedFollowups).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════
  // Confusion pairs (same domain, different regime)
  // ═══════════════════════════════════════════
  describe('Confusion pairs', () => {
    it('Pair 1: same domain (video) - money=economic vs taste=expression', async () => {
      const economicRoute: IntentRoute = {
        primaryRegime: 'economic',
        confidence: 0.88,
        signals: ['money goal'],
        rationale: ['Money is terminal'],
        keyUnknowns: ['vehicle'],
        suggestedFollowups: ['Who would pay?'],
      };
      const expressionRoute: IntentRoute = {
        primaryRegime: 'expression',
        confidence: 0.9,
        signals: ['taste/aesthetic'],
        rationale: ['Taste is terminal'],
        keyUnknowns: ['medium'],
        suggestedFollowups: ['What feeling?'],
      };

      const llm1 = mockLLMClient(economicRoute);
      const r1 = await classifyIntent(llm1, 'I want to make money with video generation');
      expect(r1.primaryRegime).toBe('economic');

      const llm2 = mockLLMClient(expressionRoute);
      const r2 = await classifyIntent(
        llm2,
        'I want to express a certain taste through video generation',
      );
      expect(r2.primaryRegime).toBe('expression');
    });

    it('Pair 2: same domain (workflow) - master=capability vs automate=leverage', async () => {
      const capRoute: IntentRoute = {
        primaryRegime: 'capability',
        confidence: 0.9,
        signals: ['mastery'],
        rationale: ['Skill acquisition'],
        keyUnknowns: ['current level'],
        suggestedFollowups: ['Where are you stuck?'],
      };
      const levRoute: IntentRoute = {
        primaryRegime: 'leverage',
        confidence: 0.91,
        signals: ['automation'],
        rationale: ['Time saving'],
        keyUnknowns: ['bottleneck'],
        suggestedFollowups: ['Which step takes longest?'],
      };

      const llm1 = mockLLMClient(capRoute);
      const r1 = await classifyIntent(llm1, 'I want to master this workflow');
      expect(r1.primaryRegime).toBe('capability');

      const llm2 = mockLLMClient(levRoute);
      const r2 = await classifyIntent(llm2, 'I want to automate this workflow');
      expect(r2.primaryRegime).toBe('leverage');
    });

    it('Pair 4: freelance-to-product=identity vs fastest-money-product=economic', async () => {
      const idRoute: IntentRoute = {
        primaryRegime: 'identity',
        confidence: 0.86,
        signals: ['role transition'],
        rationale: ['Path transition'],
        keyUnknowns: ['reversibility'],
        suggestedFollowups: ['Reversible trial or commit?'],
      };
      const econRoute: IntentRoute = {
        primaryRegime: 'economic',
        confidence: 0.92,
        signals: ['money goal', 'speed'],
        rationale: ['Fastest money is terminal'],
        keyUnknowns: ['edge profile'],
        suggestedFollowups: ['What are you best at?'],
      };

      const llm1 = mockLLMClient(idRoute);
      const r1 = await classifyIntent(
        llm1,
        'I want to transition from freelance to my own product',
      );
      expect(r1.primaryRegime).toBe('identity');

      const llm2 = mockLLMClient(econRoute);
      const r2 = await classifyIntent(
        llm2,
        'I want to find the fastest product direction to make money',
      );
      expect(r2.primaryRegime).toBe('economic');
    });
  });

  // ═══════════════════════════════════════════
  // Fallback behavior (LLM failure)
  // ═══════════════════════════════════════════
  describe('Fallback behavior', () => {
    it('returns low-confidence economic fallback when LLM fails', async () => {
      const llm = mockLLMClientFailure('API timeout');
      const result = await classifyIntent(llm, 'some message');

      expect(result.primaryRegime).toBe('economic');
      expect(result.confidence).toBeLessThanOrEqual(0.3);
      expect(result.keyUnknowns).toContain('regime unclear');
      expect(result.suggestedFollowups.length).toBeGreaterThan(0);
    });

    it('never throws on LLM error', async () => {
      const llm = mockLLMClientFailure('Network error');
      await expect(classifyIntent(llm, 'anything')).resolves.toBeDefined();
    });
  });

  // ═══════════════════════════════════════════
  // Context passing
  // ═══════════════════════════════════════════
  describe('Context passing', () => {
    it('passes conversation history to LLM when provided', async () => {
      const expected: IntentRoute = {
        primaryRegime: 'economic',
        confidence: 0.85,
        signals: ['money goal'],
        rationale: ['Cash outcome'],
        keyUnknowns: ['vehicle'],
        suggestedFollowups: ['Who would pay?'],
      };
      const llm = mockLLMClient(expected);
      await classifyIntent(llm, 'I want to make money', {
        conversationHistory: 'Previous turn: user discussed video generation',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
      const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
      const callArgs = generateStructuredMock.mock.calls[0][0] as {
        messages: { content: string }[];
      };
      expect(callArgs.messages[0].content).toContain(
        'Previous turn: user discussed video generation',
      );
    });
  });
});
