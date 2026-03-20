import { describe, it, expect } from 'vitest';
import { buildForgeBuildRequest, buildSyntheticCommitMemo, type ForgeHandoffContext } from './forge-handoff';
import { ForgeBuildRequestSchema } from '../karvi-client/schemas';
import type {
  CapabilityCommitMemo,
  EconomicCommitMemo,
  ExpressionCommitMemo,
  GovernanceCommitMemo,
  IdentityCommitMemo,
  LeverageCommitMemo,
  CommitMemo,
  PathCheckResult,
} from '../schemas/decision';

// ─── Fixtures ───

function makeContext(overrides?: Partial<ForgeHandoffContext>): ForgeHandoffContext {
  return {
    sessionId: 'session-001',
    workingDir: '/tmp/test',
    targetRepo: 'test-repo',
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
    whatForgeMustNotBuild: ['Full product before buyer validation'],
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

function makeCapabilityMemo(overrides?: Partial<CapabilityCommitMemo>): CapabilityCommitMemo {
  return {
    candidateId: 'cap-001',
    regime: 'capability',
    verdict: 'commit',
    rationale: ['Skill gap identified in data analysis'],
    evidenceUsed: ['Self-assessment results'],
    unresolvedRisks: ['Time commitment uncertain'],
    whatForgeShouldBuild: ['Practice loop structure', 'Portfolio template'],
    whatForgeMustNotBuild: ['Full certification program'],
    recommendedNextStep: ['Start daily practice'],
    skillDomain: 'data-analysis',
    currentLevel: 'beginner',
    targetLevel: 'intermediate',
    proofMethod: 'portfolio review',
    milestones: ['Complete 3 case studies', 'Pass skill assessment'],
    ...overrides,
  };
}

function makeLeverageMemo(overrides?: Partial<LeverageCommitMemo>): LeverageCommitMemo {
  return {
    candidateId: 'lev-001',
    regime: 'leverage',
    verdict: 'commit',
    rationale: ['Manual process consuming 10h/week'],
    evidenceUsed: ['Time tracking data'],
    unresolvedRisks: ['Integration complexity'],
    whatForgeShouldBuild: ['Automation pipeline', 'Monitoring dashboard'],
    whatForgeMustNotBuild: ['Full enterprise platform'],
    recommendedNextStep: ['Deploy MVP automation'],
    leverageType: 'automation',
    currentBottleneck: 'Manual data entry consuming 10h/week',
    amplificationTarget: '5x throughput improvement',
    dependencies: ['API access', 'Data schema documentation'],
    riskIfNotBuilt: 'Team burnout from repetitive tasks',
    ...overrides,
  };
}

function makeExpressionMemo(overrides?: Partial<ExpressionCommitMemo>): ExpressionCommitMemo {
  return {
    candidateId: 'exp-001',
    regime: 'expression',
    verdict: 'commit',
    rationale: ['Brand identity needs clear articulation'],
    evidenceUsed: ['Customer feedback', 'Competitor analysis'],
    unresolvedRisks: ['Audience reception unknown'],
    whatForgeShouldBuild: ['Landing page', 'Brand guide'],
    whatForgeMustNotBuild: ['Full marketing campaign'],
    recommendedNextStep: ['Launch landing page and measure engagement'],
    medium: 'website',
    audience: 'indie developers',
    coreMessage: 'Tools that respect your craft',
    styleConstraints: ['Minimalist', 'Technical but approachable'],
    existingAssets: ['Logo draft', 'Color palette'],
    ...overrides,
  };
}

function makeIdentityMemo(overrides?: Partial<IdentityCommitMemo>): IdentityCommitMemo {
  return {
    candidateId: 'id-001',
    regime: 'identity',
    verdict: 'commit',
    rationale: ['Team culture needs definition'],
    evidenceUsed: ['Team survey results'],
    unresolvedRisks: ['Disagreement on values'],
    whatForgeShouldBuild: ['Values framework', 'Decision principles'],
    whatForgeMustNotBuild: ['Rigid hierarchy'],
    recommendedNextStep: ['Workshop to align on values'],
    scope: 'engineering-team',
    coreValues: ['Craft', 'Autonomy', 'Transparency'],
    tensions: ['Speed vs quality', 'Individual vs team'],
    rituals: ['Weekly retro', 'Pair programming sessions'],
    boundaries: ['No blame culture', 'No mandatory overtime'],
    ...overrides,
  };
}

function makeBaseMemo(overrides?: Partial<CommitMemo>): CommitMemo {
  return {
    candidateId: 'cap-001',
    regime: 'capability',
    verdict: 'commit',
    rationale: ['Skill gap identified'],
    evidenceUsed: ['Self-assessment'],
    unresolvedRisks: ['Time commitment'],
    whatForgeShouldBuild: ['Practice loop structure'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['Start daily practice'],
    ...overrides,
  };
}

function makePathCheckResult(overrides?: Partial<PathCheckResult>): PathCheckResult {
  return {
    certainty: 'high',
    route: 'forge-fast-path',
    fixedElements: [
      { kind: 'domain', value: 'freelance-design' },
      { kind: 'form', value: 'service' },
      { kind: 'build_target', value: 'Project management tool' },
      { kind: 'buyer', value: 'Freelance designers' },
      { kind: 'intent', value: 'Automate project tracking' },
    ],
    unresolvedElements: [
      { kind: 'signal', reason: 'No pricing data yet', severity: 'important' },
    ],
    recommendedNextStep: 'Launch MVP and measure conversion',
    ...overrides,
  };
}

// ─── Tests ───

describe('buildForgeBuildRequest', () => {
  describe('economic regime', () => {
    it('maps EconomicCommitMemo to ForgeBuildRequest with economic regimeContext', () => {
      const memo = makeEconomicMemo();
      const ctx = makeContext();
      const result = buildForgeBuildRequest(memo, ctx);

      expect(result.sessionId).toBe(ctx.sessionId);
      expect(result.candidateId).toBe(memo.candidateId);
      expect(result.regime).toBe('economic');
      expect(result.verdict).toBe('commit');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
      expect(result.whatNotToBuild).toEqual(memo.whatForgeMustNotBuild);
      expect(result.rationale).toEqual(memo.rationale);
      expect(result.evidenceUsed).toEqual(memo.evidenceUsed);
      expect(result.unresolvedRisks).toEqual(memo.unresolvedRisks);
    });

    it('includes all 6 economic regimeContext fields', () => {
      const memo = makeEconomicMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regimeContext.kind).toBe('economic');
      if (result.regimeContext.kind !== 'economic') throw new Error('unreachable');

      expect(result.regimeContext.buyerHypothesis).toBe(memo.buyerHypothesis);
      expect(result.regimeContext.painHypothesis).toBe(memo.painHypothesis);
      expect(result.regimeContext.vehicleType).toBe(memo.whyThisVehicleNow[0]);
      expect(result.regimeContext.paymentEvidence).toEqual(memo.paymentEvidence);
      expect(result.regimeContext.whyThisVehicleNow).toEqual(memo.whyThisVehicleNow);
      expect(result.regimeContext.nextSignalAfterBuild).toEqual(memo.nextSignalAfterBuild);
    });

    it('derives vehicleType from whyThisVehicleNow[0]', () => {
      const memo = makeEconomicMemo({ whyThisVehicleNow: ['SaaS platform'] });
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'economic') throw new Error('unreachable');
      expect(result.regimeContext.vehicleType).toBe('SaaS platform');
    });

    it('falls back vehicleType to unknown when whyThisVehicleNow is empty', () => {
      const memo = makeEconomicMemo({ whyThisVehicleNow: [] });
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'economic') throw new Error('unreachable');
      expect(result.regimeContext.vehicleType).toBe('unknown');
    });

    it('includes context fields from ForgeHandoffContext', () => {
      const ctx = makeContext({ workingDir: '/projects/demo', targetRepo: 'org/repo' });
      const result = buildForgeBuildRequest(makeEconomicMemo(), ctx);

      expect(result.context.workingDir).toBe('/projects/demo');
      expect(result.context.targetRepo).toBe('org/repo');
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeEconomicMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('governance regime', () => {
    it('maps GovernanceCommitMemo to ForgeBuildRequest with governance regimeContext', () => {
      const memo = makeGovernanceMemo();
      const ctx = makeContext();
      const result = buildForgeBuildRequest(memo, ctx);

      expect(result.sessionId).toBe(ctx.sessionId);
      expect(result.candidateId).toBe(memo.candidateId);
      expect(result.regime).toBe('governance');
      expect(result.verdict).toBe('commit');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
      expect(result.whatNotToBuild).toEqual(memo.whatForgeMustNotBuild);
    });

    it('includes all 6 governance regimeContext fields', () => {
      const memo = makeGovernanceMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regimeContext.kind).toBe('governance');
      if (result.regimeContext.kind !== 'governance') throw new Error('unreachable');

      expect(result.regimeContext.worldForm).toBe(memo.selectedWorldForm);
      expect(result.regimeContext.minimumWorldShape).toEqual(memo.minimumWorldShape);
      expect(result.regimeContext.firstCycleDesign).toEqual(memo.firstCycleDesign);
      expect(result.regimeContext.stateDensityAssessment).toBe(memo.stateDensityAssessment);
      expect(result.regimeContext.governancePressureAssessment).toBe(memo.governancePressureAssessment);
      expect(result.regimeContext.thyraHandoffRequirements).toEqual(memo.thyraHandoffRequirements);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeGovernanceMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('capability regime', () => {
    it('maps CapabilityCommitMemo to ForgeBuildRequest with capability regimeContext', () => {
      const memo = makeCapabilityMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regime).toBe('capability');
      expect(result.regimeContext.kind).toBe('capability');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
    });

    it('includes all 5 capability regimeContext fields', () => {
      const memo = makeCapabilityMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'capability') throw new Error('unreachable');

      expect(result.regimeContext.skillDomain).toBe(memo.skillDomain);
      expect(result.regimeContext.currentLevel).toBe(memo.currentLevel);
      expect(result.regimeContext.targetLevel).toBe(memo.targetLevel);
      expect(result.regimeContext.proofMethod).toBe(memo.proofMethod);
      expect(result.regimeContext.milestones).toEqual(memo.milestones);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeCapabilityMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('leverage regime', () => {
    it('maps LeverageCommitMemo to ForgeBuildRequest with leverage regimeContext', () => {
      const memo = makeLeverageMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regime).toBe('leverage');
      expect(result.regimeContext.kind).toBe('leverage');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
    });

    it('includes all 5 leverage regimeContext fields', () => {
      const memo = makeLeverageMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'leverage') throw new Error('unreachable');

      expect(result.regimeContext.leverageType).toBe(memo.leverageType);
      expect(result.regimeContext.currentBottleneck).toBe(memo.currentBottleneck);
      expect(result.regimeContext.amplificationTarget).toBe(memo.amplificationTarget);
      expect(result.regimeContext.dependencies).toEqual(memo.dependencies);
      expect(result.regimeContext.riskIfNotBuilt).toBe(memo.riskIfNotBuilt);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeLeverageMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('expression regime', () => {
    it('maps ExpressionCommitMemo to ForgeBuildRequest with expression regimeContext', () => {
      const memo = makeExpressionMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regime).toBe('expression');
      expect(result.regimeContext.kind).toBe('expression');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
    });

    it('includes all 5 expression regimeContext fields', () => {
      const memo = makeExpressionMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'expression') throw new Error('unreachable');

      expect(result.regimeContext.medium).toBe(memo.medium);
      expect(result.regimeContext.audience).toBe(memo.audience);
      expect(result.regimeContext.coreMessage).toBe(memo.coreMessage);
      expect(result.regimeContext.styleConstraints).toEqual(memo.styleConstraints);
      expect(result.regimeContext.existingAssets).toEqual(memo.existingAssets);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeExpressionMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('identity regime', () => {
    it('maps IdentityCommitMemo to ForgeBuildRequest with identity regimeContext', () => {
      const memo = makeIdentityMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regime).toBe('identity');
      expect(result.regimeContext.kind).toBe('identity');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
    });

    it('includes all 5 identity regimeContext fields', () => {
      const memo = makeIdentityMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'identity') throw new Error('unreachable');

      expect(result.regimeContext.scope).toBe(memo.scope);
      expect(result.regimeContext.coreValues).toEqual(memo.coreValues);
      expect(result.regimeContext.tensions).toEqual(memo.tensions);
      expect(result.regimeContext.rituals).toEqual(memo.rituals);
      expect(result.regimeContext.boundaries).toEqual(memo.boundaries);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeIdentityMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('base CommitMemo fallback (no regime-specific extension)', () => {
    it('maps base capability memo to ForgeBuildRequest with capability regimeContext', () => {
      const memo = makeBaseMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regime).toBe('capability');
      expect(result.regimeContext.kind).toBe('capability');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
    });

    it('derives capability context fields from base memo fields', () => {
      const memo = makeBaseMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'capability') throw new Error('unreachable');
      expect(result.regimeContext.skillDomain).toBe(memo.rationale[0]);
      expect(result.regimeContext.currentLevel).toBe('unknown');
      expect(result.regimeContext.targetLevel).toBe('unknown');
      expect(result.regimeContext.proofMethod).toBe(memo.recommendedNextStep[0]);
      expect(result.regimeContext.milestones).toEqual(memo.whatForgeShouldBuild);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeBaseMemo(), makeContext());
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('handles base memo with leverage regime', () => {
      const memo = makeBaseMemo({ regime: 'leverage' });
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regimeContext.kind).toBe('leverage');
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('handles base memo with expression regime', () => {
      const memo = makeBaseMemo({ regime: 'expression' });
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regimeContext.kind).toBe('expression');
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('handles base memo with identity regime', () => {
      const memo = makeBaseMemo({ regime: 'identity' });
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regimeContext.kind).toBe('identity');
      const parsed = ForgeBuildRequestSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('context handling', () => {
    it('handles optional context fields', () => {
      const ctx = makeContext({ workingDir: undefined, targetRepo: undefined });
      const result = buildForgeBuildRequest(makeEconomicMemo(), ctx);

      expect(result.context.workingDir).toBeUndefined();
      expect(result.context.targetRepo).toBeUndefined();
    });
  });
});

describe('buildSyntheticCommitMemo', () => {
  it('builds economic synthetic CommitMemo from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'economic');

    expect(result.regime).toBe('economic');
    expect(result.verdict).toBe('commit');
    expect('buyerHypothesis' in result).toBe(true);

    const eco = result as EconomicCommitMemo;
    expect(eco.buyerHypothesis).toBe('Freelance designers');
    expect(eco.painHypothesis).toBe('Automate project tracking');
    expect(eco.whyThisVehicleNow).toEqual(['service']);
    expect(eco.nextSignalAfterBuild).toEqual(['Launch MVP and measure conversion']);
    expect(eco.whatForgeShouldBuild).toContain('Project management tool');
  });

  it('builds governance synthetic CommitMemo from PathCheckResult', () => {
    const pcr = makePathCheckResult({
      fixedElements: [
        { kind: 'domain', value: 'community-garden' },
        { kind: 'form', value: 'commons' },
        { kind: 'build_target', value: 'Garden governance world' },
      ],
      whyReady: ['Clear domain', 'Defined participants'],
    });
    const result = buildSyntheticCommitMemo(pcr, 'governance');

    expect(result.regime).toBe('governance');
    expect('selectedWorldForm' in result).toBe(true);

    const gov = result as GovernanceCommitMemo;
    expect(gov.selectedWorldForm).toBe('commons');
    expect(gov.minimumWorldShape).toEqual(['Clear domain', 'Defined participants']);
    expect(gov.firstCycleDesign).toEqual(['Launch MVP and measure conversion']);
    expect(gov.thyraHandoffRequirements).toEqual(['Clear domain', 'Defined participants']);
  });

  it('builds capability synthetic CommitMemo from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'capability');

    expect(result.regime).toBe('capability');
    expect(result.verdict).toBe('commit');
    expect('skillDomain' in result).toBe(true);

    const cap = result as CapabilityCommitMemo;
    expect(cap.skillDomain).toBe('freelance-design');
    expect(cap.proofMethod).toBe('service');
    expect(cap.milestones).toContain('Project management tool');
  });

  it('builds leverage synthetic CommitMemo from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'leverage');

    expect(result.regime).toBe('leverage');
    expect('leverageType' in result).toBe(true);

    const lev = result as LeverageCommitMemo;
    expect(lev.leverageType).toBe('service');
    expect(lev.currentBottleneck).toBe('Automate project tracking');
  });

  it('builds expression synthetic CommitMemo from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'expression');

    expect(result.regime).toBe('expression');
    expect('medium' in result).toBe(true);

    const exp = result as ExpressionCommitMemo;
    expect(exp.medium).toBe('service');
    expect(exp.audience).toBe('Freelance designers');
    expect(exp.coreMessage).toBe('Automate project tracking');
  });

  it('builds identity synthetic CommitMemo from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'identity');

    expect(result.regime).toBe('identity');
    expect('scope' in result).toBe(true);

    const id = result as IdentityCommitMemo;
    expect(id.scope).toBe('freelance-design');
    expect(id.coreValues.length).toBeGreaterThan(0);
  });

  it('includes unresolved risks from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'economic');

    expect(result.unresolvedRisks).toContain('signal: No pricing data yet');
  });

  it('falls back to market when governance form is invalid', () => {
    const pcr = makePathCheckResult({
      fixedElements: [
        { kind: 'domain', value: 'community-garden' },
        { kind: 'form', value: 'invalid_form_value' },
        { kind: 'build_target', value: 'Garden governance world' },
      ],
    });
    const result = buildSyntheticCommitMemo(pcr, 'governance');

    expect(result.regime).toBe('governance');
    const gov = result as GovernanceCommitMemo;
    expect(gov.selectedWorldForm).toBe('market');
  });

  it('handles missing fixedElements gracefully', () => {
    const pcr = makePathCheckResult({
      fixedElements: [],
    });
    const result = buildSyntheticCommitMemo(pcr, 'economic');

    const eco = result as EconomicCommitMemo;
    expect(eco.buyerHypothesis).toBe(' buyer');
    expect(eco.whatForgeShouldBuild[0]).toBe('Build  for ');
  });
});
