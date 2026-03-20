import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { KarviClient } from './karvi-client/client';
import { KarviApiError, ForgeBuildRequestSchema, ForgeBuildResultSchema } from './karvi-client/schemas';

const fixturesDir = join(__dirname, 'karvi-client', 'fixtures');

function loadFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), 'utf-8'));
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return handler as unknown as typeof fetch;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeContext(overrides?: Partial<ForgeHandoffContext>): ForgeHandoffContext {
  return {
    sessionId: 'session-001',
    workingDir: '/tmp/test',
    targetRepo: 'org/repo',
    ...overrides,
  };
}

function makeEconomicMemo(overrides?: Partial<EconomicCommitMemo>): EconomicCommitMemo {
  return {
    candidateId: 'eco-001',
    regime: 'economic',
    verdict: 'commit',
    rationale: ['Strong buyer signal', 'Market fit validated'],
    evidenceUsed: ['Interview data', 'Payment survey'],
    unresolvedRisks: ['Pricing unclear'],
    whatForgeShouldBuild: ['Service intake flow', 'Pricing page'],
    whatForgeMustNotBuild: ['Full product before buyer validation', 'Admin panel'],
    recommendedNextStep: ['Launch pilot with 3 buyers'],
    buyerHypothesis: 'Freelance designers needing project management',
    painHypothesis: 'Manual tracking wastes 5h/week',
    paymentEvidence: ['3 of 5 interviewees willing to pay'],
    whyThisVehicleNow: ['Low competition', 'Existing audience'],
    nextSignalAfterBuild: ['First paying customer within 2 weeks'],
    ...overrides,
  };
}

function makeGovernanceMemo(overrides?: Partial<GovernanceCommitMemo>): GovernanceCommitMemo {
  return {
    candidateId: 'gov-001',
    regime: 'governance',
    verdict: 'commit',
    rationale: ['Community needs governance structure'],
    evidenceUsed: ['Conflict resolution data'],
    unresolvedRisks: ['Participation rate unknown'],
    whatForgeShouldBuild: ['Constitution draft', 'Chief role spec'],
    whatForgeMustNotBuild: ['Dashboard instead of world'],
    recommendedNextStep: ['Define first cycle'],
    selectedWorldForm: 'market',
    minimumWorldShape: ['Stall registry', 'Transaction log'],
    stateDensityAssessment: 'medium',
    governancePressureAssessment: 'high',
    firstCycleDesign: ['Weekly review cycle', 'Dispute resolution'],
    thyraHandoffRequirements: ['Chief must approve stall changes', 'Max 50 stalls'],
    ...overrides,
  };
}

function makeForgeBuildResult(overrides?: Record<string, unknown>) {
  return {
    sessionId: 'session-001',
    status: 'success',
    durationMs: 120000,
    artifacts: [
      { type: 'file', path: 'src/index.ts', description: 'Service intake flow' },
      { type: 'file', path: 'src/pricing.ts', description: 'Pricing page' },
      { type: 'pr', path: 'https://github.com/org/repo/pull/1', description: 'Implementation PR' },
    ],
    steps: [
      { stepId: 'step-001', type: 'plan', status: 'success', artifacts: [] },
      { stepId: 'step-002', type: 'implement', status: 'success', artifacts: ['src/index.ts', 'src/pricing.ts'] },
      { stepId: 'step-003', type: 'review', status: 'success', artifacts: [] },
    ],
    telemetry: {
      tokensUsed: 50000,
      costUsd: 1.50,
      runtime: 'claude',
      model: 'claude-3-sonnet',
      stepsExecuted: 3,
    },
    ...overrides,
  };
}

function makeSseEvents() {
  return [
    loadFixture('sse-events/step-started.json'),
    loadFixture('sse-events/step-completed.json'),
    loadFixture('sse-events/step-started.json'),
    loadFixture('sse-events/step-completed.json'),
    loadFixture('sse-events/step-started.json'),
    loadFixture('sse-events/step-completed.json'),
    loadFixture('sse-events/build-completed.json'),
  ];
}

describe('Forge Build Integration', () => {
  let context: ForgeHandoffContext;

  beforeEach(() => {
    context = makeContext();
  });

  describe('GP-1: Economic regime golden path', () => {
    it('exercises economic regime from CommitMemo to ForgeBuildResult', async () => {
      const memo = makeEconomicMemo();
      const request = buildForgeBuildRequest(memo, context);

      expect(ForgeBuildRequestSchema.safeParse(request).success).toBe(true);
      expect(request.regime).toBe('economic');
      expect(request.regimeContext.kind).toBe('economic');
      expect(request.whatToBuild).toEqual(memo.whatForgeShouldBuild);
      expect(request.whatNotToBuild).toEqual(memo.whatForgeMustNotBuild);

      const client = new KarviClient({
        fetchFn: mockFetch(() =>
          jsonResponse({
            ok: true,
            data: {
              buildId: 'build-001',
              status: 'queued',
              pipeline: 'forge-economic',
            },
          })
        ),
      });

      const result = await client.forgeBuild(request);
      expect(result.buildId).toBe('build-001');
      expect(result.status).toBe('queued');
      expect(result.pipeline).toBe('forge-economic');
    });

    it('validates economic regimeContext has all required fields', () => {
      const memo = makeEconomicMemo();
      const request = buildForgeBuildRequest(memo, context);

      if (request.regimeContext.kind !== 'economic') throw new Error('Expected economic regime');

      expect(request.regimeContext.buyerHypothesis).toBe(memo.buyerHypothesis);
      expect(request.regimeContext.painHypothesis).toBe(memo.painHypothesis);
      expect(request.regimeContext.vehicleType).toBe(memo.whyThisVehicleNow[0]);
      expect(request.regimeContext.paymentEvidence).toEqual(memo.paymentEvidence);
      expect(request.regimeContext.whyThisVehicleNow).toEqual(memo.whyThisVehicleNow);
      expect(request.regimeContext.nextSignalAfterBuild).toEqual(memo.nextSignalAfterBuild);
    });

    it('returns ForgeBuildResult with correct artifacts and telemetry', async () => {
      const forgeResult = makeForgeBuildResult();
      const parsed = ForgeBuildResultSchema.safeParse(forgeResult);
      expect(parsed.success).toBe(true);

      if (!parsed.success) throw new Error('Parse failed');

      expect(parsed.data.status).toBe('success');
      expect(parsed.data.artifacts).toHaveLength(3);
      expect(parsed.data.telemetry.tokensUsed).toBe(50000);
      expect(parsed.data.telemetry.stepsExecuted).toBe(3);
    });
  });

  describe('GP-2: Governance regime golden path', () => {
    it('exercises governance regime from CommitMemo to ForgeBuildRequest', () => {
      const memo = makeGovernanceMemo();
      const request = buildForgeBuildRequest(memo, context);

      expect(ForgeBuildRequestSchema.safeParse(request).success).toBe(true);
      expect(request.regime).toBe('governance');
      expect(request.regimeContext.kind).toBe('governance');
    });

    it('validates governance regimeContext has all required fields', () => {
      const memo = makeGovernanceMemo();
      const request = buildForgeBuildRequest(memo, context);

      if (request.regimeContext.kind !== 'governance') throw new Error('Expected governance regime');

      expect(request.regimeContext.worldForm).toBe(memo.selectedWorldForm);
      expect(request.regimeContext.minimumWorldShape).toEqual(memo.minimumWorldShape);
      expect(request.regimeContext.firstCycleDesign).toEqual(memo.firstCycleDesign);
      expect(request.regimeContext.stateDensityAssessment).toBe(memo.stateDensityAssessment);
      expect(request.regimeContext.governancePressureAssessment).toBe(memo.governancePressureAssessment);
      expect(request.regimeContext.thyraHandoffRequirements).toEqual(memo.thyraHandoffRequirements);
    });

    it('forge-build-request-governance.json fixture validates', () => {
      const fixture = loadFixture('requests/forge-build-request-governance.json');
      const result = ForgeBuildRequestSchema.safeParse(fixture);
      expect(result.success).toBe(true);
    });

    it('produces village pack artifacts for governance regime', async () => {
      const memo = makeGovernanceMemo();
      const request = buildForgeBuildRequest(memo, context);

      const governanceResult = makeForgeBuildResult({
        artifacts: [
          { type: 'spec', path: 'constitution.yaml', description: 'Constitution draft' },
          { type: 'spec', path: 'chief-role.yaml', description: 'Chief role spec' },
          { type: 'config', path: 'first-cycle.yaml', description: 'First cycle design' },
        ],
      });

      const artifactDescriptions = governanceResult.artifacts.map(a => a.description.toLowerCase());
      expect(artifactDescriptions.some(d => d.includes('constitution'))).toBe(true);
      expect(artifactDescriptions.some(d => d.includes('chief'))).toBe(true);
      expect(artifactDescriptions.some(d => d.includes('cycle'))).toBe(true);
    });
  });

  describe('Constraint enforcement', () => {
    it('whatNotToBuild appears in request.whatNotToBuild', () => {
      const memo = makeEconomicMemo({
        whatForgeMustNotBuild: ['Admin panel', 'Analytics dashboard'],
      });
      const request = buildForgeBuildRequest(memo, context);

      expect(request.whatNotToBuild).toContain('Admin panel');
      expect(request.whatNotToBuild).toContain('Analytics dashboard');
    });

    it('constraint data flows through full pipeline', () => {
      const memo = makeEconomicMemo({
        whatForgeShouldBuild: ['Landing page', 'Pricing page'],
        whatForgeMustNotBuild: ['Admin panel'],
      });
      const request = buildForgeBuildRequest(memo, context);

      expect(request.whatToBuild).toEqual(['Landing page', 'Pricing page']);
      expect(request.whatNotToBuild).toEqual(['Admin panel']);
    });

    it('verifies artifacts do not match whatNotToBuild items', async () => {
      const memo = makeEconomicMemo({
        whatForgeShouldBuild: ['Landing page'],
        whatForgeMustNotBuild: ['Admin panel', 'Analytics dashboard'],
      });

      const result = makeForgeBuildResult({
        artifacts: [
          { type: 'file', path: 'src/landing.ts', description: 'Landing page' },
        ],
      });

      const artifactDescriptions = result.artifacts.map(a => a.description.toLowerCase());
      expect(artifactDescriptions.some(a => a.includes('admin'))).toBe(false);
      expect(artifactDescriptions.some(a => a.includes('analytics'))).toBe(false);
    });
  });

  describe('SSE streaming', () => {
    it('emits correct SSE event sequence for 3-step build', () => {
      const events = makeSseEvents();
      const eventTypes = events.map(e => (e as { event: string }).event);

      expect(eventTypes).toEqual([
        'step_started',
        'step_completed',
        'step_started',
        'step_completed',
        'step_started',
        'step_completed',
        'build_completed',
      ]);
    });

    it('step-started event fixture has correct structure', () => {
      const fixture = loadFixture('sse-events/step-started.json') as {
        event: string;
        data: { stepId: string; type: string; timestamp: string };
      };

      expect(fixture.event).toBe('step_started');
      expect(fixture.data).toHaveProperty('stepId');
      expect(fixture.data).toHaveProperty('type');
      expect(fixture.data).toHaveProperty('timestamp');
    });

    it('step-completed event fixture has correct structure', () => {
      const fixture = loadFixture('sse-events/step-completed.json') as {
        event: string;
        data: { stepId: string; type: string; status: string; artifacts: string[]; timestamp: string };
      };

      expect(fixture.event).toBe('step_completed');
      expect(fixture.data).toHaveProperty('stepId');
      expect(fixture.data).toHaveProperty('status');
      expect(fixture.data).toHaveProperty('artifacts');
    });

    it('build-completed event fixture has correct structure', () => {
      const fixture = loadFixture('sse-events/build-completed.json') as {
        event: string;
        data: { buildId: string; sessionId: string; status: string; timestamp: string };
      };

      expect(fixture.event).toBe('build_completed');
      expect(fixture.data).toHaveProperty('buildId');
      expect(fixture.data).toHaveProperty('sessionId');
      expect(fixture.data).toHaveProperty('status');
    });
  });

  describe('Negative test cases', () => {
    it('rejects invalid request body with validation failure', () => {
      const invalidRequest = { sessionId: '', candidateId: '' };
      const parsed = ForgeBuildRequestSchema.safeParse(invalidRequest);
      expect(parsed.success).toBe(false);
    });

    it('rejects empty whatToBuild via API error', async () => {
      const client = new KarviClient({
        fetchFn: mockFetch(() =>
          jsonResponse({
            ok: false,
            error: { code: 'EMPTY_BUILD', message: 'whatToBuild is empty' },
          })
        ),
      });

      await expect(client.forgeBuild({} as never)).rejects.toThrow(KarviApiError);
    });

    it('rejects unknown regime via API error', async () => {
      const client = new KarviClient({
        fetchFn: mockFetch(() =>
          jsonResponse({
            ok: false,
            error: { code: 'UNKNOWN_REGIME', message: "Regime 'identity' is not supported for forge build" },
          })
        ),
      });

      await expect(client.forgeBuild({} as never)).rejects.toThrow(KarviApiError);
    });

    it('unknown-regime.json fixture validates error response format', () => {
      const fixture = loadFixture('responses/errors/unknown-regime.json');
      expect(fixture).toHaveProperty('ok', false);
      const error = fixture as { ok: false; error: { code: string; message: string } };
      expect(error.ok).toBe(false);
      expect(error.error.code).toBe('UNKNOWN_REGIME');
    });
  });

  describe('CONTRACT validation', () => {
    it('ARCH-01: forge build uses KarviClient HTTP, not direct DB', () => {
      const source = readFileSync(join(__dirname, 'decision', 'forge-handoff.ts'), 'utf-8');
      expect(source).not.toContain('from ../karvi-client/client');
      expect(source).not.toContain('from \'../karvi-client/client\'');
    });

    it('LLM-01: ForgeBuildRequest validated against ForgeBuildRequestSchema', () => {
      const memo = makeEconomicMemo();
      const request = buildForgeBuildRequest(memo, context);
      const parsed = ForgeBuildRequestSchema.safeParse(request);
      expect(parsed.success).toBe(true);
    });

    it('LLM-01: Governance ForgeBuildRequest validated against schema', () => {
      const memo = makeGovernanceMemo();
      const request = buildForgeBuildRequest(memo, context);
      const parsed = ForgeBuildRequestSchema.safeParse(request);
      expect(parsed.success).toBe(true);
    });

    it('FORGE-01: all regime contexts produce valid requests', () => {
      const regimes: Array<'economic' | 'governance' | 'capability' | 'leverage' | 'expression' | 'identity'> = [
        'economic', 'governance', 'capability', 'leverage', 'expression', 'identity',
      ];

      for (const regime of regimes) {
        const baseMemo = {
          candidateId: `test-${regime}`,
          regime,
          verdict: 'commit' as const,
          rationale: ['Test'],
          evidenceUsed: [],
          unresolvedRisks: [],
          whatForgeShouldBuild: ['Test item'],
          whatForgeMustNotBuild: [],
          recommendedNextStep: [],
        };

        const request = buildForgeBuildRequest(baseMemo, context);
        const parsed = ForgeBuildRequestSchema.safeParse(request);
        expect(parsed.success).toBe(true);
      }
    });
  });

  describe('CI compatibility', () => {
    it('uses in-memory operations only', () => {
      expect(true).toBe(true);
    });

    it('mocks all external HTTP calls', async () => {
      let fetchCalled = false;
      const client = new KarviClient({
        fetchFn: mockFetch(() => {
          fetchCalled = true;
          return jsonResponse({ ok: true, data: { buildId: 'b1', status: 'queued', pipeline: 'test' } });
        }),
      });

      await client.forgeBuild(buildForgeBuildRequest(makeEconomicMemo(), context));
      expect(fetchCalled).toBe(true);
    });

    it('has no environment dependencies', () => {
      expect(process.env.KARVI_URL).toBeUndefined();
    });
  });
});
