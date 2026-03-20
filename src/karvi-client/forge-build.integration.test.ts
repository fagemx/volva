import { describe, it, expect } from 'vitest';
import { KarviClient } from './client';
import type { ForgeBuildRequest, ForgeBuildResult } from './schemas';

type SseEvent = { event: string; data: unknown };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidForgeRequest(body: unknown): body is ForgeBuildRequest {
  if (typeof body !== 'object' || body === null) return false;
  const req = body as Record<string, unknown>;
  return (
    typeof req.sessionId === 'string'
    && typeof req.candidateId === 'string'
    && typeof req.regime === 'string'
    && Array.isArray(req.whatToBuild)
    && Array.isArray(req.whatNotToBuild)
    && typeof req.regimeContext === 'object'
    && req.regimeContext !== null
  );
}

function toSseText(events: SseEvent[]): string {
  return events
    .map((evt) => `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`)
    .join('');
}

async function parseSse(response: Response): Promise<SseEvent[]> {
  const text = await response.text();
  const chunks = text.split('\n\n').map((x) => x.trim()).filter(Boolean);
  return chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const eventLine = lines.find((x) => x.startsWith('event: '));
    const dataLine = lines.find((x) => x.startsWith('data: '));
    const event = eventLine ? eventLine.slice('event: '.length) : 'unknown';
    const data = dataLine ? JSON.parse(dataLine.slice('data: '.length)) as unknown : null;
    return { event, data };
  });
}

function createFakeKarviServer() {
  const builds = new Map<string, { result: ForgeBuildResult; events: SseEvent[] }>();
  let buildCounter = 0;

  const fetchFn = (async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/volva/forge-build') && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) as unknown : {};
      if (!isValidForgeRequest(body)) {
        return jsonResponse(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid forge build request body' } },
          400,
        );
      }

      if (body.regime === 'identity') {
        return jsonResponse(
          { ok: false, error: { code: 'UNKNOWN_REGIME', message: 'Regime identity is not supported in forge build' } },
          400,
        );
      }

      if (body.whatToBuild.length === 0) {
        return jsonResponse(
          { ok: false, error: { code: 'EMPTY_BUILD', message: 'whatToBuild must not be empty' } },
          400,
        );
      }

      buildCounter += 1;
      const buildId = `build-${buildCounter}`;
      const pipeline = body.regime === 'governance' ? 'forge-governance' : 'forge-economic';
      const stepCount = 3;

      const allowedBuildItems = body.whatToBuild.filter(
        (item) => !body.whatNotToBuild.includes(item),
      );

      const artifacts: ForgeBuildResult['artifacts'] = allowedBuildItems.map((item, index) => ({
        type: 'file' as const,
        path: `/artifacts/${buildId}/${index + 1}.md`,
        description: item,
      }));

      if (body.regime === 'governance') {
        artifacts.push({
          type: 'spec',
          path: `/artifacts/${buildId}/village-pack.json`,
          description: 'village pack artifact',
        });
        const firstCycle = (
          (body.regimeContext as { firstCycleDesign?: string[] }).firstCycleDesign
          ?? []
        )[0];
        if (firstCycle) {
          artifacts.push({
            type: 'spec',
            path: `/artifacts/${buildId}/first-cycle.md`,
            description: `first cycle: ${firstCycle}`,
          });
        }
      }

      const result: ForgeBuildResult = {
        sessionId: body.sessionId,
        status: 'success',
        durationMs: 1_200,
        artifacts,
        steps: [
          { stepId: `${buildId}-plan`, type: 'plan', status: 'success', artifacts: [] },
          { stepId: `${buildId}-implement`, type: 'implement', status: 'success', artifacts: artifacts.map((a) => a.path) },
          { stepId: `${buildId}-review`, type: 'review', status: 'success', artifacts: [] },
        ],
        telemetry: {
          tokensUsed: 12000,
          costUsd: 0.12,
          runtime: 'karvi-worker',
          model: 'claude-sonnet-4',
          stepsExecuted: stepCount,
        },
      };

      const events: SseEvent[] = [
        { event: 'step_started', data: { stepId: `${buildId}-plan` } },
        { event: 'step_completed', data: { stepId: `${buildId}-plan` } },
        { event: 'step_started', data: { stepId: `${buildId}-implement` } },
        { event: 'step_completed', data: { stepId: `${buildId}-implement` } },
        { event: 'step_started', data: { stepId: `${buildId}-review` } },
        { event: 'step_completed', data: { stepId: `${buildId}-review` } },
        { event: 'build-completed', data: result },
      ];

      builds.set(buildId, { result, events });

      return jsonResponse({
        ok: true,
        data: {
          buildId,
          status: 'queued',
          pipeline,
          steps: stepCount,
        },
      });
    }

    const sseMatch = url.match(/\/api\/volva\/status\/([^/]+)\/events$/);
    if (sseMatch && method === 'GET') {
      const buildId = sseMatch[1];
      const build = builds.get(buildId);
      if (!build) {
        return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Build not found' } }, 404);
      }
      return new Response(toSseText(build.events), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
  }) as typeof fetch;

  return { fetchFn };
}

function makeEconomicRequest(overrides: Partial<ForgeBuildRequest> = {}): ForgeBuildRequest {
  return {
    sessionId: 'session-economic-001',
    candidateId: 'cand-economic-001',
    regime: 'economic',
    verdict: 'commit',
    whatToBuild: ['Service intake flow', 'Pricing page'],
    whatNotToBuild: ['Full product before buyer validation'],
    rationale: ['Strong buyer signal'],
    evidenceUsed: ['3 interviews'],
    unresolvedRisks: ['pricing still uncertain'],
    regimeContext: {
      kind: 'economic',
      buyerHypothesis: 'Design studios with video workload',
      painHypothesis: 'Manual setup is expensive',
      vehicleType: 'service',
      paymentEvidence: ['2 studios pre-committed'],
      whyThisVehicleNow: ['short time to signal'],
      nextSignalAfterBuild: ['first paid setup completed'],
    },
    context: {
      workingDir: '/tmp/economic',
      targetRepo: 'org/economic-repo',
    },
    ...overrides,
  };
}

function makeGovernanceRequest(overrides: Partial<ForgeBuildRequest> = {}): ForgeBuildRequest {
  return {
    sessionId: 'session-governance-001',
    candidateId: 'cand-governance-001',
    regime: 'governance',
    verdict: 'commit',
    whatToBuild: ['Village constitution draft', 'Chief assignment matrix'],
    whatNotToBuild: ['Standalone dashboard'],
    rationale: ['Need governed world with visible cycles'],
    evidenceUsed: ['governance workshop notes'],
    unresolvedRisks: ['adoption risk'],
    regimeContext: {
      kind: 'governance',
      worldForm: 'market',
      minimumWorldShape: ['stall registry', 'transaction log'],
      firstCycleDesign: ['weekly review cycle'],
      stateDensityAssessment: 'medium',
      governancePressureAssessment: 'high',
      thyraHandoffRequirements: ['chief approves stall changes'],
    },
    context: {
      workingDir: '/tmp/governance',
      targetRepo: 'org/governance-repo',
    },
    ...overrides,
  };
}

describe('Forge build integration golden path', () => {
  it('economic regime: dispatches, streams SSE sequence, validates result constraints and telemetry', async () => {
    const server = createFakeKarviServer();
    const client = new KarviClient({
      baseUrl: 'http://karvi.test',
      fetchFn: server.fetchFn,
      retries: 0,
    });

    const request = makeEconomicRequest();
    const dispatch = await client.forgeBuild(request);

    expect(dispatch.buildId).toMatch(/^build-/);
    expect(dispatch.status).toBe('queued');
    expect(dispatch.pipeline).toBe('forge-economic');
    expect(dispatch.steps).toBe(3);

    const streamRes = await server.fetchFn(
      `http://karvi.test/api/volva/status/${dispatch.buildId}/events`,
      { method: 'GET' },
    );
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('Content-Type')).toContain('text/event-stream');

    const events = await parseSse(streamRes);
    expect(events.map((evt) => evt.event)).toEqual([
      'step_started',
      'step_completed',
      'step_started',
      'step_completed',
      'step_started',
      'step_completed',
      'build-completed',
    ]);

    const completed = events.find((evt) => evt.event === 'build-completed');
    expect(completed).toBeDefined();
    const result = completed!.data as ForgeBuildResult;
    expect(result.status).toBe('success');

    const artifactDescriptions = result.artifacts.map((a) => a.description);
    for (const required of request.whatToBuild) {
      expect(artifactDescriptions).toContain(required);
    }
    for (const forbidden of request.whatNotToBuild) {
      expect(artifactDescriptions).not.toContain(forbidden);
    }

    expect(result.telemetry.tokensUsed).toBeGreaterThan(0);
    expect(result.telemetry.costUsd).toBeGreaterThan(0);
    expect(result.telemetry.runtime).toBeTruthy();
    expect(result.telemetry.model).toBeTruthy();
    expect(result.telemetry.stepsExecuted).toBe(3);
  });

  it('governance regime: selects forge-governance and emits village/first-cycle artifacts', async () => {
    const server = createFakeKarviServer();
    const client = new KarviClient({
      baseUrl: 'http://karvi.test',
      fetchFn: server.fetchFn,
      retries: 0,
    });

    const request = makeGovernanceRequest();
    const dispatch = await client.forgeBuild(request);

    expect(dispatch.pipeline).toBe('forge-governance');
    expect(dispatch.steps).toBe(3);

    const streamRes = await server.fetchFn(
      `http://karvi.test/api/volva/status/${dispatch.buildId}/events`,
      { method: 'GET' },
    );
    const events = await parseSse(streamRes);
    const completed = events.find((evt) => evt.event === 'build-completed');
    expect(completed).toBeDefined();

    const result = completed!.data as ForgeBuildResult;
    const artifactDescriptions = result.artifacts.map((a) => a.description.toLowerCase());
    expect(artifactDescriptions.some((desc) => desc.includes('village pack'))).toBe(true);
    expect(artifactDescriptions.some((desc) => desc.includes('first cycle'))).toBe(true);
  });
});

describe('Forge build negative cases', () => {
  it("regime='identity' returns UNKNOWN_REGIME (400)", async () => {
    const server = createFakeKarviServer();
    const request = makeEconomicRequest({ regime: 'identity' });
    const res = await server.fetchFn('http://karvi.test/api/volva/forge-build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('UNKNOWN_REGIME');
  });

  it('empty whatToBuild returns EMPTY_BUILD (400)', async () => {
    const server = createFakeKarviServer();
    const request = makeEconomicRequest({ whatToBuild: [] });
    const res = await server.fetchFn('http://karvi.test/api/volva/forge-build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('EMPTY_BUILD');
  });

  it('invalid body returns VALIDATION_ERROR (400)', async () => {
    const server = createFakeKarviServer();
    const res = await server.fetchFn('http://karvi.test/api/volva/forge-build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
