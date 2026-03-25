import { describe, it, expect, vi } from 'vitest';
import { buildSpace, ECONOMIC_VEHICLES, GOVERNANCE_WORLD_FORMS } from './space-builder';
import type { LLMClient } from '../llm/client';
import type { IntentRoute, PathCheckResult, RealizationCandidate } from '../schemas/decision';

// ─── Mock Helpers ───

function mockLLMClient(response: RealizationCandidate[]): LLMClient {
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

function mockLLMClientFails(): LLMClient {
  return {
    generateStructured: vi.fn().mockResolvedValueOnce({ ok: false, error: 'API down' }),
    generateText: vi.fn(),
  } as unknown as LLMClient;
}

function makeIntentRoute(overrides: Partial<IntentRoute> = {}): IntentRoute {
  return {
    primaryRegime: 'economic',
    confidence: 0.9,
    signals: ['money goal', 'domain bounded'],
    rationale: ['Cash outcome is terminal intent'],
    keyUnknowns: ['vehicle', 'buyer shape'],
    suggestedFollowups: ['Who would pay?'],
    ...overrides,
  };
}

function makePathCheck(overrides: Partial<PathCheckResult> = {}): PathCheckResult {
  return {
    certainty: 'medium',
    route: 'space-builder',
    fixedElements: [{ kind: 'domain', value: 'video-generation' }],
    unresolvedElements: [{ kind: 'form', reason: 'Not yet determined', severity: 'blocking' }],
    recommendedNextStep: 'Generate candidates',
    ...overrides,
  };
}

function makeEconomicCandidate(overrides: Partial<RealizationCandidate> = {}): RealizationCandidate {
  return {
    id: 'video-gen-done-for-you',
    regime: 'economic',
    form: 'service',
    domain: 'video-generation',
    vehicle: 'done_for_you_service',
    description: 'Full video production service for small studios',
    whyThisCandidate: ['Strong edge in video production'],
    assumptions: ['Buyer exists in small studio segment'],
    probeReadinessHints: ['Observable outcome after first delivery'],
    timeToSignal: 'short',
    notes: ['Quick feedback loop via direct client contact'],
    ...overrides,
  };
}

function makeGovernanceCandidate(overrides: Partial<RealizationCandidate> = {}): RealizationCandidate {
  return {
    id: 'creator-commons',
    regime: 'governance',
    form: 'world',
    domain: 'creator-tools',
    worldForm: 'commons',
    description: 'A shared resource space for creator tool reviews',
    whyThisCandidate: ['Strong community demand for tool curation'],
    assumptions: ['State density sufficient for governance cycle'],
    probeReadinessHints: ['Observable outcome from first governance cycle'],
    timeToSignal: 'medium',
    notes: ['Governance pressure from conflicting tool evaluations'],
    ...overrides,
  };
}

// ─── Regime Config Constants ───

describe('Regime config constants', () => {
  it('ECONOMIC_VEHICLES has 7 items', () => {
    expect(ECONOMIC_VEHICLES).toHaveLength(7);
  });

  it('ECONOMIC_VEHICLES contains all canonical vehicles', () => {
    expect(ECONOMIC_VEHICLES).toContain('done_for_you_service');
    expect(ECONOMIC_VEHICLES).toContain('done_with_you_install');
    expect(ECONOMIC_VEHICLES).toContain('workflow_audit');
    expect(ECONOMIC_VEHICLES).toContain('productized_service');
    expect(ECONOMIC_VEHICLES).toContain('template_pack');
    expect(ECONOMIC_VEHICLES).toContain('tool');
    expect(ECONOMIC_VEHICLES).toContain('operator_model');
  });

  it('GOVERNANCE_WORLD_FORMS has 6 items', () => {
    expect(GOVERNANCE_WORLD_FORMS).toHaveLength(6);
  });

  it('GOVERNANCE_WORLD_FORMS contains all canonical world forms', () => {
    expect(GOVERNANCE_WORLD_FORMS).toContain('market');
    expect(GOVERNANCE_WORLD_FORMS).toContain('commons');
    expect(GOVERNANCE_WORLD_FORMS).toContain('town');
    expect(GOVERNANCE_WORLD_FORMS).toContain('port');
    expect(GOVERNANCE_WORLD_FORMS).toContain('night_engine');
    expect(GOVERNANCE_WORLD_FORMS).toContain('managed_knowledge_field');
  });
});

// ─── buildSpace: Economic regime ───

describe('buildSpace: economic regime', () => {
  it('generates economic candidates with domain x vehicle', async () => {
    const candidate = makeEconomicCandidate();
    const llm = mockLLMClient([candidate]);
    const intentRoute = makeIntentRoute({ primaryRegime: 'economic' });
    const pathCheck = makePathCheck();

    const result = await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money with video generation',
      edgeProfile: ['video production'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].regime).toBe('economic');
    expect(result[0].vehicle).toBe('done_for_you_service');
    expect(result[0].domain).toBe('video-generation');
  });

  it('passes regime-specific vehicle list in user prompt for economic', async () => {
    const llm = mockLLMClient([makeEconomicCandidate()]);
    const intentRoute = makeIntentRoute({ primaryRegime: 'economic' });
    const pathCheck = makePathCheck();

    await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
    const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
    const callArgs = generateStructuredMock.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(callArgs.messages[0].content).toContain('Available Vehicles');
    expect(callArgs.messages[0].content).toContain('done_for_you_service');
  });

  it('returns multiple economic candidates', async () => {
    const candidates = [
      makeEconomicCandidate({ id: 'c1', vehicle: 'done_for_you_service' }),
      makeEconomicCandidate({ id: 'c2', vehicle: 'tool', form: 'tool' }),
      makeEconomicCandidate({ id: 'c3', vehicle: 'operator_model', form: 'operator_model' }),
    ];
    const llm = mockLLMClient(candidates);
    const intentRoute = makeIntentRoute({ primaryRegime: 'economic' });
    const pathCheck = makePathCheck();

    const result = await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money with video generation',
    });

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
});

// ─── buildSpace: Governance regime ───

describe('buildSpace: governance regime', () => {
  it('generates governance candidates with worldForm', async () => {
    const candidate = makeGovernanceCandidate();
    const llm = mockLLMClient([candidate]);
    const intentRoute = makeIntentRoute({ primaryRegime: 'governance' });
    const pathCheck = makePathCheck();

    const result = await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to open a self-operating creator commons',
    });

    expect(result).toHaveLength(1);
    expect(result[0].regime).toBe('governance');
    expect(result[0].worldForm).toBe('commons');
    expect(result[0].form).toBe('world');
  });

  it('passes regime-specific world forms in user prompt for governance', async () => {
    const llm = mockLLMClient([makeGovernanceCandidate()]);
    const intentRoute = makeIntentRoute({ primaryRegime: 'governance' });
    const pathCheck = makePathCheck();

    await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to create a world',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
    const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
    const callArgs = generateStructuredMock.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(callArgs.messages[0].content).toContain('Available World Forms');
    expect(callArgs.messages[0].content).toContain('night_engine');
  });
});

// ─── buildSpace: LLM failure ───

describe('buildSpace: error handling', () => {
  it('returns empty array on LLM validation failure', async () => {
    const llm = mockLLMClientFailure('Schema validation failed');
    const intentRoute = makeIntentRoute();
    const pathCheck = makePathCheck();

    const result = await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
    });

    expect(result).toEqual([]);
  });

  it('returns empty array on LLM failure (API down)', async () => {
    const llm = mockLLMClientFails();
    const intentRoute = makeIntentRoute();
    const pathCheck = makePathCheck();

    const result = await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
    });

    expect(result).toEqual([]);
  });

  it('never throws on LLM error', async () => {
    const llm = mockLLMClientFails();
    const intentRoute = makeIntentRoute();
    const pathCheck = makePathCheck();

    await expect(
      buildSpace(llm, intentRoute, pathCheck, { userMessage: 'anything' }),
    ).resolves.toBeDefined();
  });
});

// ─── buildSpace: context passing ───

describe('buildSpace: context passing', () => {
  it('includes edge profile in user prompt when provided', async () => {
    const llm = mockLLMClient([makeEconomicCandidate()]);
    const intentRoute = makeIntentRoute();
    const pathCheck = makePathCheck();

    await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
      edgeProfile: ['video production', 'storytelling'],
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
    const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
    const callArgs = generateStructuredMock.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(callArgs.messages[0].content).toContain('Edge Profile');
    expect(callArgs.messages[0].content).toContain('video production');
    expect(callArgs.messages[0].content).toContain('storytelling');
  });

  it('includes constraints in user prompt when provided', async () => {
    const llm = mockLLMClient([makeEconomicCandidate()]);
    const intentRoute = makeIntentRoute();
    const pathCheck = makePathCheck();

    await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
      constraints: ['budget under $500', 'must work part-time'],
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
    const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
    const callArgs = generateStructuredMock.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(callArgs.messages[0].content).toContain('Constraints');
    expect(callArgs.messages[0].content).toContain('budget under $500');
  });

  it('includes fixed and unresolved elements from path check', async () => {
    const llm = mockLLMClient([makeEconomicCandidate()]);
    const intentRoute = makeIntentRoute();
    const pathCheck = makePathCheck({
      fixedElements: [{ kind: 'domain', value: 'video-generation' }],
      unresolvedElements: [{ kind: 'buyer', reason: 'No buyer identified', severity: 'blocking' }],
    });

    await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
    const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
    const callArgs = generateStructuredMock.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(callArgs.messages[0].content).toContain('Fixed Elements');
    expect(callArgs.messages[0].content).toContain('video-generation');
    expect(callArgs.messages[0].content).toContain('Unresolved Elements');
    expect(callArgs.messages[0].content).toContain('No buyer identified');
  });

  it('includes secondary regimes in user prompt when present', async () => {
    const llm = mockLLMClient([makeEconomicCandidate()]);
    const intentRoute = makeIntentRoute({
      primaryRegime: 'economic',
      secondaryRegimes: ['expression', 'leverage'],
    });
    const pathCheck = makePathCheck();

    await buildSpace(llm, intentRoute, pathCheck, {
      userMessage: 'I want to make money',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, safe to access
    const generateStructuredMock = llm.generateStructured as unknown as ReturnType<typeof vi.fn>;
    const callArgs = generateStructuredMock.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    expect(callArgs.messages[0].content).toContain('Secondary Regimes');
    expect(callArgs.messages[0].content).toContain('expression');
    expect(callArgs.messages[0].content).toContain('leverage');
  });
});
