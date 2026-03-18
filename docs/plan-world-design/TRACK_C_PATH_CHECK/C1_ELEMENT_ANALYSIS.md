# C1: Fixed/Unresolved Element Analysis

> **Module**: `src/decision/path-check.ts`
> **Layer**: L1
> **Dependencies**: Track A (Zod schemas in `src/schemas/decision.ts`)
> **Blocks**: C2 (Route Decision), D (Space Builder), F (Integration)

---

## Bootstrap

```bash
cat docs/world-design-v0/path-check.md                  # canonical spec: 5 elements, certainty levels, examples
cat docs/world-design-v0/shared-types.md                 # PathCheckResult, FixedElement, UnresolvedElement
cat src/schemas/decision.ts                              # Zod schemas from Track A
cat docs/plan-world-design/CONTRACT.md                   # LAYER-01, SHARED-01
bun run build                                            # verify baseline
```

---

## Final Result

- `src/decision/path-check.ts` exports `checkPath(intentRoute, context): PathCheckResult`
- Pure function -- NO LLM call (COND-02 friendly; path-check costs 0 LLM calls)
- Analyzes 5 fixed elements: `domain`, `form`, `buyer`, `loop`, `build_target`
- Context carries user-provided information parsed from conversation
- Outputs `fixedElements`, `unresolvedElements` with severity classification
- `bun run build` zero errors

---

## Implementation

### Step 1: PathCheckContext Type

Define the input context that carries parsed information from the conversation. This is a local helper type (not a shared type), since it's internal to path-check.

```typescript
// src/decision/path-check.ts
import type { IntentRoute, PathCheckResult, FixedElement, UnresolvedElement } from '../schemas/decision';

/**
 * Context carries user-provided information parsed from conversation.
 * Each field is optional; absent = not yet mentioned by user.
 */
export interface PathCheckContext {
  /** The domain the user operates in, e.g., "video generation", "AI agents" */
  domain?: string;
  /** The carrying form: "service", "workflow", "world", "path", "pipeline", "tool", "operator_model" */
  form?: string;
  /** Who this is for: "small studios", "designers", "self", "market participants" */
  buyer?: string;
  /** The core loop described by user, e.g., "concept -> produce -> publish" */
  loop?: string;
  /** What the user wants to build first */
  buildTarget?: string;
  /** Raw signals from conversation that may indicate fixed/unfixed elements */
  rawSignals?: string[];
}
```

### Step 2: Element Extraction -- analyzeElements()

Extract fixed and unresolved elements from the context. This is the core analysis step.

```typescript
type ElementKind = 'domain' | 'form' | 'buyer' | 'loop' | 'build_target';

const ALL_ELEMENT_KINDS: ElementKind[] = ['domain', 'form', 'buyer', 'loop', 'build_target'];

interface ElementAnalysis {
  fixed: FixedElement[];
  unresolved: UnresolvedElement[];
}

function analyzeElements(
  intentRoute: IntentRoute,
  context: PathCheckContext,
): ElementAnalysis {
  const fixed: FixedElement[] = [];
  const unresolved: UnresolvedElement[] = [];

  // Intent is always fixed (we have an IntentRoute)
  fixed.push({ kind: 'intent', value: intentRoute.primaryRegime });

  // Check each of the 5 elements
  const elementMap: Record<ElementKind, string | undefined> = {
    domain: context.domain,
    form: context.form,
    buyer: context.buyer,
    loop: context.loop,
    build_target: context.buildTarget,
  };

  for (const kind of ALL_ELEMENT_KINDS) {
    const value = elementMap[kind];
    if (value) {
      fixed.push({ kind, value });
    } else {
      unresolved.push({
        kind,
        reason: getUnresolvedReason(kind, intentRoute.primaryRegime),
        severity: getElementSeverity(kind, intentRoute.primaryRegime),
      });
    }
  }

  return { fixed, unresolved };
}
```

### Step 3: Severity Classification -- getElementSeverity()

Different elements have different severity depending on the regime. This encodes the regime-specific checks from path-check.md Sections 11-12.

```typescript
function getElementSeverity(
  kind: ElementKind,
  regime: Regime,   // use Regime type from schemas/decision.ts, not string
): 'blocking' | 'important' | 'nice_to_have' {
  // Form is always blocking -- cannot build without knowing the carrying form
  // (path-check.md Section 11.A)
  if (kind === 'form') return 'blocking';

  // Build target is always blocking -- cannot enter Forge without it
  // (path-check.md Section 11.E)
  if (kind === 'build_target') return 'blocking';

  // Regime-specific severity rules (path-check.md Section 12)
  switch (regime) {
    case 'economic':
      // Buyer is blocking for economic (Section 12.1)
      if (kind === 'buyer') return 'blocking';
      if (kind === 'domain') return 'important';
      if (kind === 'loop') return 'important';
      break;

    case 'capability':
      // Loop (practice loop) is blocking for capability (Section 12.2)
      if (kind === 'loop') return 'blocking';
      if (kind === 'domain') return 'important';
      if (kind === 'buyer') return 'nice_to_have'; // capability is often for self
      break;

    case 'leverage':
      // Domain (bottleneck) is blocking for leverage (Section 12.3)
      if (kind === 'domain') return 'blocking';
      if (kind === 'loop') return 'important';
      if (kind === 'buyer') return 'nice_to_have';
      break;

    case 'expression':
      // Domain (medium/format) is blocking for expression (Section 12.4)
      if (kind === 'domain') return 'blocking';
      if (kind === 'loop') return 'important';
      if (kind === 'buyer') return 'nice_to_have';
      break;

    case 'governance':
      // Form (world form) is already blocking above;
      // Loop (core cycle) is blocking for governance (Section 12.5)
      if (kind === 'loop') return 'blocking';
      if (kind === 'domain') return 'important';
      if (kind === 'buyer') return 'important';
      break;

    case 'identity':
      // Loop (staged probe path) is important for identity (Section 12.6)
      if (kind === 'loop') return 'important';
      if (kind === 'domain') return 'nice_to_have';
      if (kind === 'buyer') return 'nice_to_have';
      break;
  }

  // Default
  return 'important';
}
```

### Step 4: Unresolved Reason Generation -- getUnresolvedReason()

Produce human-readable reasons for why each element is unresolved, regime-aware.

```typescript
function getUnresolvedReason(kind: ElementKind, regime: string): string {
  const reasons: Record<string, Record<ElementKind, string>> = {
    economic: {
      domain: 'No economic domain specified',
      form: 'No economic vehicle selected (service, product, tool, etc.)',
      buyer: 'No buyer shape identified',
      loop: 'No revenue/delivery loop defined',
      build_target: 'No first build target specified',
    },
    capability: {
      domain: 'No skill domain specified',
      form: 'No learning/practice form selected',
      buyer: 'No target learner identified (may be self)',
      loop: 'No practice loop defined',
      build_target: 'No first practice target specified',
    },
    leverage: {
      domain: 'No bottleneck domain identified',
      form: 'No automation form selected (workflow, pipeline, operator)',
      buyer: 'No automation user identified',
      loop: 'No automation loop defined',
      build_target: 'No first automation target specified',
    },
    expression: {
      domain: 'No medium/format domain specified',
      form: 'No carrying form for expression selected',
      buyer: 'No audience identified',
      loop: 'No creation/production loop defined',
      build_target: 'No first work/piece target specified',
    },
    governance: {
      domain: 'No governance domain specified',
      form: 'World form unresolved (market, commons, town, etc.)',
      buyer: 'No participants/operators identified',
      loop: 'Core governance cycle unresolved',
      build_target: 'No minimum world target specified',
    },
    identity: {
      domain: 'No life path domain specified',
      form: 'No transition form selected',
      buyer: 'No stakeholder identified',
      loop: 'No staged probe path defined',
      build_target: 'No first probe target specified',
    },
  };

  return reasons[regime]?.[kind] ?? `${kind} not yet specified`;
}
```

### Step 5: Main checkPath Function

Compose the element analysis into a `PathCheckResult`. The certainty and route calculations are thin here because C2 handles the route decision logic. This step focuses on producing the element analysis.

```typescript
export function checkPath(
  intentRoute: IntentRoute,
  context: PathCheckContext,
): PathCheckResult {
  const { fixed, unresolved } = analyzeElements(intentRoute, context);

  const blockingCount = unresolved.filter((u) => u.severity === 'blocking').length;
  const importantCount = unresolved.filter((u) => u.severity === 'important').length;

  // Certainty classification (path-check.md Section 10)
  const certainty = classifyCertainty(blockingCount, importantCount);

  // Route decision (path-check.md Section 9)
  const route = decideRoute(certainty, blockingCount);

  // Why ready / why not ready explanations
  const whyNotReady = unresolved
    .filter((u) => u.severity === 'blocking')
    .map((u) => u.reason);
  const whyReady = fixed
    .filter((f) => f.kind !== 'intent') // intent is always fixed, not interesting
    .map((f) => `${f.kind} fixed: ${f.value}`);

  const recommendedNextStep = getRecommendedNextStep(route, unresolved);

  return {
    certainty,
    route,
    fixedElements: fixed,
    unresolvedElements: unresolved,
    whyNotReady: whyNotReady.length > 0 ? whyNotReady : undefined,
    whyReady: whyReady.length > 0 ? whyReady : undefined,
    recommendedNextStep,
  };
}
```

### Step 6: Certainty and Route Helpers

```typescript
function classifyCertainty(
  blockingCount: number,
  importantCount: number,
): 'low' | 'medium' | 'high' {
  // Low: 2+ blocking unresolved elements (path-check.md Section 10)
  if (blockingCount >= 2) return 'low';
  // High: 0 blocking, 0-1 important
  if (blockingCount === 0 && importantCount <= 1) return 'high';
  // Medium: everything else
  return 'medium';
}

function decideRoute(
  certainty: 'low' | 'medium' | 'high',
  blockingCount: number,
): 'space-builder' | 'forge-fast-path' | 'space-builder-then-forge' {
  // path-check.md Section 9
  if (certainty === 'high') return 'forge-fast-path';
  if (certainty === 'low') return 'space-builder';
  return 'space-builder-then-forge';
}

function getRecommendedNextStep(
  route: string,
  unresolved: UnresolvedElement[],
): string {
  switch (route) {
    case 'space-builder':
      return 'Enter space-builder to explore realization candidates';
    case 'forge-fast-path':
      return 'Proceed directly to Forge for implementation planning';
    case 'space-builder-then-forge': {
      const firstBlocking = unresolved.find((u) => u.severity === 'blocking');
      if (firstBlocking) {
        return `Resolve ${firstBlocking.kind} via space-builder, then proceed to Forge`;
      }
      return 'Brief space-builder pass to resolve remaining elements, then Forge';
    }
    default:
      return 'Enter space-builder';
  }
}
```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. No any types
grep -c "as any\|: any" src/decision/path-check.ts
# Expected: 0

# 4. Layer independence
grep -c "from.*conductor\|from.*cards\|from.*settlement\|from.*llm" src/decision/path-check.ts
# Expected: 0 (pure function, no LLM import)

# 5. No LLM calls
grep -c "generateStructured\|generateText\|LLMClient" src/decision/path-check.ts
# Expected: 0

# 6. Exports checkPath
grep "export.*function checkPath" src/decision/path-check.ts
# Expected: 1

# 7. Uses types from schemas/decision.ts
grep "from.*schemas/decision" src/decision/path-check.ts
# Expected: >= 1

# 8. All 5 element kinds checked
grep -c "domain\|form\|buyer\|loop\|build_target" src/decision/path-check.ts
# Expected: >= 5
```

## Git Commit

```
feat(decision): add path-check element analysis as pure function

Implement checkPath() that analyzes 5 fixed elements (domain, form,
buyer, loop, build_target) with regime-specific severity rules.
Pure function with zero LLM calls. Outputs PathCheckResult with
certainty level and route decision.
```
