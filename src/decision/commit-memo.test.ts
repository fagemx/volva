import { describe, it, expect } from 'vitest';
import { buildCommitMemo } from './commit-memo';
import type {
  EvaluatorOutput,
  RealizationCandidate,
  EconomicCommitMemo,
  GovernanceCommitMemo,
  CapabilityCommitMemo,
  LeverageCommitMemo,
  ExpressionCommitMemo,
  IdentityCommitMemo,
} from '../schemas/decision';

function makeCandidate(overrides: Partial<RealizationCandidate> = {}): RealizationCandidate {
  return {
    id: 'cand-1',
    regime: 'economic',
    form: 'service',
    description: 'Consulting service for small businesses',
    whyThisCandidate: ['Strong buyer demand', 'Low competition'],
    assumptions: ['Buyers will pay $500/month', 'Pain is acute enough'],
    probeReadinessHints: ['Landing page ready'],
    timeToSignal: 'short',
    notes: ['Focus on onboarding flow'],
    ...overrides,
  };
}

function makeEvaluatorOutput(overrides: Partial<EvaluatorOutput> = {}): EvaluatorOutput {
  return {
    verdict: 'commit',
    rationale: ['Strong buyer signals', 'Payment willingness observed'],
    evidenceUsed: ['buyer interview confirmed pain', 'payment discussion started'],
    unresolvedRisks: ['Churn risk unknown'],
    recommendedNextStep: ['Build MVP landing page', 'Run first paid pilot'],
    handoffNotes: ['Buyer segment is SMB owners'],
    ...overrides,
  };
}

describe('buildCommitMemo', () => {
  describe('economic regime', () => {
    it('builds EconomicCommitMemo with all 5 specialized fields', () => {
      const candidate = makeCandidate({ regime: 'economic' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.regime).toBe('economic');
      expect(memo.candidateId).toBe('cand-1');
      expect(memo.verdict).toBe('commit');

      const econ = memo as EconomicCommitMemo;
      expect(econ.buyerHypothesis).toBeDefined();
      expect(econ.buyerHypothesis.length).toBeGreaterThan(0);
      expect(econ.painHypothesis).toBeDefined();
      expect(econ.painHypothesis.length).toBeGreaterThan(0);
      expect(econ.paymentEvidence).toBeDefined();
      expect(econ.whyThisVehicleNow).toEqual(candidate.whyThisCandidate);
      expect(econ.nextSignalAfterBuild).toEqual(output.recommendedNextStep);
    });

    it('filters paymentEvidence to only payment-related items', () => {
      const candidate = makeCandidate({ regime: 'economic' });
      const output = makeEvaluatorOutput({
        evidenceUsed: ['buyer confirmed pain', 'payment of $100 received', 'general interest noted'],
      });

      const memo = buildCommitMemo(output, candidate) as EconomicCommitMemo;

      expect(memo.paymentEvidence).toContain('payment of $100 received');
      expect(memo.paymentEvidence).not.toContain('general interest noted');
    });
  });

  describe('governance regime', () => {
    it('builds GovernanceCommitMemo with all 6 specialized fields', () => {
      const candidate = makeCandidate({
        regime: 'governance',
        worldForm: 'commons',
      });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.regime).toBe('governance');

      const gov = memo as GovernanceCommitMemo;
      expect(gov.selectedWorldForm).toBe('commons');
      expect(gov.minimumWorldShape).toBeDefined();
      expect(gov.stateDensityAssessment).toBeDefined();
      expect(gov.governancePressureAssessment).toBeDefined();
      expect(gov.firstCycleDesign).toBeDefined();
      expect(gov.firstCycleDesign.length).toBeGreaterThan(0);
      expect(gov.thyraHandoffRequirements).toBeDefined();
      expect(gov.thyraHandoffRequirements.length).toBeGreaterThan(0);
    });

    it('defaults selectedWorldForm to market when not specified', () => {
      const candidate = makeCandidate({
        regime: 'governance',
        worldForm: undefined,
      });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate) as GovernanceCommitMemo;

      expect(memo.selectedWorldForm).toBe('market');
    });
  });

  describe('capability regime', () => {
    it('builds CapabilityCommitMemo with all 5 specialized fields', () => {
      const candidate = makeCandidate({ regime: 'capability', domain: 'data-analysis' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.regime).toBe('capability');
      expect(memo.candidateId).toBe('cand-1');
      expect('skillDomain' in memo).toBe(true);

      const cap = memo as CapabilityCommitMemo;
      expect(cap.skillDomain).toBe('data-analysis');
      expect(cap.currentLevel).toBeDefined();
      expect(cap.targetLevel).toBeDefined();
      expect(cap.proofMethod).toBe('service');
      expect(cap.milestones).toEqual(output.recommendedNextStep);
    });
  });

  describe('leverage regime', () => {
    it('builds LeverageCommitMemo with all 5 specialized fields', () => {
      const candidate = makeCandidate({ regime: 'leverage' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.regime).toBe('leverage');
      expect('leverageType' in memo).toBe(true);

      const lev = memo as LeverageCommitMemo;
      expect(lev.leverageType).toBe('service');
      expect(lev.currentBottleneck).toBeDefined();
      expect(lev.amplificationTarget).toBeDefined();
      expect(lev.dependencies).toBeDefined();
      expect(lev.riskIfNotBuilt).toBeDefined();
    });
  });

  describe('expression regime', () => {
    it('builds ExpressionCommitMemo with all 5 specialized fields', () => {
      const candidate = makeCandidate({ regime: 'expression', domain: 'indie-dev' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.regime).toBe('expression');
      expect('medium' in memo).toBe(true);

      const exp = memo as ExpressionCommitMemo;
      expect(exp.medium).toBe('service');
      expect(exp.audience).toBe('indie-dev');
      expect(exp.coreMessage).toBeDefined();
      expect(exp.styleConstraints).toBeDefined();
      expect(exp.existingAssets).toBeDefined();
    });
  });

  describe('identity regime', () => {
    it('builds IdentityCommitMemo with all 5 specialized fields', () => {
      const candidate = makeCandidate({ regime: 'identity', domain: 'engineering-team' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.regime).toBe('identity');
      expect('scope' in memo).toBe(true);

      const id = memo as IdentityCommitMemo;
      expect(id.scope).toBe('engineering-team');
      expect(id.coreValues).toEqual(candidate.whyThisCandidate);
      expect(id.tensions).toEqual(output.unresolvedRisks);
      expect(id.rituals).toEqual(output.recommendedNextStep);
      expect(id.boundaries).toEqual(candidate.assumptions);
    });
  });

  describe('whatForgeShouldBuild', () => {
    it('is always populated from recommendedNextStep and handoffNotes', () => {
      const candidate = makeCandidate({ regime: 'economic' });
      const output = makeEvaluatorOutput({
        recommendedNextStep: ['Build landing page'],
        handoffNotes: ['Target SMB segment'],
      });

      const memo = buildCommitMemo(output, candidate);

      expect(memo.whatForgeShouldBuild.length).toBeGreaterThan(0);
      expect(memo.whatForgeShouldBuild).toContain('Build landing page');
      expect(memo.whatForgeShouldBuild).toContain('Target SMB segment');
    });

    it('provides fallback when no steps or notes exist', () => {
      const candidate = makeCandidate({ regime: 'capability' });
      const output = makeEvaluatorOutput({
        recommendedNextStep: [],
        handoffNotes: undefined,
      });

      const memo = buildCommitMemo(output, candidate);

      expect(memo.whatForgeShouldBuild.length).toBeGreaterThan(0);
    });
  });

  describe('whatForgeMustNotBuild', () => {
    it('is always populated', () => {
      const candidate = makeCandidate({ regime: 'economic' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.whatForgeMustNotBuild.length).toBeGreaterThan(0);
    });

    it('includes economic-specific warning for economic regime', () => {
      const candidate = makeCandidate({ regime: 'economic' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.whatForgeMustNotBuild).toContain('Full product before buyer validation');
    });

    it('includes governance-specific warning for governance regime', () => {
      const candidate = makeCandidate({ regime: 'governance', worldForm: 'market' });
      const output = makeEvaluatorOutput();

      const memo = buildCommitMemo(output, candidate);

      expect(memo.whatForgeMustNotBuild).toContain('Dashboard instead of world');
    });
  });

  describe('verdict', () => {
    it('matches evaluator output verdict', () => {
      const candidate = makeCandidate({ regime: 'economic' });

      for (const verdict of ['commit', 'hold', 'discard'] as const) {
        const output = makeEvaluatorOutput({ verdict });
        const memo = buildCommitMemo(output, candidate);
        expect(memo.verdict).toBe(verdict);
      }
    });
  });
});
