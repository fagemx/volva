import { describe, it, expect } from 'vitest';
import { buildForgeBuildRequest, buildSyntheticCommitMemo, type ForgeHandoffContext } from './forge-handoff';
import { ForgeBuildRequestSchema } from '../karvi-client/schemas';
import type {
  EconomicCommitMemo,
  GovernanceCommitMemo,
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

  describe('generic fallback', () => {
    it('maps non-economic non-governance memo to ForgeBuildRequest with economic regimeContext', () => {
      const memo = makeBaseMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      expect(result.regime).toBe('capability');
      expect(result.regimeContext.kind).toBe('economic');
      expect(result.whatToBuild).toEqual(memo.whatForgeShouldBuild);
    });

    it('uses rationale as fallback for economic fields', () => {
      const memo = makeBaseMemo();
      const result = buildForgeBuildRequest(memo, makeContext());

      if (result.regimeContext.kind !== 'economic') throw new Error('unreachable');
      expect(result.regimeContext.buyerHypothesis).toBe(memo.rationale[0]);
      expect(result.regimeContext.painHypothesis).toBe(memo.rationale.join('; '));
      expect(result.regimeContext.vehicleType).toBe('unknown');
      expect(result.regimeContext.paymentEvidence).toEqual([]);
      expect(result.regimeContext.whyThisVehicleNow).toEqual([]);
      expect(result.regimeContext.nextSignalAfterBuild).toEqual(memo.recommendedNextStep);
    });

    it('validates output against ForgeBuildRequestSchema', () => {
      const result = buildForgeBuildRequest(makeBaseMemo(), makeContext());
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

  it('builds base CommitMemo for non-economic non-governance regime', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'capability');

    expect(result.regime).toBe('capability');
    expect(result.verdict).toBe('commit');
    expect('buyerHypothesis' in result).toBe(false);
    expect('selectedWorldForm' in result).toBe(false);
    expect(result.whatForgeShouldBuild).toContain('Project management tool');
  });

  it('includes unresolved risks from PathCheckResult', () => {
    const pcr = makePathCheckResult();
    const result = buildSyntheticCommitMemo(pcr, 'economic');

    expect(result.unresolvedRisks).toContain('signal: No pricing data yet');
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
