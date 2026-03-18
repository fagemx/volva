# C2: Route Decision Logic + Tests

> **Module**: `src/decision/path-check.ts` (continued) + `src/decision/path-check.test.ts`
> **Layer**: L1
> **Dependencies**: C1 (Element Analysis), Track A (Zod schemas)
> **Blocks**: D (Space Builder), F (Integration)

---

## Bootstrap

```bash
cat docs/world-design-v0/path-check.md                  # Section 9-14: 3 routes, certainty, canonical examples
cat src/decision/path-check.ts                           # C1 output: checkPath + analyzeElements
cat src/schemas/decision.ts                              # PathCheckResultSchema, FixedElementSchema, UnresolvedElementSchema
cat docs/plan-world-design/CONTRACT.md                   # TEST-01, LAYER-01
bun run build                                            # verify baseline
bun test                                                 # verify existing tests pass
```

---

## Final Result

- `src/decision/path-check.ts` refined with regime-specific route decision logic
- `src/decision/path-check.test.ts` with full test coverage: all 3 routes, all 6 regimes, canonical examples
- Regime-specific checks (e.g., governance needs world form fixed for fast-path)
- `bun test src/decision/path-check.test.ts` all pass

---

## Implementation

### Step 1: Regime-Specific Route Overrides

C1 provides generic certainty/route logic. C2 adds regime-specific overrides that can downgrade a route even when generic rules say otherwise. These rules come from path-check.md Section 12.

Add to `src/decision/path-check.ts`:

```typescript
/**
 * Regime-specific overrides that can downgrade the route even when
 * generic element counts would allow a higher certainty.
 *
 * For example: governance with form="world" but no world-form detail
 * should not fast-path even if generic counts look fine.
 */
function applyRegimeOverrides(
  route: 'space-builder' | 'forge-fast-path' | 'space-builder-then-forge',
  regime: Regime,   // use Regime type from schemas/decision.ts, not string
  fixed: FixedElement[],
  unresolved: UnresolvedElement[],
): 'space-builder' | 'forge-fast-path' | 'space-builder-then-forge' {
  const fixedKinds = new Set(fixed.map((f) => f.kind));
  const unresolvedKinds = new Set(unresolved.map((u) => u.kind));

  switch (regime) {
    case 'governance':
      // Governance MUST have world form fixed for fast-path (Section 12.5)
      // Even if generic element count says "high", governance without
      // world form should be medium at best
      if (route === 'forge-fast-path' && unresolvedKinds.has('form')) {
        return 'space-builder-then-forge';
      }
      // Governance without core cycle cannot fast-path
      if (route === 'forge-fast-path' && unresolvedKinds.has('loop')) {
        return 'space-builder-then-forge';
      }
      break;

    case 'economic':
      // Economic MUST have buyer shape for fast-path (Section 12.1)
      if (route === 'forge-fast-path' && unresolvedKinds.has('buyer')) {
        return 'space-builder-then-forge';
      }
      break;

    case 'capability':
      // Capability without practice loop cannot fast-path (Section 12.2)
      if (route === 'forge-fast-path' && unresolvedKinds.has('loop')) {
        return 'space-builder-then-forge';
      }
      break;

    case 'leverage':
      // Leverage often CAN fast-path if bottleneck is clear (Section 12.3)
      // No downgrade needed; leverage is the most fast-path-friendly regime
      break;

    case 'expression':
      // Expression without medium/format cannot fast-path (Section 12.4)
      if (route === 'forge-fast-path' && unresolvedKinds.has('domain')) {
        return 'space-builder-then-forge';
      }
      break;

    case 'identity':
      // Identity almost never fast-paths (Section 12.6)
      // Even with most elements "fixed", identity should go through
      // space-builder for staged probe design
      if (route === 'forge-fast-path') {
        return 'space-builder-then-forge';
      }
      break;
  }

  return route;
}
```

### Step 2: Integrate Overrides into checkPath

Update `checkPath` to call `applyRegimeOverrides` after the generic route decision:

```typescript
export function checkPath(
  intentRoute: IntentRoute,
  context: PathCheckContext,
): PathCheckResult {
  const { fixed, unresolved } = analyzeElements(intentRoute, context);

  const blockingCount = unresolved.filter((u) => u.severity === 'blocking').length;
  const importantCount = unresolved.filter((u) => u.severity === 'important').length;

  const certainty = classifyCertainty(blockingCount, importantCount);
  const genericRoute = decideRoute(certainty, blockingCount);

  // Apply regime-specific overrides (C2 addition)
  const route = applyRegimeOverrides(
    genericRoute,
    intentRoute.primaryRegime,
    fixed,
    unresolved,
  );

  // Recalculate certainty if route was downgraded
  const effectiveCertainty = route === 'forge-fast-path' ? 'high'
    : route === 'space-builder' ? 'low'
    : 'medium';

  const whyNotReady = unresolved
    .filter((u) => u.severity === 'blocking')
    .map((u) => u.reason);
  const whyReady = fixed
    .filter((f) => f.kind !== 'intent')
    .map((f) => `${f.kind} fixed: ${f.value}`);

  const recommendedNextStep = getRecommendedNextStep(route, unresolved);

  return {
    certainty: effectiveCertainty,
    route,
    fixedElements: fixed,
    unresolvedElements: unresolved,
    whyNotReady: whyNotReady.length > 0 ? whyNotReady : undefined,
    whyReady: whyReady.length > 0 ? whyReady : undefined,
    recommendedNextStep,
  };
}
```

### Step 3: Test File Setup

```typescript
// src/decision/path-check.test.ts
import { describe, it, expect } from 'vitest';
import { checkPath, type PathCheckContext } from './path-check';
import type { IntentRoute } from '../schemas/decision';

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
```

### Step 4: Test -- Low Certainty / space-builder Route (path-check.md Example A)

```typescript
describe('Route: space-builder (low certainty)', () => {
  it('routes "I want to make money, $1000" to space-builder', () => {
    // Only intent is fixed; everything else is missing
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
```

### Step 5: Test -- Medium Certainty / space-builder-then-forge Route (path-check.md Example B, D)

```typescript
describe('Route: space-builder-then-forge (medium certainty)', () => {
  it('routes economic with domain but no vehicle/buyer to space-builder-then-forge', () => {
    // "I want to make money with video generation"
    const route = makeRoute('economic');
    const context: PathCheckContext = {
      domain: 'video generation',
    };

    const result = checkPath(route, context);

    expect(result.certainty).toBe('medium');
    expect(result.route).toBe('space-builder-then-forge');
    // form and buyer still unresolved
    const unresolvedKinds = result.unresolvedElements.map((u) => u.kind);
    expect(unresolvedKinds).toContain('form');
    expect(unresolvedKinds).toContain('buyer');
  });

  it('routes governance with intent but no world form to space-builder-then-forge', () => {
    // "I want to open a self-operating place, let AI run it"
    const route = makeRoute('governance');
    const context: PathCheckContext = {
      domain: 'creator economy',
    };

    const result = checkPath(route, context);

    expect(result.route).toBe('space-builder-then-forge');
    const unresolvedKinds = result.unresolvedElements.map((u) => u.kind);
    expect(unresolvedKinds).toContain('form');
    expect(unresolvedKinds).toContain('loop');
  });
});
```

### Step 6: Test -- High Certainty / forge-fast-path Route (path-check.md Example C, E)

```typescript
describe('Route: forge-fast-path (high certainty)', () => {
  it('routes fully specified pipeline to forge-fast-path', () => {
    // "Video expert, plan automated pipeline concept-to-publish"
    const route = makeRoute('leverage');
    const context: PathCheckContext = {
      domain: 'video generation',
      form: 'automation pipeline',
      buyer: 'self',
      loop: 'concept -> produce -> publish',
      buildTarget: 'end-to-end video pipeline',
    };

    const result = checkPath(route, context);

    expect(result.certainty).toBe('high');
    expect(result.route).toBe('forge-fast-path');
    expect(result.unresolvedElements).toHaveLength(0);
    expect(result.whyReady).toBeDefined();
    expect(result.whyReady!.length).toBeGreaterThan(0);
  });

  it('routes fully specified governance world to forge-fast-path', () => {
    // "Midnight Market, 2 zones, 3 chiefs, observe->judge->apply->outcome"
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
```

### Step 7: Test -- Regime-Specific Override Rules

```typescript
describe('Regime-specific route overrides', () => {
  it('governance without world form cannot fast-path even with other elements', () => {
    const route = makeRoute('governance');
    const context: PathCheckContext = {
      domain: 'creator economy',
      // form is MISSING -- world form unresolved
      buyer: 'creators',
      loop: 'observe -> propose -> apply',
      buildTarget: 'minimum world',
    };

    const result = checkPath(route, context);

    // Should be downgraded from what would otherwise be high certainty
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
      // domain is MISSING -- medium not specified
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
```

### Step 8: Test -- Element Severity Classification

```typescript
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
```

### Step 9: Test -- recommendedNextStep Output

```typescript
describe('recommendedNextStep', () => {
  it('provides space-builder recommendation for low certainty', () => {
    const route = makeRoute('economic');
    const result = checkPath(route, {});

    expect(result.recommendedNextStep).toContain('space-builder');
  });

  it('provides forge recommendation for high certainty', () => {
    const route = makeRoute('leverage');
    const context: PathCheckContext = {
      domain: 'asset management',
      form: 'automation workflow',
      buyer: 'self',
      loop: 'trigger -> process -> verify',
      buildTarget: 'asset sorting automation',
    };

    const result = checkPath(route, context);

    expect(result.recommendedNextStep).toContain('Forge');
  });
});
```

### Step 10: Test -- Pure Function Guarantee

```typescript
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
```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. All tests pass
bun test src/decision/path-check.test.ts

# 4. Test count
grep -c "it(" src/decision/path-check.test.ts
# Expected: >= 15

# 5. All 3 routes tested
grep -c "space-builder\|forge-fast-path\|space-builder-then-forge" src/decision/path-check.test.ts
# Expected: >= 6

# 6. All 6 regimes have at least one test
grep -c "economic\|capability\|leverage\|expression\|governance\|identity" src/decision/path-check.test.ts
# Expected: >= 12

# 7. No LLM imports in path-check.ts
grep -c "from.*llm" src/decision/path-check.ts
# Expected: 0

# 8. No any types
grep -c "as any\|: any" src/decision/path-check.ts src/decision/path-check.test.ts
# Expected: 0

# 9. Layer independence
grep -c "from.*conductor\|from.*cards\|from.*settlement" src/decision/path-check.ts
# Expected: 0
```

## Git Commit

```
feat(decision): add regime-specific route overrides and path-check tests

Add applyRegimeOverrides() for regime-specific fast-path constraints
(e.g., governance needs world form, economic needs buyer, identity
never fast-paths). Full test coverage: 3 routes, 6 regimes, severity
classification, canonical examples from path-check.md.
```
