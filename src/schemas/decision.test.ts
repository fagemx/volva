import { describe, it, expect } from 'vitest';
import {
  RegimeEnum,
  RealizationFormEnum,
  WorldFormEnum,
  IntentRouteSchema,
  FixedElementSchema,
  UnresolvedElementSchema,
  PathCheckResultSchema,
  RealizationCandidateSchema,
  GovernanceWorldCandidateSchema,
  ProbeableFormSchema,
  SignalPacketSchema,
  EvaluatorInputSchema,
  EvaluatorOutputSchema,
  CommitMemoSchema,
  EconomicCommitMemoSchema,
  GovernanceCommitMemoSchema,
  CapabilityCommitMemoSchema,
  LeverageCommitMemoSchema,
  ExpressionCommitMemoSchema,
  IdentityCommitMemoSchema,
} from './decision';

// ─── Enum Tests ───

describe('RegimeEnum', () => {
  it('accepts all 6 regime values', () => {
    const values = ['economic', 'capability', 'leverage', 'expression', 'governance', 'identity'];
    for (const v of values) {
      expect(RegimeEnum.safeParse(v).success).toBe(true);
    }
    expect(RegimeEnum.options).toHaveLength(6);
  });

  it('rejects invalid regime', () => {
    expect(RegimeEnum.safeParse('finance').success).toBe(false);
  });
});

describe('RealizationFormEnum', () => {
  it('has exactly 10 values', () => {
    expect(RealizationFormEnum.options).toHaveLength(10);
  });

  it('accepts valid values', () => {
    expect(RealizationFormEnum.safeParse('service').success).toBe(true);
    expect(RealizationFormEnum.safeParse('world').success).toBe(true);
    expect(RealizationFormEnum.safeParse('community_format').success).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(RealizationFormEnum.safeParse('app').success).toBe(false);
  });
});

describe('WorldFormEnum', () => {
  it('has exactly 6 values', () => {
    expect(WorldFormEnum.options).toHaveLength(6);
  });

  it('accepts valid values', () => {
    expect(WorldFormEnum.safeParse('market').success).toBe(true);
    expect(WorldFormEnum.safeParse('night_engine').success).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(WorldFormEnum.safeParse('kingdom').success).toBe(false);
  });
});

// ─── Section 2: Intent Router ───

describe('IntentRouteSchema', () => {
  const validRoute = {
    primaryRegime: 'economic',
    confidence: 0.85,
    signals: ['pricing mention'],
    rationale: ['user discussed revenue'],
    keyUnknowns: ['target market'],
    suggestedFollowups: ['ask about pricing'],
  };

  it('parses valid intent route', () => {
    const result = IntentRouteSchema.safeParse(validRoute);
    expect(result.success).toBe(true);
  });

  it('parses with optional secondaryRegimes', () => {
    const result = IntentRouteSchema.safeParse({
      ...validRoute,
      secondaryRegimes: ['capability', 'leverage'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = IntentRouteSchema.safeParse({ ...validRoute, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence < 0', () => {
    const result = IntentRouteSchema.safeParse({ ...validRoute, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid primaryRegime', () => {
    const result = IntentRouteSchema.safeParse({ ...validRoute, primaryRegime: 'finance' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = IntentRouteSchema.safeParse({ primaryRegime: 'economic' });
    expect(result.success).toBe(false);
  });
});

// ─── Section 3: Path Check ───

describe('FixedElementSchema', () => {
  it('parses valid fixed element', () => {
    const result = FixedElementSchema.safeParse({ kind: 'intent', value: 'sell courses' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid kind', () => {
    const result = FixedElementSchema.safeParse({ kind: 'unknown', value: 'test' });
    expect(result.success).toBe(false);
  });
});

describe('UnresolvedElementSchema', () => {
  it('parses valid unresolved element', () => {
    const result = UnresolvedElementSchema.safeParse({
      kind: 'domain',
      reason: 'not specified',
      severity: 'blocking',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const result = UnresolvedElementSchema.safeParse({
      kind: 'domain',
      reason: 'not specified',
      severity: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('PathCheckResultSchema', () => {
  const validResult = {
    certainty: 'medium',
    route: 'space-builder',
    fixedElements: [{ kind: 'intent', value: 'sell courses' }],
    unresolvedElements: [{ kind: 'domain', reason: 'unclear', severity: 'blocking' }],
    recommendedNextStep: 'ask about domain',
  };

  it('parses valid path check result', () => {
    const result = PathCheckResultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it('parses with optional whyNotReady and whyReady', () => {
    const result = PathCheckResultSchema.safeParse({
      ...validResult,
      whyNotReady: ['missing domain'],
      whyReady: ['intent is clear'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid route', () => {
    const result = PathCheckResultSchema.safeParse({ ...validResult, route: 'invalid-route' });
    expect(result.success).toBe(false);
  });

  it('accepts all 3 route values', () => {
    for (const route of ['space-builder', 'forge-fast-path', 'space-builder-then-forge']) {
      const result = PathCheckResultSchema.safeParse({ ...validResult, route });
      expect(result.success).toBe(true);
    }
  });
});

// ─── Section 4: Space Builder ───

describe('RealizationCandidateSchema', () => {
  const validCandidate = {
    id: 'cand-1',
    regime: 'economic',
    form: 'service',
    description: 'Consulting service',
    whyThisCandidate: ['market demand'],
    assumptions: ['target exists'],
    timeToSignal: 'short',
    notes: ['first candidate'],
  };

  it('parses valid candidate', () => {
    const result = RealizationCandidateSchema.safeParse(validCandidate);
    expect(result.success).toBe(true);
  });

  it('parses with optional fields', () => {
    const result = RealizationCandidateSchema.safeParse({
      ...validCandidate,
      domain: 'education',
      vehicle: 'online platform',
      worldForm: 'market',
      probeReadinessHints: ['has audience'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid form', () => {
    const result = RealizationCandidateSchema.safeParse({ ...validCandidate, form: 'app' });
    expect(result.success).toBe(false);
  });
});

describe('GovernanceWorldCandidateSchema', () => {
  const validGovCandidate = {
    id: 'gov-1',
    regime: 'governance',
    form: 'world',
    description: 'A governance world',
    whyThisCandidate: ['governance need'],
    assumptions: ['community exists'],
    timeToSignal: 'long',
    notes: [],
    worldForm: 'town',
    stateDensity: 'medium',
    changeClarity: 'high',
    governancePressure: 'low',
    outcomeVisibility: 'medium',
    cycleability: 'high',
    likelyMinimumWorldShape: ['basic rules'],
    mainRisks: ['low participation'],
  };

  it('parses valid governance world candidate', () => {
    const result = GovernanceWorldCandidateSchema.safeParse(validGovCandidate);
    expect(result.success).toBe(true);
  });

  it('requires worldForm (not optional)', () => {
    const withoutWorldForm = Object.fromEntries(
      Object.entries(validGovCandidate).filter(([k]) => k !== 'worldForm'),
    );
    const result = GovernanceWorldCandidateSchema.safeParse(withoutWorldForm);
    expect(result.success).toBe(false);
  });

  it('rejects missing governance-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validGovCandidate).filter(([k]) => k !== 'stateDensity'),
    );
    const result = GovernanceWorldCandidateSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

// ─── Section 5: Probe-Commit ───

describe('ProbeableFormSchema', () => {
  const validForm = {
    candidateId: 'cand-1',
    regime: 'economic',
    hypothesis: 'People will pay for this',
    testTarget: 'freelancers',
    judge: 'conversion rate',
    cheapestBelievableProbe: 'landing page test',
    disconfirmers: ['no signups'],
  };

  it('parses valid probeable form', () => {
    const result = ProbeableFormSchema.safeParse(validForm);
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const without = Object.fromEntries(
      Object.entries(validForm).filter(([k]) => k !== 'hypothesis'),
    );
    const result = ProbeableFormSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('SignalPacketSchema', () => {
  const validSignal = {
    candidateId: 'cand-1',
    probeId: 'probe-1',
    regime: 'economic',
    signalType: 'willingness_to_pay',
    strength: 'moderate',
    evidence: ['3 out of 5 said yes'],
    interpretation: 'moderate interest',
    nextQuestions: ['what price point?'],
  };

  it('parses valid signal packet', () => {
    const result = SignalPacketSchema.safeParse(validSignal);
    expect(result.success).toBe(true);
  });

  it('accepts any string for signalType', () => {
    const result = SignalPacketSchema.safeParse({
      ...validSignal,
      signalType: 'custom_regime_signal',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid strength', () => {
    const result = SignalPacketSchema.safeParse({ ...validSignal, strength: 'very_strong' });
    expect(result.success).toBe(false);
  });
});

describe('EvaluatorInputSchema', () => {
  it('parses valid evaluator input', () => {
    const result = EvaluatorInputSchema.safeParse({
      candidate: {
        id: 'c1', regime: 'economic', form: 'service',
        description: 'test', whyThisCandidate: [], assumptions: [],
        timeToSignal: 'short', notes: [],
      },
      probeableForm: {
        candidateId: 'c1', regime: 'economic',
        hypothesis: 'h', testTarget: 't', judge: 'j',
        cheapestBelievableProbe: 'p', disconfirmers: [],
      },
      signals: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional context as record', () => {
    const result = EvaluatorInputSchema.safeParse({
      candidate: {
        id: 'c1', regime: 'economic', form: 'service',
        description: 'test', whyThisCandidate: [], assumptions: [],
        timeToSignal: 'short', notes: [],
      },
      probeableForm: {
        candidateId: 'c1', regime: 'economic',
        hypothesis: 'h', testTarget: 't', judge: 'j',
        cheapestBelievableProbe: 'p', disconfirmers: [],
      },
      signals: [],
      context: { key: 'value', nested: { a: 1 } },
    });
    expect(result.success).toBe(true);
  });
});

describe('EvaluatorOutputSchema', () => {
  const validOutput = {
    verdict: 'commit',
    rationale: ['strong signal'],
    evidenceUsed: ['probe result'],
    unresolvedRisks: ['market size unknown'],
    recommendedNextStep: ['build MVP'],
  };

  it('parses valid evaluator output', () => {
    const result = EvaluatorOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('accepts optional handoffNotes', () => {
    const result = EvaluatorOutputSchema.safeParse({
      ...validOutput,
      handoffNotes: ['pass to forge'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid verdict', () => {
    const result = EvaluatorOutputSchema.safeParse({ ...validOutput, verdict: 'approve' });
    expect(result.success).toBe(false);
  });

  it('accepts all 3 verdict values', () => {
    for (const verdict of ['commit', 'hold', 'discard']) {
      const result = EvaluatorOutputSchema.safeParse({ ...validOutput, verdict });
      expect(result.success).toBe(true);
    }
  });
});

describe('CommitMemoSchema', () => {
  const validMemo = {
    candidateId: 'cand-1',
    regime: 'economic',
    verdict: 'commit',
    rationale: ['strong signal'],
    evidenceUsed: ['probe-1'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['landing page'],
    whatForgeMustNotBuild: ['full platform'],
    recommendedNextStep: ['validate pricing'],
  };

  it('parses valid commit memo', () => {
    const result = CommitMemoSchema.safeParse(validMemo);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const without = Object.fromEntries(
      Object.entries(validMemo).filter(([k]) => k !== 'whatForgeShouldBuild'),
    );
    const result = CommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('EconomicCommitMemoSchema', () => {
  const validEconMemo = {
    candidateId: 'cand-1',
    regime: 'economic',
    verdict: 'commit',
    rationale: ['signal'],
    evidenceUsed: ['probe'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['mvp'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['launch'],
    buyerHypothesis: 'freelancers need this',
    painHypothesis: 'manual process is slow',
    paymentEvidence: ['3 said would pay'],
    whyThisVehicleNow: ['market timing'],
    nextSignalAfterBuild: ['conversion rate'],
  };

  it('parses valid economic commit memo', () => {
    const result = EconomicCommitMemoSchema.safeParse(validEconMemo);
    expect(result.success).toBe(true);
  });

  it('rejects missing economic-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validEconMemo).filter(([k]) => k !== 'buyerHypothesis'),
    );
    const result = EconomicCommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('GovernanceCommitMemoSchema', () => {
  const validGovMemo = {
    candidateId: 'cand-1',
    regime: 'governance',
    verdict: 'commit',
    rationale: ['signal'],
    evidenceUsed: ['probe'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['world skeleton'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['design first cycle'],
    selectedWorldForm: 'town',
    minimumWorldShape: ['basic rules', 'entry criteria'],
    stateDensityAssessment: 'medium',
    governancePressureAssessment: 'low',
    firstCycleDesign: ['setup phase'],
    thyraHandoffRequirements: ['world snapshot schema'],
  };

  it('parses valid governance commit memo', () => {
    const result = GovernanceCommitMemoSchema.safeParse(validGovMemo);
    expect(result.success).toBe(true);
  });

  it('rejects invalid selectedWorldForm', () => {
    const result = GovernanceCommitMemoSchema.safeParse({
      ...validGovMemo,
      selectedWorldForm: 'kingdom',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing governance-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validGovMemo).filter(([k]) => k !== 'selectedWorldForm'),
    );
    const result = GovernanceCommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('CapabilityCommitMemoSchema', () => {
  const validCapMemo = {
    candidateId: 'cand-1',
    regime: 'capability',
    verdict: 'commit',
    rationale: ['skill gap'],
    evidenceUsed: ['assessment'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['practice loop'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['start practice'],
    skillDomain: 'data-analysis',
    currentLevel: 'beginner',
    targetLevel: 'intermediate',
    proofMethod: 'portfolio',
    milestones: ['case study 1', 'case study 2'],
  };

  it('parses valid capability commit memo', () => {
    const result = CapabilityCommitMemoSchema.safeParse(validCapMemo);
    expect(result.success).toBe(true);
  });

  it('rejects missing capability-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validCapMemo).filter(([k]) => k !== 'skillDomain'),
    );
    const result = CapabilityCommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('LeverageCommitMemoSchema', () => {
  const validLevMemo = {
    candidateId: 'cand-1',
    regime: 'leverage',
    verdict: 'commit',
    rationale: ['bottleneck identified'],
    evidenceUsed: ['time tracking'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['automation pipeline'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['deploy MVP'],
    leverageType: 'automation',
    currentBottleneck: 'manual data entry',
    amplificationTarget: '5x throughput',
    dependencies: ['API access'],
    riskIfNotBuilt: 'team burnout',
  };

  it('parses valid leverage commit memo', () => {
    const result = LeverageCommitMemoSchema.safeParse(validLevMemo);
    expect(result.success).toBe(true);
  });

  it('rejects missing leverage-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validLevMemo).filter(([k]) => k !== 'leverageType'),
    );
    const result = LeverageCommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('ExpressionCommitMemoSchema', () => {
  const validExpMemo = {
    candidateId: 'cand-1',
    regime: 'expression',
    verdict: 'commit',
    rationale: ['brand needed'],
    evidenceUsed: ['feedback'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['landing page'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['launch'],
    medium: 'website',
    audience: 'developers',
    coreMessage: 'tools for craft',
    styleConstraints: ['minimalist'],
    existingAssets: ['logo'],
  };

  it('parses valid expression commit memo', () => {
    const result = ExpressionCommitMemoSchema.safeParse(validExpMemo);
    expect(result.success).toBe(true);
  });

  it('rejects missing expression-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validExpMemo).filter(([k]) => k !== 'medium'),
    );
    const result = ExpressionCommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});

describe('IdentityCommitMemoSchema', () => {
  const validIdMemo = {
    candidateId: 'cand-1',
    regime: 'identity',
    verdict: 'commit',
    rationale: ['culture definition needed'],
    evidenceUsed: ['survey'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['values framework'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['workshop'],
    scope: 'engineering-team',
    coreValues: ['craft', 'autonomy'],
    tensions: ['speed vs quality'],
    rituals: ['weekly retro'],
    boundaries: ['no blame'],
  };

  it('parses valid identity commit memo', () => {
    const result = IdentityCommitMemoSchema.safeParse(validIdMemo);
    expect(result.success).toBe(true);
  });

  it('rejects missing identity-specific fields', () => {
    const without = Object.fromEntries(
      Object.entries(validIdMemo).filter(([k]) => k !== 'scope'),
    );
    const result = IdentityCommitMemoSchema.safeParse(without);
    expect(result.success).toBe(false);
  });
});
