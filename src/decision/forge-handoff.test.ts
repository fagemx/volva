import { describe, it, expect } from 'vitest';
import { translateToSettlement, buildSyntheticCommitMemo } from './forge-handoff';
import type {
  EconomicCommitMemo,
  GovernanceCommitMemo,
  CommitMemo,
  PathCheckResult,
} from '../schemas/decision';

// ─── Fixtures ───

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

describe('translateToSettlement', () => {
  describe('economic regime', () => {
    it('maps EconomicCommitMemo to economic settlement payload', () => {
      const memo = makeEconomicMemo();
      const result = translateToSettlement(memo);

      expect(result.kind).toBe('economic');
      if (result.kind !== 'economic') throw new Error('unreachable');

      expect(result.taskSpec.intent).toBe(memo.buyerHypothesis);
      expect(result.taskSpec.inputs.buyer).toBe(memo.buyerHypothesis);
      expect(result.taskSpec.inputs.pain).toBe(memo.painHypothesis);
      expect(result.taskSpec.inputs.vehicle).toBe(memo.whyThisVehicleNow.join(', '));
      expect(result.taskSpec.constraints).toEqual(memo.whatForgeShouldBuild);
      expect(result.taskSpec.exclusions).toEqual(memo.whatForgeMustNotBuild);
      expect(result.taskSpec.success_condition).toBe(memo.nextSignalAfterBuild[0]);
    });

    it('maps workflow hints from economic memo', () => {
      const memo = makeEconomicMemo();
      const result = translateToSettlement(memo);

      if (result.kind !== 'economic') throw new Error('unreachable');

      expect(result.workflowHints.name).toBe(`${memo.candidateId}-delivery`);
      expect(result.workflowHints.purpose).toBe(memo.rationale[0]);
      expect(result.workflowHints.steps).toEqual(memo.whatForgeShouldBuild);
    });

    it('falls back to rationale when buyerHypothesis is empty', () => {
      const memo = makeEconomicMemo({ buyerHypothesis: '' });
      const result = translateToSettlement(memo);

      if (result.kind !== 'economic') throw new Error('unreachable');

      expect(result.taskSpec.intent).toBe(memo.rationale.join('; '));
    });

    it('falls back success_condition when nextSignalAfterBuild is empty', () => {
      const memo = makeEconomicMemo({ nextSignalAfterBuild: [] });
      const result = translateToSettlement(memo);

      if (result.kind !== 'economic') throw new Error('unreachable');

      expect(result.taskSpec.success_condition).toBe('First paying customer');
    });
  });

  describe('governance regime', () => {
    it('maps GovernanceCommitMemo to governance settlement payload', () => {
      const memo = makeGovernanceMemo();
      const result = translateToSettlement(memo);

      expect(result.kind).toBe('governance');
      if (result.kind !== 'governance') throw new Error('unreachable');

      expect(result.villagePack.name).toBe(`world-${memo.selectedWorldForm}-${memo.candidateId.slice(0, 8)}`);
      expect(result.villagePack.target_repo).toBe('');
      expect(result.villagePack.worldForm).toBe(memo.selectedWorldForm);
      expect(result.villagePack.constitutionHints.rules).toEqual(memo.thyraHandoffRequirements);
      expect(result.villagePack.constitutionHints.allowed_permissions).toEqual([]);
      expect(result.villagePack.minimumWorldShape).toEqual(memo.minimumWorldShape);
      expect(result.villagePack.firstCycleDesign).toEqual(memo.firstCycleDesign);
    });
  });

  describe('generic fallback', () => {
    it('maps non-economic non-governance memo to economic payload', () => {
      const memo = makeBaseMemo();
      const result = translateToSettlement(memo);

      expect(result.kind).toBe('economic');
      if (result.kind !== 'economic') throw new Error('unreachable');

      expect(result.taskSpec.intent).toBe(memo.rationale.join('; '));
      expect(result.taskSpec.inputs.regime).toBe('capability');
      expect(result.taskSpec.constraints).toEqual(memo.whatForgeShouldBuild);
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
