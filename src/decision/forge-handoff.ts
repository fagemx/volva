import type {
  CommitMemo,
  EconomicCommitMemo,
  GovernanceCommitMemo,
  PathCheckResult,
  Regime,
  WorldForm,
} from '../schemas/decision';
import { ForgeBuildRequestSchema, type ForgeBuildRequest } from '../karvi-client/schemas';

// ─── Context for Forge Handoff ───

export type ForgeHandoffContext = {
  sessionId: string;
  workingDir?: string;
  targetRepo?: string;
};

// ─── Type Guards ───

function isEconomicCommitMemo(memo: CommitMemo): memo is EconomicCommitMemo {
  return memo.regime === 'economic' && 'buyerHypothesis' in memo;
}

function isGovernanceCommitMemo(memo: CommitMemo): memo is GovernanceCommitMemo {
  return memo.regime === 'governance' && 'selectedWorldForm' in memo;
}

// ─── Economic Translation ───

function buildEconomicRequest(
  memo: EconomicCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    sessionId: context.sessionId,
    candidateId: memo.candidateId,
    regime: memo.regime,
    verdict: 'commit',
    whatToBuild: memo.whatForgeShouldBuild,
    whatNotToBuild: memo.whatForgeMustNotBuild,
    rationale: memo.rationale,
    evidenceUsed: memo.evidenceUsed,
    unresolvedRisks: memo.unresolvedRisks,
    regimeContext: {
      kind: 'economic',
      buyerHypothesis: memo.buyerHypothesis,
      painHypothesis: memo.painHypothesis,
      vehicleType: memo.whyThisVehicleNow[0] || 'unknown',
      paymentEvidence: memo.paymentEvidence,
      whyThisVehicleNow: memo.whyThisVehicleNow,
      nextSignalAfterBuild: memo.nextSignalAfterBuild,
    },
    context: {
      workingDir: context.workingDir,
      targetRepo: context.targetRepo,
    },
  };
}

// ─── Governance Translation ───

function buildGovernanceRequest(
  memo: GovernanceCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    sessionId: context.sessionId,
    candidateId: memo.candidateId,
    regime: memo.regime,
    verdict: 'commit',
    whatToBuild: memo.whatForgeShouldBuild,
    whatNotToBuild: memo.whatForgeMustNotBuild,
    rationale: memo.rationale,
    evidenceUsed: memo.evidenceUsed,
    unresolvedRisks: memo.unresolvedRisks,
    regimeContext: {
      kind: 'governance',
      worldForm: memo.selectedWorldForm,
      minimumWorldShape: memo.minimumWorldShape,
      firstCycleDesign: memo.firstCycleDesign,
      stateDensityAssessment: memo.stateDensityAssessment,
      governancePressureAssessment: memo.governancePressureAssessment,
      thyraHandoffRequirements: memo.thyraHandoffRequirements,
    },
    context: {
      workingDir: context.workingDir,
      targetRepo: context.targetRepo,
    },
  };
}

// ─── Generic Fallback (non-economic, non-governance regimes) ───

function buildFallbackRequest(
  memo: CommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    sessionId: context.sessionId,
    candidateId: memo.candidateId,
    regime: memo.regime,
    verdict: 'commit',
    whatToBuild: memo.whatForgeShouldBuild,
    whatNotToBuild: memo.whatForgeMustNotBuild,
    rationale: memo.rationale,
    evidenceUsed: memo.evidenceUsed,
    unresolvedRisks: memo.unresolvedRisks,
    regimeContext: {
      kind: 'economic',
      buyerHypothesis: memo.rationale[0] || '',
      painHypothesis: memo.rationale.join('; '),
      vehicleType: 'unknown',
      paymentEvidence: [],
      whyThisVehicleNow: [],
      nextSignalAfterBuild: memo.recommendedNextStep,
    },
    context: {
      workingDir: context.workingDir,
      targetRepo: context.targetRepo,
    },
  };
}

// ─── Main Export ───

export function buildForgeBuildRequest(
  commitMemo: CommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  let request: ForgeBuildRequest;

  if (isEconomicCommitMemo(commitMemo)) {
    request = buildEconomicRequest(commitMemo, context);
  } else if (isGovernanceCommitMemo(commitMemo)) {
    request = buildGovernanceRequest(commitMemo, context);
  } else {
    request = buildFallbackRequest(commitMemo, context);
  }

  // Validate output against schema (CONTRACT: output must match ForgeBuildRequestSchema)
  return ForgeBuildRequestSchema.parse(request);
}

// ─── Synthetic CommitMemo for Forge Fast-Path ───

function findFixed(fixedElements: PathCheckResult['fixedElements'], kind: string): string {
  const el = fixedElements.find((e) => e.kind === kind);
  return el ? el.value : '';
}

export function buildSyntheticCommitMemo(
  pathCheckResult: PathCheckResult,
  regime: Regime,
): CommitMemo | EconomicCommitMemo | GovernanceCommitMemo {
  const { fixedElements } = pathCheckResult;

  const domain = findFixed(fixedElements, 'domain');
  const form = findFixed(fixedElements, 'form');
  const buildTarget = findFixed(fixedElements, 'build_target');
  const buyer = findFixed(fixedElements, 'buyer');
  const intent = findFixed(fixedElements, 'intent');

  const baseMemo: CommitMemo = {
    candidateId: `synth-${Date.now()}`,
    regime,
    verdict: 'commit',
    rationale: [intent || `Fast-path: ${domain} ${form}`].filter(Boolean),
    evidenceUsed: [`path-check certainty: ${pathCheckResult.certainty}`],
    unresolvedRisks: pathCheckResult.unresolvedElements.map((u) => `${u.kind}: ${u.reason}`),
    whatForgeShouldBuild: [
      buildTarget || `Build ${form} for ${domain}`,
    ].filter(Boolean),
    whatForgeMustNotBuild: [],
    recommendedNextStep: [pathCheckResult.recommendedNextStep],
  };

  if (regime === 'economic') {
    const economicMemo: EconomicCommitMemo = {
      ...baseMemo,
      buyerHypothesis: buyer || `${domain} buyer`,
      painHypothesis: intent || `${domain} pain point`,
      paymentEvidence: [],
      whyThisVehicleNow: [form || 'Fast-path vehicle'].filter(Boolean),
      nextSignalAfterBuild: [pathCheckResult.recommendedNextStep],
    };
    return economicMemo;
  }

  if (regime === 'governance') {
    const worldForm: WorldForm = form ? (form as WorldForm) : 'market';
    const governanceMemo: GovernanceCommitMemo = {
      ...baseMemo,
      selectedWorldForm: worldForm,
      minimumWorldShape: pathCheckResult.whyReady ?? [],
      stateDensityAssessment: 'medium',
      governancePressureAssessment: 'medium',
      firstCycleDesign: [pathCheckResult.recommendedNextStep],
      thyraHandoffRequirements: pathCheckResult.whyReady ?? [],
    };
    return governanceMemo;
  }

  return baseMemo;
}
