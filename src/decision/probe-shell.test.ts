import { describe, it, expect } from 'vitest';
import { isProbeReady, packageProbe, recordSignal } from './probe-shell';
import type { RealizationCandidate } from '../schemas/decision';
import type { SignalEvidence } from './probe-shell';

function makeCandidate(overrides: Partial<RealizationCandidate> = {}): RealizationCandidate {
  return {
    id: 'cand-1',
    regime: 'economic',
    form: 'service',
    description: 'Test candidate',
    whyThisCandidate: ['Strong demand'],
    assumptions: ['Users will pay'],
    probeReadinessHints: ['Landing page ready'],
    timeToSignal: 'short',
    notes: ['Note 1'],
    ...overrides,
  };
}

describe('isProbeReady', () => {
  it('returns false for candidate with empty whyThisCandidate', () => {
    const candidate = makeCandidate({ whyThisCandidate: [] });
    expect(isProbeReady(candidate)).toBe(false);
  });

  it('returns false for candidate with empty assumptions', () => {
    const candidate = makeCandidate({ assumptions: [] });
    expect(isProbeReady(candidate)).toBe(false);
  });

  it('returns false for candidate with empty probeReadinessHints', () => {
    const candidate = makeCandidate({ probeReadinessHints: [] });
    expect(isProbeReady(candidate)).toBe(false);
  });

  it('returns false for candidate with undefined probeReadinessHints', () => {
    const candidate = makeCandidate({ probeReadinessHints: undefined });
    expect(isProbeReady(candidate)).toBe(false);
  });

  it('returns true for valid candidate with all fields populated', () => {
    const candidate = makeCandidate();
    expect(isProbeReady(candidate)).toBe(true);
  });
});

describe('packageProbe', () => {
  it('produces valid ProbeableForm with all required fields', () => {
    const candidate = makeCandidate();
    const probe = packageProbe(candidate);

    expect(probe.candidateId).toBe('cand-1');
    expect(probe.regime).toBe('economic');
    expect(probe.hypothesis).toBeDefined();
    expect(probe.hypothesis.length).toBeGreaterThan(0);
    expect(probe.testTarget).toBeDefined();
    expect(probe.judge).toBeDefined();
    expect(probe.cheapestBelievableProbe).toBeDefined();
    expect(probe.disconfirmers).toBeDefined();
    expect(probe.disconfirmers.length).toBeGreaterThan(0);
  });

  it('derives correct testTarget for economic regime', () => {
    const candidate = makeCandidate({ regime: 'economic', vehicle: 'SaaS platform' });
    const probe = packageProbe(candidate);

    expect(probe.testTarget).toContain('buyer willingness to pay');
    expect(probe.testTarget).toContain('SaaS platform');
  });

  it('derives correct testTarget for governance regime', () => {
    const candidate = makeCandidate({ regime: 'governance', worldForm: 'commons' });
    const probe = packageProbe(candidate);

    expect(probe.testTarget).toContain('world density');
    expect(probe.testTarget).toContain('commons');
  });

  it('joins whyThisCandidate into hypothesis', () => {
    const candidate = makeCandidate({ whyThisCandidate: ['Reason A', 'Reason B'] });
    const probe = packageProbe(candidate);

    expect(probe.hypothesis).toBe('Reason A; Reason B');
  });

  it('derives disconfirmers from assumptions', () => {
    const candidate = makeCandidate({ assumptions: ['Users will pay', 'Market exists'] });
    const probe = packageProbe(candidate);

    expect(probe.disconfirmers).toEqual(['NOT: Users will pay', 'NOT: Market exists']);
  });
});

describe('recordSignal', () => {
  it('assembles valid SignalPacket', () => {
    const evidence: SignalEvidence = {
      signalType: 'buyer_interview',
      strength: 'strong',
      evidence: ['Buyer confirmed pain point'],
      interpretation: 'Strong buy signal',
      nextQuestions: ['What price range?'],
    };

    const signal = recordSignal('probe-1', 'cand-1', 'economic', evidence);

    expect(signal.candidateId).toBe('cand-1');
    expect(signal.probeId).toBe('probe-1');
    expect(signal.regime).toBe('economic');
    expect(signal.signalType).toBe('buyer_interview');
    expect(signal.strength).toBe('strong');
  });

  it('preserves all evidence fields including negativeEvidence', () => {
    const evidence: SignalEvidence = {
      signalType: 'market_test',
      strength: 'moderate',
      evidence: ['Some interest shown'],
      negativeEvidence: ['Price resistance noted'],
      interpretation: 'Mixed signals',
      nextQuestions: ['Try lower price?'],
    };

    const signal = recordSignal('probe-2', 'cand-2', 'economic', evidence);

    expect(signal.evidence).toEqual(['Some interest shown']);
    expect(signal.negativeEvidence).toEqual(['Price resistance noted']);
    expect(signal.interpretation).toBe('Mixed signals');
    expect(signal.nextQuestions).toEqual(['Try lower price?']);
  });

  it('handles missing negativeEvidence', () => {
    const evidence: SignalEvidence = {
      signalType: 'user_test',
      strength: 'weak',
      evidence: ['Some usage'],
      interpretation: 'Low engagement',
      nextQuestions: ['Why low?'],
    };

    const signal = recordSignal('probe-3', 'cand-3', 'governance', evidence);

    expect(signal.negativeEvidence).toBeUndefined();
  });
});
