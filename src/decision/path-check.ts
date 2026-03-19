import type {
  IntentRoute,
  PathCheckResult,
  FixedElement,
  UnresolvedElement,
  Regime,
} from '../schemas/decision';

// ─── Types ───

type ElementKind = 'domain' | 'form' | 'buyer' | 'loop' | 'build_target';

const ALL_ELEMENT_KINDS: ElementKind[] = ['domain', 'form', 'buyer', 'loop', 'build_target'];

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

// ─── Internal Types ───

interface ElementAnalysis {
  fixed: FixedElement[];
  unresolved: UnresolvedElement[];
}

type Severity = 'blocking' | 'important' | 'nice_to_have';

// ─── Element Analysis ───

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

// ─── Severity Classification ───

// Regime-specific severity rules (path-check.md Section 12)
// Key: `${regime}:${kind}` → Severity
const SEVERITY_MAP: Record<string, Severity> = {
  // Form is always blocking (Section 11.A)
  'economic:form': 'blocking', 'capability:form': 'blocking', 'leverage:form': 'blocking',
  'expression:form': 'blocking', 'governance:form': 'blocking', 'identity:form': 'blocking',
  // Build target is always blocking (Section 11.E)
  'economic:build_target': 'blocking', 'capability:build_target': 'blocking', 'leverage:build_target': 'blocking',
  'expression:build_target': 'blocking', 'governance:build_target': 'blocking', 'identity:build_target': 'blocking',
  // Economic (Section 12.1)
  'economic:buyer': 'blocking', 'economic:domain': 'important', 'economic:loop': 'important',
  // Capability (Section 12.2)
  'capability:loop': 'blocking', 'capability:domain': 'important', 'capability:buyer': 'nice_to_have',
  // Leverage (Section 12.3)
  'leverage:domain': 'blocking', 'leverage:loop': 'important', 'leverage:buyer': 'nice_to_have',
  // Expression (Section 12.4)
  'expression:domain': 'blocking', 'expression:loop': 'important', 'expression:buyer': 'nice_to_have',
  // Governance (Section 12.5)
  'governance:loop': 'blocking', 'governance:domain': 'important', 'governance:buyer': 'important',
  // Identity (Section 12.6)
  'identity:loop': 'important', 'identity:domain': 'nice_to_have', 'identity:buyer': 'nice_to_have',
};

function getElementSeverity(kind: ElementKind, regime: Regime): Severity {
  return SEVERITY_MAP[`${regime}:${kind}`] ?? 'important';
}

// ─── Unresolved Reason Generation ───

function getUnresolvedReason(kind: ElementKind, regime: Regime): string {
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

  return reasons[regime][kind];
}

// ─── Certainty and Route Helpers ───

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
): 'space-builder' | 'forge-fast-path' | 'space-builder-then-forge' {
  // path-check.md Section 9
  if (certainty === 'high') return 'forge-fast-path';
  if (certainty === 'low') return 'space-builder';
  return 'space-builder-then-forge';
}

function getRecommendedNextStep(
  route: 'space-builder' | 'forge-fast-path' | 'space-builder-then-forge',
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
  }
}

// ─── Main Export ───

/**
 * Analyze fixed and unresolved elements to determine path certainty and route.
 *
 * Pure function -- NO LLM call (COND-02 friendly).
 * Analyzes 5 element kinds: domain, form, buyer, loop, build_target.
 * Regime-specific severity rules per path-check.md Section 12.
 */
export function checkPath(
  intentRoute: IntentRoute,
  context: PathCheckContext = {},
): PathCheckResult {
  const { fixed, unresolved } = analyzeElements(intentRoute, context);

  const blockingCount = unresolved.filter((u) => u.severity === 'blocking').length;
  const importantCount = unresolved.filter((u) => u.severity === 'important').length;

  // Certainty classification (path-check.md Section 10)
  const certainty = classifyCertainty(blockingCount, importantCount);

  // Route decision (path-check.md Section 9)
  const route = decideRoute(certainty);

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
