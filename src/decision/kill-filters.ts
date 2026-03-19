import type { RealizationCandidate, Regime } from '../schemas/decision';

// ─── Types ───

export type KillFilterConstraints = {
  edgeProfile?: string[];
  budget?: number;
  timeHorizon?: 'short' | 'medium' | 'long';
  maxSearchFriction?: 'low' | 'medium' | 'high';
};

type FilterResult = {
  candidateId: string;
  killed: boolean;
  reason?: string;
  filterName: string;
};

type KillFilterFn = (
  candidate: RealizationCandidate,
  constraints: KillFilterConstraints,
) => FilterResult;

export type KilledCandidate = {
  candidate: RealizationCandidate;
  reasons: string[];
  filterNames: string[];
};

// ─── Helpers ───

const TIME_ORDER: Record<string, number> = { short: 0, medium: 1, long: 2 };

function textContainsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function candidateFullText(candidate: RealizationCandidate): string {
  return [
    candidate.description,
    ...candidate.whyThisCandidate,
    ...candidate.assumptions,
    ...candidate.notes,
    ...(candidate.probeReadinessHints ?? []),
  ].join(' ');
}

// ─── Common Filters ───

function filterEdgeMismatch(
  candidate: RealizationCandidate,
  constraints: KillFilterConstraints,
): FilterResult {
  if (!constraints.edgeProfile || constraints.edgeProfile.length === 0) {
    return { candidateId: candidate.id, killed: false, filterName: 'edge-mismatch' };
  }
  const text = [
    ...candidate.whyThisCandidate,
    ...candidate.assumptions,
    candidate.description,
  ].join(' ').toLowerCase();
  const hasEdgeOverlap = constraints.edgeProfile.some((edge) =>
    text.includes(edge.toLowerCase()),
  );
  if (!hasEdgeOverlap) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'No overlap with user edge profile',
      filterName: 'edge-mismatch',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'edge-mismatch' };
}

function filterSearchFrictionTooHigh(
  candidate: RealizationCandidate,
  constraints: KillFilterConstraints,
): FilterResult {
  if (
    candidate.timeToSignal === 'long' &&
    constraints.maxSearchFriction === 'low'
  ) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Signal too distant for low-friction constraint',
      filterName: 'search-friction-too-high',
    };
  }
  if (
    candidate.timeToSignal === 'medium' &&
    constraints.maxSearchFriction === 'low'
  ) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Medium signal time exceeds low-friction tolerance',
      filterName: 'search-friction-too-high',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'search-friction-too-high' };
}

function filterConstraintViolation(
  candidate: RealizationCandidate,
  constraints: KillFilterConstraints,
): FilterResult {
  if (constraints.timeHorizon) {
    const candidateTime = TIME_ORDER[candidate.timeToSignal] ?? 0;
    const maxTime = TIME_ORDER[constraints.timeHorizon] ?? 2;
    if (candidateTime > maxTime) {
      return {
        candidateId: candidate.id,
        killed: true,
        reason: `timeToSignal "${candidate.timeToSignal}" exceeds timeHorizon "${constraints.timeHorizon}"`,
        filterName: 'constraint-violation',
      };
    }
  }
  return { candidateId: candidate.id, killed: false, filterName: 'constraint-violation' };
}

// ─── Kill Conditions from probe-commit.md Section 7 ───

function filterCommonBadBets(
  candidate: RealizationCandidate,
): FilterResult {
  const text = candidateFullText(candidate).toLowerCase();
  const badBetPatterns = [
    'seo',
    'generic template',
    'everyone-can-use',
    'content calendar',
    'social media growth',
    'build website and wait',
  ];
  if (badBetPatterns.some((pat) => text.includes(pat))) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Common bad bet: resembles public consensus answer',
      filterName: 'common-bad-bets',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'common-bad-bets' };
}

function filterSignalTooDistant(
  candidate: RealizationCandidate,
): FilterResult {
  if (candidate.timeToSignal === 'long') {
    const text = candidateFullText(candidate).toLowerCase();
    const distantMarkers = [
      'months of content',
      'build first',
      'accumulate audience',
      'wait for ranking',
      'grow community first',
    ];
    if (distantMarkers.some((m) => text.includes(m))) {
      return {
        candidateId: candidate.id,
        killed: true,
        reason: 'Signal too distant: requires extended build before any feedback',
        filterName: 'signal-too-distant',
      };
    }
  }
  return { candidateId: candidate.id, killed: false, filterName: 'signal-too-distant' };
}

function filterLowAsymmetry(
  candidate: RealizationCandidate,
  constraints: KillFilterConstraints,
): FilterResult {
  if (!constraints.edgeProfile || constraints.edgeProfile.length === 0) {
    return { candidateId: candidate.id, killed: false, filterName: 'low-asymmetry' };
  }
  const text = candidateFullText(candidate).toLowerCase();
  const hasEdge = constraints.edgeProfile.some((e) => text.includes(e.toLowerCase()));
  const genericMarkers = ['anyone can do', 'no special skill', 'commodity', 'no differentiation'];
  const isGeneric = genericMarkers.some((m) => text.includes(m));
  if (!hasEdge && isGeneric) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Low asymmetry: no edge and candidate is generic',
      filterName: 'low-asymmetry',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'low-asymmetry' };
}

function filterNoClearBuyerOrJudge(
  candidate: RealizationCandidate,
): FilterResult {
  const text = candidateFullText(candidate).toLowerCase();
  const buyerKeywords = ['buyer', 'customer', 'client', 'pay', 'purchase', 'subscriber', 'user'];
  const judgeKeywords = ['signal', 'feedback', 'metric', 'measure', 'judge', 'evaluate', 'outcome'];
  const hasBuyer = buyerKeywords.some((kw) => text.includes(kw));
  const hasJudge = judgeKeywords.some((kw) => text.includes(kw));
  if (!hasBuyer && !hasJudge) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'No clear buyer or judge: cannot determine who pays or what counts as signal',
      filterName: 'no-clear-buyer-judge',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'no-clear-buyer-judge' };
}

function filterTooHeavyBeforeContact(
  candidate: RealizationCandidate,
): FilterResult {
  const text = candidateFullText(candidate).toLowerCase();
  const heavyMarkers = [
    'full platform',
    'complete system',
    'build entire',
    'infrastructure first',
    'full automation',
  ];
  if (candidate.timeToSignal === 'long' && heavyMarkers.some((m) => text.includes(m))) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Too heavy before contact: requires large build before first reality contact',
      filterName: 'too-heavy-before-contact',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'too-heavy-before-contact' };
}

// ─── Economic-Specific Filters ───

function filterAudienceFirstBuyerUnclear(
  candidate: RealizationCandidate,
): FilterResult {
  if (candidate.form === 'community_format') {
    const text = candidate.assumptions.join(' ').toLowerCase();
    if (!textContainsAny(text, ['buyer', 'pay', 'purchase', 'revenue', 'monetize'])) {
      return {
        candidateId: candidate.id,
        killed: true,
        reason: 'Audience-first but no clear buyer in assumptions',
        filterName: 'audience-first-buyer-unclear',
      };
    }
  }
  return { candidateId: candidate.id, killed: false, filterName: 'audience-first-buyer-unclear' };
}

function filterBuildFirstSignalLate(
  candidate: RealizationCandidate,
): FilterResult {
  if (
    candidate.timeToSignal === 'long' &&
    (candidate.form === 'tool' || candidate.form === 'workflow_pack')
  ) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Requires heavy build before first market signal',
      filterName: 'build-first-signal-late',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'build-first-signal-late' };
}

function filterGenericToolFantasy(
  candidate: RealizationCandidate,
): FilterResult {
  if (candidate.form === 'tool') {
    const text = candidate.description.toLowerCase();
    const genericMarkers = ['for everyone', 'universal', 'all-purpose', 'general-purpose', 'anyone can use'];
    if (genericMarkers.some((m) => text.includes(m))) {
      return {
        candidateId: candidate.id,
        killed: true,
        reason: 'Generic tool fantasy: no niche specificity',
        filterName: 'generic-tool-fantasy',
      };
    }
  }
  return { candidateId: candidate.id, killed: false, filterName: 'generic-tool-fantasy' };
}

function filterEducationTrap(
  candidate: RealizationCandidate,
): FilterResult {
  if (candidate.form === 'learning_path') {
    const text = candidateFullText(candidate).toLowerCase();
    if (!textContainsAny(text, ['buyer', 'pay', 'purchase', 'subscription', 'price'])) {
      return {
        candidateId: candidate.id,
        killed: true,
        reason: 'Education trap: learning path without clear economic buyer',
        filterName: 'education-trap',
      };
    }
  }
  return { candidateId: candidate.id, killed: false, filterName: 'education-trap' };
}

function filterNarrowPainBroadBuild(
  candidate: RealizationCandidate,
): FilterResult {
  const text = candidateFullText(candidate).toLowerCase();
  const narrowPainMarkers = ['niche', 'specific pain', 'narrow problem', 'single use case'];
  const broadBuildMarkers = ['platform', 'ecosystem', 'marketplace', 'full suite', 'end-to-end'];
  const hasNarrowPain = narrowPainMarkers.some((m) => text.includes(m));
  const hasBroadBuild = broadBuildMarkers.some((m) => text.includes(m));
  if (hasNarrowPain && hasBroadBuild) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Narrow pain but broad build scope',
      filterName: 'narrow-pain-broad-build',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'narrow-pain-broad-build' };
}

// ─── Governance-Specific Filters ───

function filterFakeWorld(
  candidate: RealizationCandidate,
): FilterResult {
  const text = [
    ...candidate.notes,
    ...candidate.assumptions,
    ...(candidate.probeReadinessHints ?? []),
  ].join(' ').toLowerCase();
  const worldDensityKeywords = ['state', 'change', 'pressure', 'cycle', 'governance', 'density', 'closure'];
  if (!worldDensityKeywords.some((kw) => text.includes(kw))) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Fake world: no state/change/pressure density references',
      filterName: 'fake-world',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'fake-world' };
}

function filterToolInWorldClothing(
  candidate: RealizationCandidate,
): FilterResult {
  const text = candidate.description.toLowerCase();
  const toolTerms = ['dashboard', 'admin panel', 'crud', 'data viewer', 'analytics tool', 'management console'];
  const matches = toolTerms.filter((t) => text.includes(t));
  if (matches.length >= 2) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Tool in world clothing: description dominated by tool/dashboard terms',
      filterName: 'tool-in-world-clothing',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'tool-in-world-clothing' };
}

function filterTooLargeBeforeClosure(
  candidate: RealizationCandidate,
): FilterResult {
  const text = candidate.assumptions.join(' ').toLowerCase();
  const scaleMarkers = ['many roles', 'complex governance', 'large-scale', 'hundreds of', 'massive', 'enterprise-level'];
  if (scaleMarkers.some((m) => text.includes(m))) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'Too large before closure: requires excessive scale for first cycle',
      filterName: 'too-large-before-closure',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'too-large-before-closure' };
}

function filterNoObservableConsequence(
  candidate: RealizationCandidate,
): FilterResult {
  const hints = candidate.probeReadinessHints ?? [];
  if (hints.length === 0) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'No observable consequence: empty probeReadinessHints',
      filterName: 'no-observable-consequence',
    };
  }
  const text = hints.join(' ').toLowerCase();
  const outcomeKeywords = ['outcome', 'consequence', 'result', 'effect', 'impact', 'observable', 'visible'];
  if (!outcomeKeywords.some((kw) => text.includes(kw))) {
    return {
      candidateId: candidate.id,
      killed: true,
      reason: 'No observable consequence: probeReadinessHints lack outcome-related terms',
      filterName: 'no-observable-consequence',
    };
  }
  return { candidateId: candidate.id, killed: false, filterName: 'no-observable-consequence' };
}

// ─── Main Export ───

const commonFilters: KillFilterFn[] = [
  filterEdgeMismatch,
  filterSearchFrictionTooHigh,
  filterConstraintViolation,
];

const killConditionFilters: KillFilterFn[] = [
  filterCommonBadBets,
  filterSignalTooDistant,
  filterLowAsymmetry,
  filterNoClearBuyerOrJudge,
  filterTooHeavyBeforeContact,
];

const economicFilters: KillFilterFn[] = [
  filterAudienceFirstBuyerUnclear,
  filterBuildFirstSignalLate,
  filterGenericToolFantasy,
  filterEducationTrap,
  filterNarrowPainBroadBuild,
];

const governanceFilters: KillFilterFn[] = [
  filterFakeWorld,
  filterToolInWorldClothing,
  filterTooLargeBeforeClosure,
  filterNoObservableConsequence,
];

export function applyKillFilters(
  candidates: RealizationCandidate[],
  regime: Regime,
  constraints?: KillFilterConstraints,
): { survivors: RealizationCandidate[]; killed: KilledCandidate[] } {
  const effectiveConstraints: KillFilterConstraints = constraints ?? {};

  const filters: KillFilterFn[] = [...commonFilters, ...killConditionFilters];
  if (regime === 'economic') filters.push(...economicFilters);
  if (regime === 'governance') filters.push(...governanceFilters);

  const survivors: RealizationCandidate[] = [];
  const killed: KilledCandidate[] = [];

  for (const candidate of candidates) {
    const killReasons: string[] = [];
    const killFilterNames: string[] = [];

    for (const filter of filters) {
      const result = filter(candidate, effectiveConstraints);
      if (result.killed && result.reason) {
        killReasons.push(result.reason);
        killFilterNames.push(result.filterName);
      }
    }

    if (killReasons.length > 0) {
      console.debug(
        `[kill-filters] Killed candidate "${candidate.id}": ${killFilterNames.join(', ')}`,
      );
      killed.push({
        candidate,
        reasons: killReasons,
        filterNames: killFilterNames,
      });
    } else {
      survivors.push(candidate);
    }
  }

  return { survivors, killed };
}
