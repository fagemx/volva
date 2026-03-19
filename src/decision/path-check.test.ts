import { describe, it, expect } from 'vitest';
import { checkPath, type PathCheckContext } from './path-check';
import type { IntentRoute } from '../schemas/decision';

// ─── Helpers ───

function makeRoute(regime: string, confidence = 0.9): IntentRoute {
  return {
    primaryRegime: regime as IntentRoute['primaryRegime'],
    confidence,
    signals: [],
    rationale: [],
    keyUnknowns: [],
    suggestedFollowups: [],
  };
}

const FULL_CONTEXT: PathCheckContext = {
  domain: 'video generation',
  form: 'automation pipeline',
  buyer: 'self',
  loop: 'concept -> produce -> publish',
  buildTarget: 'end-to-end video pipeline',
};

// ─── Route: space-builder (low certainty) ───

describe('Route: space-builder (low certainty)', () => {
  it('routes "I want to make money, $1000" to space-builder', () => {
    const route = makeRoute('economic');
    const context: PathCheckContext = {};

    const result = checkPath(route, context);

    expect(result.certainty).toBe('low');
    expect(result.route).toBe('space-builder');
    expect(result.unresolvedElements.length).toBeGreaterThanOrEqual(4);
    expect(result.whyNotReady).toBeDefined();
    expect(result.whyNotReady!.length).toBeGreaterThan(0);
  });

  it('routes governance with no context to space-builder', () => {
    const route = makeRoute('governance');
    const context: PathCheckContext = {};

    const result = checkPath(route, context);

    expect(result.certainty).toBe('low');
    expect(result.route).toBe('space-builder');
  });

  it('routes identity with no context to space-builder', () => {
    const route = makeRoute('identity');
    const context: PathCheckContext = {};

    const result = checkPath(route, context);

    expect(result.route).toBe('space-builder');
  });
});

// ─── Route: space-builder-then-forge (medium certainty) ───

describe('Route: space-builder-then-forge (medium certainty)', () => {
  it('routes economic with domain+form+loop but no buyer to space-builder-then-forge', () => {
    // Economic: buyer is blocking, domain is important, form is blocking, build_target is blocking
    // With domain+form+loop fixed, only buyer (blocking) + build_target (blocking) remain
    // But 2 blocking = low. Need to also fix build_target to get 1 blocking = medium.
    const route = makeRoute('economic');
    const context: PathCheckContext = {
      domain: 'video generation',
      form: 'done-for-you service',
      loop: 'intake -> produce -> deliver',
      buildTarget: 'service landing page',
      // buyer is MISSING -- the one blocking element
    };

    const result = checkPath(route, context);

    expect(result.certainty).toBe('medium');
    expect(result.route).toBe('space-builder-then-forge');
    const unresolvedKinds = result.unresolvedElements.map((u) => u.kind);
    expect(unresolvedKinds).toContain('buyer');
  });

  it('routes governance with domain+buyer but no world form/loop to space-builder-then-forge', () => {
    // Governance: form (blocking), loop (blocking), buyer (important), build_target (blocking)
    // With domain+buyer+buildTarget fixed, form (blocking) + loop (blocking) remain = low
    // Need only 1 blocking. Fix loop too: only form (blocking) remains.
    const route = makeRoute('governance');
    const context: PathCheckContext = {
      domain: 'creator economy',
      buyer: 'community members',
      loop: 'observe -> propose -> apply',
      buildTarget: 'minimum world prototype',
      // form is MISSING -- world form unresolved
    };

    const result = checkPath(route, context);

    expect(result.certainty).toBe('medium');
    expect(result.route).toBe('space-builder-then-forge');
    const unresolvedKinds = result.unresolvedElements.map((u) => u.kind);
    expect(unresolvedKinds).toContain('form');
  });
});

// ─── Route: forge-fast-path (high certainty) ───

describe('Route: forge-fast-path (high certainty)', () => {
  it('routes fully specified pipeline to forge-fast-path', () => {
    const route = makeRoute('leverage');
    const context: PathCheckContext = { ...FULL_CONTEXT };

    const result = checkPath(route, context);

    expect(result.certainty).toBe('high');
    expect(result.route).toBe('forge-fast-path');
    expect(result.unresolvedElements).toHaveLength(0);
    expect(result.whyReady).toBeDefined();
    expect(result.whyReady!.length).toBeGreaterThan(0);
  });

  it('routes fully specified governance world to forge-fast-path', () => {
    const route = makeRoute('governance');
    const context: PathCheckContext = {
      domain: 'creator market',
      form: 'night market',
      buyer: 'market participants',
      loop: 'observe -> judge -> apply -> outcome',
      buildTarget: 'Midnight Market with 2 zones and 3 chiefs',
    };

    const result = checkPath(route, context);

    expect(result.certainty).toBe('high');
    expect(result.route).toBe('forge-fast-path');
  });
});

// ─── Regime-specific route overrides ───

describe('Regime-specific route overrides', () => {
  it('governance without world form cannot fast-path even with other elements', () => {
    const route = makeRoute('governance');
    const context: PathCheckContext = {
      domain: 'creator economy',
      // form is MISSING
      buyer: 'creators',
      loop: 'observe -> propose -> apply',
      buildTarget: 'minimum world',
    };

    const result = checkPath(route, context);

    expect(result.route).not.toBe('forge-fast-path');
  });

  it('economic without buyer cannot fast-path even with domain and form', () => {
    const route = makeRoute('economic');
    const context: PathCheckContext = {
      domain: 'video generation',
      form: 'done-for-you service',
      // buyer is MISSING
      loop: 'intake -> produce -> deliver',
      buildTarget: 'service landing page',
    };

    const result = checkPath(route, context);

    expect(result.route).not.toBe('forge-fast-path');
  });

  it('identity always goes through space-builder even with most elements fixed', () => {
    const route = makeRoute('identity');
    const context: PathCheckContext = {
      domain: 'AI',
      form: 'career transition path',
      buyer: 'self',
      loop: 'explore -> trial -> evaluate -> commit',
      buildTarget: 'first trial project',
    };

    const result = checkPath(route, context);

    // Identity never fast-paths; always needs staged probe design
    expect(result.route).not.toBe('forge-fast-path');
  });

  it('leverage with clear bottleneck can fast-path', () => {
    const route = makeRoute('leverage');
    const context: PathCheckContext = {
      domain: 'asset management',
      form: 'automation workflow',
      buyer: 'self',
      loop: 'trigger -> process -> verify',
      buildTarget: 'asset sorting automation',
    };

    const result = checkPath(route, context);

    expect(result.route).toBe('forge-fast-path');
  });

  it('expression without medium/domain cannot fast-path', () => {
    const route = makeRoute('expression');
    const context: PathCheckContext = {
      // domain is MISSING
      form: 'serialized work',
      buyer: 'audience',
      loop: 'create -> refine -> publish',
      buildTarget: 'first episode',
    };

    const result = checkPath(route, context);

    expect(result.route).not.toBe('forge-fast-path');
  });

  it('capability without practice loop cannot fast-path', () => {
    const route = makeRoute('capability');
    const context: PathCheckContext = {
      domain: 'video generation',
      form: 'practice curriculum',
      buyer: 'self',
      // loop is MISSING
      buildTarget: 'first practice project',
    };

    const result = checkPath(route, context);

    expect(result.route).not.toBe('forge-fast-path');
  });
});

// ─── Element severity per regime ───

describe('Element severity per regime', () => {
  it('economic: buyer is blocking, domain is important', () => {
    const route = makeRoute('economic');
    const context: PathCheckContext = {};

    const result = checkPath(route, context);

    const buyerEl = result.unresolvedElements.find((u) => u.kind === 'buyer');
    const domainEl = result.unresolvedElements.find((u) => u.kind === 'domain');

    expect(buyerEl?.severity).toBe('blocking');
    expect(domainEl?.severity).toBe('important');
  });

  it('governance: form (world form) and loop (core cycle) are blocking', () => {
    const route = makeRoute('governance');
    const context: PathCheckContext = {};

    const result = checkPath(route, context);

    const formEl = result.unresolvedElements.find((u) => u.kind === 'form');
    const loopEl = result.unresolvedElements.find((u) => u.kind === 'loop');

    expect(formEl?.severity).toBe('blocking');
    expect(loopEl?.severity).toBe('blocking');
  });

  it('capability: buyer is nice_to_have (usually self)', () => {
    const route = makeRoute('capability');
    const context: PathCheckContext = {};

    const result = checkPath(route, context);

    const buyerEl = result.unresolvedElements.find((u) => u.kind === 'buyer');
    expect(buyerEl?.severity).toBe('nice_to_have');
  });
});

// ─── recommendedNextStep ───

describe('recommendedNextStep', () => {
  it('provides space-builder recommendation for low certainty', () => {
    const route = makeRoute('economic');
    const result = checkPath(route, {});

    expect(result.recommendedNextStep).toContain('space-builder');
  });

  it('provides forge recommendation for high certainty', () => {
    const route = makeRoute('leverage');
    const context: PathCheckContext = { ...FULL_CONTEXT };

    const result = checkPath(route, context);

    expect(result.recommendedNextStep).toContain('Forge');
  });
});

// ─── Pure function properties ───

describe('Pure function properties', () => {
  it('returns identical results for identical inputs', () => {
    const route = makeRoute('economic');
    const context: PathCheckContext = { domain: 'video generation' };

    const result1 = checkPath(route, context);
    const result2 = checkPath(route, context);

    expect(result1).toEqual(result2);
  });

  it('does not mutate input objects', () => {
    const route = makeRoute('economic');
    const context: PathCheckContext = { domain: 'video generation' };
    const originalRoute = JSON.stringify(route);
    const originalContext = JSON.stringify(context);

    checkPath(route, context);

    expect(JSON.stringify(route)).toBe(originalRoute);
    expect(JSON.stringify(context)).toBe(originalContext);
  });
});
