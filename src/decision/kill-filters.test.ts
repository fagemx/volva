import { describe, it, expect } from 'vitest';
import { applyKillFilters, type KillFilterConstraints } from './kill-filters';
import type { RealizationCandidate } from '../schemas/decision';

// ─── Helpers ───

function makeCandidate(overrides: Partial<RealizationCandidate> = {}): RealizationCandidate {
  return {
    id: 'test-candidate-1',
    regime: 'economic',
    form: 'service',
    description: 'A niche consulting service for video studios',
    whyThisCandidate: ['Matches user skill in video production'],
    assumptions: ['Buyer exists in small studio segment'],
    probeReadinessHints: ['Observable outcome after first delivery'],
    timeToSignal: 'short',
    notes: ['Quick feedback loop via direct client contact'],
    ...overrides,
  };
}

// ─── Survivor path ───

describe('applyKillFilters: survivors', () => {
  it('passes through a clean candidate with no constraints', () => {
    const candidates = [makeCandidate()];
    const { survivors, killed } = applyKillFilters(candidates, 'economic');

    expect(survivors).toHaveLength(1);
    expect(killed).toHaveLength(0);
    expect(survivors[0].id).toBe('test-candidate-1');
  });

  it('passes through multiple clean candidates', () => {
    const candidates = [
      makeCandidate({ id: 'c1' }),
      makeCandidate({ id: 'c2', description: 'Another valid service for buyer segment' }),
    ];
    const { survivors, killed } = applyKillFilters(candidates, 'economic');

    expect(survivors).toHaveLength(2);
    expect(killed).toHaveLength(0);
  });

  it('returns empty arrays for empty input', () => {
    const { survivors, killed } = applyKillFilters([], 'economic');

    expect(survivors).toHaveLength(0);
    expect(killed).toHaveLength(0);
  });
});

// ─── Common filters ───

describe('applyKillFilters: common filters', () => {
  it('kills candidate with no edge overlap when edgeProfile is set', () => {
    const candidates = [makeCandidate({
      description: 'Generic widget factory',
      whyThisCandidate: ['Low barrier to entry'],
      assumptions: ['Market exists somewhere'],
    })];
    const constraints: KillFilterConstraints = { edgeProfile: ['quantum computing', 'biotech'] };

    const { survivors, killed } = applyKillFilters(candidates, 'economic', constraints);

    expect(survivors).toHaveLength(0);
    expect(killed).toHaveLength(1);
    expect(killed[0].filterNames).toContain('edge-mismatch');
  });

  it('passes candidate with matching edge profile', () => {
    const candidates = [makeCandidate({ description: 'Video production consulting' })];
    const constraints: KillFilterConstraints = { edgeProfile: ['video production'] };

    const { survivors } = applyKillFilters(candidates, 'economic', constraints);

    expect(survivors).toHaveLength(1);
  });

  it('kills long timeToSignal when maxSearchFriction is low', () => {
    const candidates = [makeCandidate({ timeToSignal: 'long' })];
    const constraints: KillFilterConstraints = { maxSearchFriction: 'low' };

    const { killed } = applyKillFilters(candidates, 'economic', constraints);

    expect(killed).toHaveLength(1);
    expect(killed[0].filterNames).toContain('search-friction-too-high');
  });

  it('kills medium timeToSignal when maxSearchFriction is low', () => {
    const candidates = [makeCandidate({ timeToSignal: 'medium' })];
    const constraints: KillFilterConstraints = { maxSearchFriction: 'low' };

    const { killed } = applyKillFilters(candidates, 'economic', constraints);

    expect(killed[0].filterNames).toContain('search-friction-too-high');
  });

  it('kills candidate exceeding timeHorizon constraint', () => {
    const candidates = [makeCandidate({ timeToSignal: 'long' })];
    const constraints: KillFilterConstraints = { timeHorizon: 'short' };

    const { killed } = applyKillFilters(candidates, 'economic', constraints);

    expect(killed[0].filterNames).toContain('constraint-violation');
  });
});

// ─── Section 7 kill conditions ───

describe('applyKillFilters: Section 7 kill conditions', () => {
  it('7.1 kills common bad bets (SEO)', () => {
    const candidates = [makeCandidate({ description: 'Build a website and do SEO to rank' })];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed).toHaveLength(1);
    expect(killed[0].filterNames).toContain('common-bad-bets');
  });

  it('7.1 kills common bad bets (generic template)', () => {
    const candidates = [makeCandidate({ description: 'Create a generic template pack for creators' })];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('common-bad-bets');
  });

  it('7.2 kills signal-too-distant for long timeToSignal with distant markers', () => {
    const candidates = [
      makeCandidate({
        timeToSignal: 'long',
        notes: ['Need to accumulate audience over months of content'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('signal-too-distant');
  });

  it('7.2 does not kill short timeToSignal even with distant markers', () => {
    const candidates = [
      makeCandidate({
        timeToSignal: 'short',
        notes: ['Need to accumulate audience first'],
      }),
    ];

    const { survivors } = applyKillFilters(candidates, 'economic');

    expect(survivors).toHaveLength(1);
  });

  it('7.3 kills low asymmetry when no edge and generic markers present', () => {
    const candidates = [
      makeCandidate({
        description: 'A commodity service anyone can do with no special skill',
        whyThisCandidate: ['Low barrier'],
        assumptions: ['No differentiation needed'],
      }),
    ];
    const constraints: KillFilterConstraints = { edgeProfile: ['quantum computing'] };

    const { killed } = applyKillFilters(candidates, 'economic', constraints);

    expect(killed[0].filterNames).toContain('low-asymmetry');
  });

  it('7.4 kills candidate with no buyer and no judge keywords', () => {
    const candidates = [
      makeCandidate({
        description: 'An abstract concept exploration',
        whyThisCandidate: ['Interesting'],
        assumptions: ['Could work'],
        notes: ['Maybe'],
        probeReadinessHints: ['Something visible'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('no-clear-buyer-judge');
  });

  it('7.5 kills too-heavy-before-contact for long signal + heavy build', () => {
    const candidates = [
      makeCandidate({
        timeToSignal: 'long',
        description: 'Build a full platform before getting any user feedback',
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('too-heavy-before-contact');
  });
});

// ─── Economic-specific filters ───

describe('applyKillFilters: economic regime filters', () => {
  it('kills audience-first community_format without buyer in assumptions', () => {
    const candidates = [
      makeCandidate({
        form: 'community_format',
        assumptions: ['People will join and engage'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('audience-first-buyer-unclear');
  });

  it('passes community_format with buyer in assumptions', () => {
    const candidates = [
      makeCandidate({
        form: 'community_format',
        assumptions: ['Buyer will pay for premium access'],
      }),
    ];

    const { survivors } = applyKillFilters(candidates, 'economic');

    expect(survivors).toHaveLength(1);
  });

  it('kills tool with long signal (build-first-signal-late)', () => {
    const candidates = [
      makeCandidate({
        form: 'tool',
        timeToSignal: 'long',
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('build-first-signal-late');
  });

  it('kills generic tool fantasy', () => {
    const candidates = [
      makeCandidate({
        form: 'tool',
        description: 'A universal tool for everyone that anyone can use',
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('generic-tool-fantasy');
  });

  it('kills education trap (learning_path without buyer)', () => {
    const candidates = [
      makeCandidate({
        form: 'learning_path',
        description: 'A learning path for self improvement',
        whyThisCandidate: ['Helps people grow'],
        assumptions: ['People want to learn'],
        notes: ['No clear revenue'],
        probeReadinessHints: ['Observable outcome after completion'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('education-trap');
  });

  it('kills narrow-pain-broad-build', () => {
    const candidates = [
      makeCandidate({
        description: 'Solve a niche specific pain by building a platform ecosystem',
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'economic');

    expect(killed[0].filterNames).toContain('narrow-pain-broad-build');
  });

  it('does not apply economic filters for governance regime', () => {
    const candidates = [
      makeCandidate({
        form: 'community_format',
        assumptions: ['People will join and engage'],
        notes: ['State change pressure cycle governance'],
        probeReadinessHints: ['Observable outcome visible'],
      }),
    ];

    const { survivors } = applyKillFilters(candidates, 'governance');

    expect(survivors).toHaveLength(1);
  });
});

// ─── Governance-specific filters ───

describe('applyKillFilters: governance regime filters', () => {
  it('kills fake world (no density keywords)', () => {
    const candidates = [
      makeCandidate({
        notes: ['Just a simple website'],
        assumptions: ['People will visit'],
        probeReadinessHints: ['Observable outcome when launched'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'governance');

    expect(killed[0].filterNames).toContain('fake-world');
  });

  it('passes world with density keywords', () => {
    const candidates = [
      makeCandidate({
        notes: ['State transitions under governance pressure create observable cycle'],
        assumptions: ['Density of change events is sufficient for closure'],
        probeReadinessHints: ['Observable outcome from governance cycle'],
      }),
    ];

    const { survivors } = applyKillFilters(candidates, 'governance');

    expect(survivors).toHaveLength(1);
  });

  it('kills tool-in-world-clothing (multiple tool terms)', () => {
    const candidates = [
      makeCandidate({
        description: 'A dashboard with admin panel for managing state changes',
        notes: ['State change governance pressure'],
        assumptions: ['Governance cycle density'],
        probeReadinessHints: ['Observable outcome visible'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'governance');

    expect(killed[0].filterNames).toContain('tool-in-world-clothing');
  });

  it('kills too-large-before-closure', () => {
    const candidates = [
      makeCandidate({
        assumptions: ['Requires complex governance with hundreds of participants'],
        notes: ['State change pressure cycle'],
        probeReadinessHints: ['Observable outcome visible'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'governance');

    expect(killed[0].filterNames).toContain('too-large-before-closure');
  });

  it('kills no-observable-consequence (empty hints)', () => {
    const candidates = [
      makeCandidate({
        probeReadinessHints: [],
        notes: ['State change governance pressure cycle'],
        assumptions: ['Governance density closure'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'governance');

    expect(killed[0].filterNames).toContain('no-observable-consequence');
  });

  it('kills no-observable-consequence (hints without outcome terms)', () => {
    const candidates = [
      makeCandidate({
        probeReadinessHints: ['Just some random hints'],
        notes: ['State change governance pressure cycle'],
        assumptions: ['Governance density closure'],
      }),
    ];

    const { killed } = applyKillFilters(candidates, 'governance');

    expect(killed[0].filterNames).toContain('no-observable-consequence');
  });

  it('does not apply governance filters for economic regime', () => {
    const candidates = [
      makeCandidate({
        notes: ['Just a simple service'],
        assumptions: ['Buyer will pay for this'],
        probeReadinessHints: [],
      }),
    ];

    const { survivors } = applyKillFilters(candidates, 'economic');

    // no-observable-consequence is governance-only, so not applied
    expect(survivors).toHaveLength(1);
  });
});

// ─── Multiple filters accumulate reasons ───

describe('applyKillFilters: accumulation', () => {
  it('accumulates multiple kill reasons on a single candidate', () => {
    const candidates = [
      makeCandidate({
        timeToSignal: 'long',
        description: 'Build a full platform with SEO strategy',
        whyThisCandidate: ['Low barrier'],
        assumptions: ['No differentiation needed, anyone can do'],
        notes: ['Need to accumulate audience, grow community first'],
        probeReadinessHints: ['Maybe something'],
      }),
    ];
    const constraints: KillFilterConstraints = {
      edgeProfile: ['quantum computing'],
      maxSearchFriction: 'low',
      timeHorizon: 'short',
    };

    const { killed } = applyKillFilters(candidates, 'economic', constraints);

    expect(killed).toHaveLength(1);
    expect(killed[0].reasons.length).toBeGreaterThan(1);
    expect(killed[0].filterNames.length).toBeGreaterThan(1);
  });

  it('separates survivors and killed correctly in mixed batch', () => {
    const candidates = [
      makeCandidate({ id: 'good', description: 'Niche video consulting for buyer' }),
      makeCandidate({ id: 'bad', description: 'Build a website and do SEO to rank on Google' }),
    ];

    const { survivors, killed } = applyKillFilters(candidates, 'economic');

    expect(survivors).toHaveLength(1);
    expect(survivors[0].id).toBe('good');
    expect(killed).toHaveLength(1);
    expect(killed[0].candidate.id).toBe('bad');
  });
});
