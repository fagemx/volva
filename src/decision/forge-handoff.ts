import type {
  CommitMemo,
  EconomicCommitMemo,
  GovernanceCommitMemo,
  PathCheckResult,
  Regime,
  WorldForm,
} from '../schemas/decision';

// ─── Settlement Payload Types ───

type EconomicSettlementPayload = {
  kind: 'economic';
  taskSpec: {
    intent: string;
    inputs: Record<string, string>;
    constraints: string[];
    exclusions: string[];
    success_condition: string;
  };
  workflowHints: {
    name: string;
    purpose: string;
    steps: string[];
  };
};

type GovernanceSettlementPayload = {
  kind: 'governance';
  villagePack: {
    name: string;
    target_repo: string;
    worldForm: WorldForm;
    constitutionHints: {
      rules: string[];
      allowed_permissions: string[];
    };
    minimumWorldShape: string[];
    firstCycleDesign: string[];
  };
};

export type SettlementPayload = EconomicSettlementPayload | GovernanceSettlementPayload;

// ─── Type Guards ───

function isEconomicCommitMemo(memo: CommitMemo): memo is EconomicCommitMemo {
  return memo.regime === 'economic' && 'buyerHypothesis' in memo;
}

function isGovernanceCommitMemo(memo: CommitMemo): memo is GovernanceCommitMemo {
  return memo.regime === 'governance' && 'selectedWorldForm' in memo;
}

// ─── Economic Translation ───

function translateEconomic(memo: EconomicCommitMemo): EconomicSettlementPayload {
  return {
    kind: 'economic',
    taskSpec: {
      intent: memo.buyerHypothesis || memo.rationale.join('; '),
      inputs: {
        buyer: memo.buyerHypothesis || '',
        pain: memo.painHypothesis || '',
        vehicle: memo.whyThisVehicleNow.join(', ') || '',
      },
      constraints: memo.whatForgeShouldBuild,
      exclusions: memo.whatForgeMustNotBuild,
      success_condition: memo.nextSignalAfterBuild[0] || 'First paying customer',
    },
    workflowHints: {
      name: `${memo.candidateId}-delivery`,
      purpose: memo.rationale[0] || 'Economic delivery workflow',
      steps: memo.whatForgeShouldBuild,
    },
  };
}

// ─── Governance Translation ───

function translateGovernance(memo: GovernanceCommitMemo): GovernanceSettlementPayload {
  return {
    kind: 'governance',
    villagePack: {
      name: `world-${memo.selectedWorldForm}-${memo.candidateId.slice(0, 8)}`,
      target_repo: '',
      worldForm: memo.selectedWorldForm,
      constitutionHints: {
        rules: memo.thyraHandoffRequirements,
        allowed_permissions: [],
      },
      minimumWorldShape: memo.minimumWorldShape,
      firstCycleDesign: memo.firstCycleDesign,
    },
  };
}

// ─── Generic Fallback (non-economic, non-governance regimes) ───

function translateGenericFallback(memo: CommitMemo): EconomicSettlementPayload {
  return {
    kind: 'economic',
    taskSpec: {
      intent: memo.rationale.join('; '),
      inputs: {
        regime: memo.regime,
        candidate: memo.candidateId,
      },
      constraints: memo.whatForgeShouldBuild,
      exclusions: memo.whatForgeMustNotBuild,
      success_condition: memo.recommendedNextStep[0] || 'Deliver first iteration',
    },
    workflowHints: {
      name: `${memo.candidateId}-delivery`,
      purpose: memo.rationale[0] || `${memo.regime} delivery workflow`,
      steps: memo.whatForgeShouldBuild,
    },
  };
}

// ─── Main Export ───

export function translateToSettlement(commitMemo: CommitMemo): SettlementPayload {
  if (isEconomicCommitMemo(commitMemo)) {
    return translateEconomic(commitMemo);
  }
  if (isGovernanceCommitMemo(commitMemo)) {
    return translateGovernance(commitMemo);
  }
  return translateGenericFallback(commitMemo);
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
