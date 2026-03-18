# B2: Router Tests + Follow-up Generation

> **Module**: `src/decision/intent-router.test.ts`
> **Layer**: L1
> **Dependencies**: B1 (intent-router.ts), Track A (Zod schemas)
> **Blocks**: D (Space Builder depends on verified router output)

---

## Bootstrap

```bash
cat docs/world-design-v0/router-test-cases.md           # 15+ canonical test cases
cat docs/world-design-v0/intent-router.md                # Section 11: regime-specific followups, Section 14: low confidence handling
cat src/decision/intent-router.ts                        # B1 output: classifyIntent + REGIME_CLASSIFICATION_PROMPT
cat src/schemas/decision.ts                              # IntentRouteSchema, Regime
cat src/llm/intent-parser.ts                             # existing mock pattern reference
cat docs/plan-world-design/CONTRACT.md                   # TEST-01, LLM-01
bun run build                                            # verify baseline
bun test                                                 # verify existing tests pass
```

---

## Final Result

- `src/decision/intent-router.test.ts` with 15+ test cases covering all 6 regimes
- LLM mocked via `vi.mock('@anthropic-ai/sdk')` (never calls real LLM)
- Covers: clear cases, confusion pairs, low confidence fallback, follow-up quality
- `bun test src/decision/intent-router.test.ts` all pass

---

## Implementation

### Step 1: Test Infrastructure Setup

```typescript
// src/decision/intent-router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent } from './intent-router';
import type { LLMClient } from '../llm/client';
import type { IntentRoute } from '../schemas/decision';

// Mock LLM client factory
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
```

### Step 2: Test Group A -- Economic vs Others (from router-test-cases.md Section 4)

```typescript
describe('Group A: Economic regime', () => {
  // A1: Clear economic intent
  it('classifies "I want to make money, here is $1000" as economic', async () => {
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

  // A2: Economic with domain (video generation as means, not end)
  it('classifies "I want to make money with video generation" as economic + expression secondary', async () => {
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

  // A3: Economic + leverage (commercializing a leverage edge)
  it('classifies "help designers install AI workflows, maybe make money" as economic + leverage', async () => {
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
```

### Step 3: Test Group B -- Capability vs Leverage (from router-test-cases.md Section 5)

```typescript
describe('Group B: Capability vs Leverage', () => {
  // B1: Mastery intent -> capability
  it('classifies "I want to master the video generation workflow" as capability', async () => {
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

  // B2: Automation intent -> leverage
  it('classifies "I spend too much time organizing assets, I want to automate this" as leverage', async () => {
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

  // B3: Learning to design automation -> capability (not leverage)
  it('classifies "I want to learn how to design useful automation flows" as capability', async () => {
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
```

### Step 4: Test Group C -- Expression vs Economic (from router-test-cases.md Section 6)

```typescript
describe('Group C: Expression vs Economic', () => {
  // C1: Taste-driven, money secondary -> expression
  it('classifies "make a stylish ancient-style short film, money would be nice" as expression', async () => {
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

  // C2: Selling with aesthetic edge -> economic (not expression)
  it('classifies "I want to use my aesthetics and storyboarding to make something sellable" as economic', async () => {
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

  // C3: Pure medium search -> expression
  it('classifies "find the best form for this story, not necessarily video" as expression', async () => {
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
```

### Step 5: Test Group D -- Governance (from router-test-cases.md Section 7)

```typescript
describe('Group D: Governance', () => {
  // D1: Classic governance
  it('classifies "open a self-operating place, let AI run it" as governance', async () => {
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

  // D2: Governance + economic secondary
  it('classifies "make a creator market with night-engine, maybe monetize later" as governance', async () => {
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

  // D3: Self-governing system -> governance (not leverage)
  it('classifies "a system that observes, proposes, and changes its own rules" as governance', async () => {
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
```

### Step 6: Test Group E -- Identity (from router-test-cases.md Section 8)

```typescript
describe('Group E: Identity', () => {
  // E1: Career transition -> identity
  it('classifies "gradually transition from freelance to my own product" as identity', async () => {
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

  // E2: Life fit question -> identity (not capability)
  it('classifies "should I focus on AI, which path fits me long-term" as identity', async () => {
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

  // E3: Lifestyle change -> identity (not economic)
  it('classifies "change my lifestyle, stop chasing projects" as identity', async () => {
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
```

### Step 7: Test Group F -- High Certainty Cases (from router-test-cases.md Section 9)

```typescript
describe('Group F: High certainty / should not over-explore', () => {
  // F1: Fully specified governance -> router just classifies, does not expand
  it('classifies detailed Midnight Market request as governance without followup', async () => {
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

  // F2: Expert with clear pipeline request -> leverage
  it('classifies "video expert, plan an automated pipeline concept-to-publish" as leverage', async () => {
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
  });
});
```

### Step 8: LLM Failure Fallback Test

```typescript
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
```

### Step 9: Confusion Pair Tests (from router-test-cases.md Section 10)

```typescript
describe('Confusion pairs', () => {
  it('same domain (video), different regime: money=economic, taste=expression', async () => {
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
    const r2 = await classifyIntent(llm2, 'I want to express a certain taste through video generation');
    expect(r2.primaryRegime).toBe('expression');
  });

  it('same domain (workflow), different regime: master=capability, automate=leverage', async () => {
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

  it('freelance-to-product=identity, fastest-money-product=economic', async () => {
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
    const r1 = await classifyIntent(llm1, 'I want to transition from freelance to my own product');
    expect(r1.primaryRegime).toBe('identity');

    const llm2 = mockLLMClient(econRoute);
    const r2 = await classifyIntent(llm2, 'I want to find the fastest product direction to make money');
    expect(r2.primaryRegime).toBe('economic');
  });
});
```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. All tests pass
bun test src/decision/intent-router.test.ts

# 4. Test count >= 15
grep -c "it(" src/decision/intent-router.test.ts
# Expected: >= 15

# 5. All 6 regimes tested
grep -c "primaryRegime.*economic\|primaryRegime.*capability\|primaryRegime.*leverage\|primaryRegime.*expression\|primaryRegime.*governance\|primaryRegime.*identity" src/decision/intent-router.test.ts
# Expected: >= 6

# 6. Fallback tested
grep -c "fallback\|LLM fail" src/decision/intent-router.test.ts
# Expected: >= 2

# 7. Confusion pairs tested
grep -c "Confusion pair" src/decision/intent-router.test.ts
# Expected: >= 1
```

## Git Commit

```
test(decision): add 15+ test cases for intent router classification

Cover all 6 regimes, confusion pairs (same domain different regime),
low-confidence fallback, and high-certainty no-followup cases.
Tests from router-test-cases.md spec. LLM mocked via vi.mock.
```
