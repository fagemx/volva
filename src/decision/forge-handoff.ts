import type {
  CapabilityCommitMemo,
  CommitMemo,
  EconomicCommitMemo,
  ExpressionCommitMemo,
  GovernanceCommitMemo,
  IdentityCommitMemo,
  LeverageCommitMemo,
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

function isCapabilityCommitMemo(memo: CommitMemo): memo is CapabilityCommitMemo {
  return memo.regime === 'capability' && 'skillDomain' in memo;
}

function isLeverageCommitMemo(memo: CommitMemo): memo is LeverageCommitMemo {
  return memo.regime === 'leverage' && 'leverageType' in memo;
}

function isExpressionCommitMemo(memo: CommitMemo): memo is ExpressionCommitMemo {
  return memo.regime === 'expression' && 'medium' in memo;
}

function isIdentityCommitMemo(memo: CommitMemo): memo is IdentityCommitMemo {
  return memo.regime === 'identity' && 'scope' in memo;
}

// ─── Shared Request Base ───

function buildRequestBase(memo: CommitMemo, context: ForgeHandoffContext) {
  return {
    sessionId: context.sessionId,
    candidateId: memo.candidateId,
    regime: memo.regime,
    verdict: 'commit' as const,
    whatToBuild: memo.whatForgeShouldBuild,
    whatNotToBuild: memo.whatForgeMustNotBuild,
    rationale: memo.rationale,
    evidenceUsed: memo.evidenceUsed,
    unresolvedRisks: memo.unresolvedRisks,
    context: {
      workingDir: context.workingDir,
      targetRepo: context.targetRepo,
    },
  };
}

// ─── Economic Translation ───

function buildEconomicRequest(
  memo: EconomicCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    ...buildRequestBase(memo, context),
    regimeContext: {
      kind: 'economic',
      buyerHypothesis: memo.buyerHypothesis,
      painHypothesis: memo.painHypothesis,
      vehicleType: memo.whyThisVehicleNow[0] || 'unknown',
      paymentEvidence: memo.paymentEvidence,
      whyThisVehicleNow: memo.whyThisVehicleNow,
      nextSignalAfterBuild: memo.nextSignalAfterBuild,
    },
  };
}

// ─── Governance Translation ───

function buildGovernanceRequest(
  memo: GovernanceCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    ...buildRequestBase(memo, context),
    regimeContext: {
      kind: 'governance',
      worldForm: memo.selectedWorldForm,
      minimumWorldShape: memo.minimumWorldShape,
      firstCycleDesign: memo.firstCycleDesign,
      stateDensityAssessment: memo.stateDensityAssessment,
      governancePressureAssessment: memo.governancePressureAssessment,
      thyraHandoffRequirements: memo.thyraHandoffRequirements,
    },
  };
}

// ─── Capability Translation ───

function buildCapabilityRequest(
  memo: CapabilityCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    ...buildRequestBase(memo, context),
    regimeContext: {
      kind: 'capability',
      skillDomain: memo.skillDomain,
      currentLevel: memo.currentLevel,
      targetLevel: memo.targetLevel,
      proofMethod: memo.proofMethod,
      milestones: memo.milestones,
    },
  };
}

// ─── Leverage Translation ───

function buildLeverageRequest(
  memo: LeverageCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    ...buildRequestBase(memo, context),
    regimeContext: {
      kind: 'leverage',
      leverageType: memo.leverageType,
      currentBottleneck: memo.currentBottleneck,
      amplificationTarget: memo.amplificationTarget,
      dependencies: memo.dependencies,
      riskIfNotBuilt: memo.riskIfNotBuilt,
    },
  };
}

// ─── Expression Translation ───

function buildExpressionRequest(
  memo: ExpressionCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    ...buildRequestBase(memo, context),
    regimeContext: {
      kind: 'expression',
      medium: memo.medium,
      audience: memo.audience,
      coreMessage: memo.coreMessage,
      styleConstraints: memo.styleConstraints,
      existingAssets: memo.existingAssets,
    },
  };
}

// ─── Identity Translation ───

function buildIdentityRequest(
  memo: IdentityCommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  return {
    ...buildRequestBase(memo, context),
    regimeContext: {
      kind: 'identity',
      scope: memo.scope,
      coreValues: memo.coreValues,
      tensions: memo.tensions,
      rituals: memo.rituals,
      boundaries: memo.boundaries,
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
  } else if (isCapabilityCommitMemo(commitMemo)) {
    request = buildCapabilityRequest(commitMemo, context);
  } else if (isLeverageCommitMemo(commitMemo)) {
    request = buildLeverageRequest(commitMemo, context);
  } else if (isExpressionCommitMemo(commitMemo)) {
    request = buildExpressionRequest(commitMemo, context);
  } else if (isIdentityCommitMemo(commitMemo)) {
    request = buildIdentityRequest(commitMemo, context);
  } else {
    // Base CommitMemo without regime-specific extension — derive context from regime field
    request = buildFromBaseCommitMemo(commitMemo, context);
  }

  // Validate output against schema (CONTRACT: output must match ForgeBuildRequestSchema)
  return ForgeBuildRequestSchema.parse(request);
}

// ─── Base CommitMemo Fallback (derives regime context from memo.regime) ───

function buildFromBaseCommitMemo(
  memo: CommitMemo,
  context: ForgeHandoffContext,
): ForgeBuildRequest {
  const base = buildRequestBase(memo, context);
  const regime = memo.regime;

  switch (regime) {
    case 'economic':
      return {
        ...base,
        regimeContext: {
          kind: 'economic',
          buyerHypothesis: memo.rationale[0] || '',
          painHypothesis: memo.rationale.join('; '),
          vehicleType: 'unknown',
          paymentEvidence: [],
          whyThisVehicleNow: [],
          nextSignalAfterBuild: memo.recommendedNextStep,
        },
      };
    case 'governance':
      return {
        ...base,
        regimeContext: {
          kind: 'governance',
          worldForm: 'market',
          minimumWorldShape: [],
          firstCycleDesign: memo.recommendedNextStep,
          stateDensityAssessment: 'medium',
          governancePressureAssessment: 'medium',
          thyraHandoffRequirements: [],
        },
      };
    case 'capability':
      return {
        ...base,
        regimeContext: {
          kind: 'capability',
          skillDomain: memo.rationale[0] || '',
          currentLevel: 'unknown',
          targetLevel: 'unknown',
          proofMethod: memo.recommendedNextStep[0] || '',
          milestones: memo.whatForgeShouldBuild,
        },
      };
    case 'leverage':
      return {
        ...base,
        regimeContext: {
          kind: 'leverage',
          leverageType: 'unknown',
          currentBottleneck: memo.rationale[0] || '',
          amplificationTarget: memo.recommendedNextStep[0] || '',
          dependencies: [],
          riskIfNotBuilt: memo.unresolvedRisks[0] || '',
        },
      };
    case 'expression':
      return {
        ...base,
        regimeContext: {
          kind: 'expression',
          medium: 'unknown',
          audience: 'unknown',
          coreMessage: memo.rationale[0] || '',
          styleConstraints: [],
          existingAssets: [],
        },
      };
    case 'identity':
      return {
        ...base,
        regimeContext: {
          kind: 'identity',
          scope: 'unknown',
          coreValues: memo.rationale,
          tensions: memo.unresolvedRisks,
          rituals: [],
          boundaries: memo.whatForgeMustNotBuild,
        },
      };
  }
}

// ─── Synthetic CommitMemo for Forge Fast-Path ───

function findFixed(fixedElements: PathCheckResult['fixedElements'], kind: string): string {
  const el = fixedElements.find((e) => e.kind === kind);
  return el ? el.value : '';
}

type SyntheticFields = {
  domain: string;
  form: string;
  buildTarget: string;
  buyer: string;
  intent: string;
};

function buildSyntheticEconomic(baseMemo: CommitMemo, fields: SyntheticFields, pcr: PathCheckResult): EconomicCommitMemo {
  return {
    ...baseMemo,
    buyerHypothesis: fields.buyer || `${fields.domain} buyer`,
    painHypothesis: fields.intent || `${fields.domain} pain point`,
    paymentEvidence: [],
    whyThisVehicleNow: [fields.form || 'Fast-path vehicle'].filter(Boolean),
    nextSignalAfterBuild: [pcr.recommendedNextStep],
  };
}

function buildSyntheticGovernance(baseMemo: CommitMemo, fields: SyntheticFields, pcr: PathCheckResult): GovernanceCommitMemo {
  const worldForm: WorldForm = fields.form ? (fields.form as WorldForm) : 'market';
  return {
    ...baseMemo,
    selectedWorldForm: worldForm,
    minimumWorldShape: pcr.whyReady ?? [],
    stateDensityAssessment: 'medium',
    governancePressureAssessment: 'medium',
    firstCycleDesign: [pcr.recommendedNextStep],
    thyraHandoffRequirements: pcr.whyReady ?? [],
  };
}

function buildSyntheticCapability(baseMemo: CommitMemo, fields: SyntheticFields): CapabilityCommitMemo {
  return {
    ...baseMemo,
    skillDomain: fields.domain || 'unknown',
    currentLevel: 'unknown',
    targetLevel: fields.intent || 'target',
    proofMethod: fields.form || 'demonstration',
    milestones: baseMemo.whatForgeShouldBuild,
  };
}

function buildSyntheticLeverage(baseMemo: CommitMemo, fields: SyntheticFields, pcr: PathCheckResult): LeverageCommitMemo {
  return {
    ...baseMemo,
    leverageType: fields.form || 'unknown',
    currentBottleneck: fields.intent || `${fields.domain} bottleneck`,
    amplificationTarget: fields.buildTarget || `${fields.domain} amplification`,
    dependencies: [],
    riskIfNotBuilt: pcr.unresolvedElements[0]
      ? `${pcr.unresolvedElements[0].kind}: ${pcr.unresolvedElements[0].reason}`
      : '',
  };
}

function buildSyntheticExpression(baseMemo: CommitMemo, fields: SyntheticFields): ExpressionCommitMemo {
  return {
    ...baseMemo,
    medium: fields.form || 'unknown',
    audience: fields.buyer || 'unknown',
    coreMessage: fields.intent || `${fields.domain} expression`,
    styleConstraints: [],
    existingAssets: [],
  };
}

function buildSyntheticIdentity(baseMemo: CommitMemo, fields: SyntheticFields): IdentityCommitMemo {
  return {
    ...baseMemo,
    scope: fields.domain || 'unknown',
    coreValues: baseMemo.rationale,
    tensions: baseMemo.unresolvedRisks,
    rituals: [],
    boundaries: [],
  };
}

export function buildSyntheticCommitMemo(
  pathCheckResult: PathCheckResult,
  regime: Regime,
): CommitMemo | EconomicCommitMemo | GovernanceCommitMemo | CapabilityCommitMemo | LeverageCommitMemo | ExpressionCommitMemo | IdentityCommitMemo {
  const { fixedElements } = pathCheckResult;

  const fields: SyntheticFields = {
    domain: findFixed(fixedElements, 'domain'),
    form: findFixed(fixedElements, 'form'),
    buildTarget: findFixed(fixedElements, 'build_target'),
    buyer: findFixed(fixedElements, 'buyer'),
    intent: findFixed(fixedElements, 'intent'),
  };

  const baseMemo: CommitMemo = {
    candidateId: `synth-${Date.now()}`,
    regime,
    verdict: 'commit',
    rationale: [fields.intent || `Fast-path: ${fields.domain} ${fields.form}`].filter(Boolean),
    evidenceUsed: [`path-check certainty: ${pathCheckResult.certainty}`],
    unresolvedRisks: pathCheckResult.unresolvedElements.map((u) => `${u.kind}: ${u.reason}`),
    whatForgeShouldBuild: [
      fields.buildTarget || `Build ${fields.form} for ${fields.domain}`,
    ].filter(Boolean),
    whatForgeMustNotBuild: [],
    recommendedNextStep: [pathCheckResult.recommendedNextStep],
  };

  switch (regime) {
    case 'economic':
      return buildSyntheticEconomic(baseMemo, fields, pathCheckResult);
    case 'governance':
      return buildSyntheticGovernance(baseMemo, fields, pathCheckResult);
    case 'capability':
      return buildSyntheticCapability(baseMemo, fields);
    case 'leverage':
      return buildSyntheticLeverage(baseMemo, fields, pathCheckResult);
    case 'expression':
      return buildSyntheticExpression(baseMemo, fields);
    case 'identity':
      return buildSyntheticIdentity(baseMemo, fields);
  }
}
