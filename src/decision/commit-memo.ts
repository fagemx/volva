import type {
  CapabilityCommitMemo,
  CommitMemo,
  EconomicCommitMemo,
  ExpressionCommitMemo,
  GovernanceCommitMemo,
  IdentityCommitMemo,
  LeverageCommitMemo,
  EvaluatorOutput,
  RealizationCandidate,
  GovernanceWorldCandidate,
} from '../schemas/decision';

// ─── Helper Functions ───

const PAYMENT_KEYWORDS = ['payment', 'pay', 'price', 'pricing', 'buyer', 'purchase', 'revenue', 'subscription', 'fee', 'cost', 'invoice', 'transaction'];

function isPaymentRelated(evidence: string): boolean {
  const lower = evidence.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function deriveWhatToBuild(output: EvaluatorOutput, candidate: RealizationCandidate): string[] {
  const items: string[] = [];

  for (const step of output.recommendedNextStep) {
    items.push(step);
  }

  if (output.handoffNotes) {
    for (const note of output.handoffNotes) {
      items.push(note);
    }
  }

  if (items.length === 0) {
    items.push(`Build ${candidate.form} for ${candidate.description}`);
  }

  return items;
}

function deriveWhatNotToBuild(output: EvaluatorOutput, candidate: RealizationCandidate): string[] {
  if (candidate.regime === 'economic') {
    return ['Full product before buyer validation', ...output.unresolvedRisks.map((r) => `Do not build around unresolved: ${r}`)];
  }
  if (candidate.regime === 'governance') {
    return ['Dashboard instead of world', ...output.unresolvedRisks.map((r) => `Do not build around unresolved: ${r}`)];
  }
  return output.unresolvedRisks.map((r) => `Do not build around unresolved: ${r}`);
}

function extractBuyerHypothesis(output: EvaluatorOutput, candidate: RealizationCandidate): string {
  const parts: string[] = [];
  parts.push(candidate.description);
  for (const assumption of candidate.assumptions) {
    if (assumption.toLowerCase().includes('buyer') || assumption.toLowerCase().includes('customer') || assumption.toLowerCase().includes('user')) {
      parts.push(assumption);
    }
  }
  for (const evidence of output.evidenceUsed) {
    if (evidence.toLowerCase().includes('buyer')) {
      parts.push(evidence);
    }
  }
  return parts.join('; ');
}

function extractPainHypothesis(output: EvaluatorOutput, candidate: RealizationCandidate): string {
  const parts: string[] = [];
  for (const reason of candidate.whyThisCandidate) {
    parts.push(reason);
  }
  for (const assumption of candidate.assumptions) {
    if (assumption.toLowerCase().includes('pain') || assumption.toLowerCase().includes('problem') || assumption.toLowerCase().includes('struggle')) {
      parts.push(assumption);
    }
  }
  return parts.length > 0 ? parts.join('; ') : candidate.description;
}

function extractCycleDesign(output: EvaluatorOutput): string[] {
  const items: string[] = [];
  for (const step of output.recommendedNextStep) {
    items.push(step);
  }
  if (items.length === 0) {
    items.push('Define first governance cycle');
  }
  return items;
}

function extractThyraRequirements(output: EvaluatorOutput, candidate: RealizationCandidate): string[] {
  const items: string[] = [];
  for (const note of candidate.notes) {
    items.push(note);
  }
  for (const assumption of candidate.assumptions) {
    items.push(assumption);
  }
  if (output.handoffNotes) {
    for (const note of output.handoffNotes) {
      items.push(note);
    }
  }
  if (items.length === 0) {
    items.push('Define Thyra handoff requirements');
  }
  return items;
}

function deriveStateDensity(output: EvaluatorOutput, candidate: RealizationCandidate): 'low' | 'medium' | 'high' {
  const gov = candidate as Partial<GovernanceWorldCandidate>;
  if (gov.stateDensity) return gov.stateDensity;

  const strongSignals = output.evidenceUsed.length;
  if (strongSignals >= 5) return 'high';
  if (strongSignals >= 2) return 'medium';
  return 'low';
}

function deriveGovernancePressure(output: EvaluatorOutput, candidate: RealizationCandidate): 'low' | 'medium' | 'high' {
  const gov = candidate as Partial<GovernanceWorldCandidate>;
  if (gov.governancePressure) return gov.governancePressure;

  const risks = output.unresolvedRisks.length;
  if (risks >= 4) return 'high';
  if (risks >= 2) return 'medium';
  return 'low';
}

// ─── Specialized Builders ───

function buildEconomicCommitMemo(
  base: CommitMemo,
  output: EvaluatorOutput,
  candidate: RealizationCandidate,
): EconomicCommitMemo {
  return {
    ...base,
    buyerHypothesis: extractBuyerHypothesis(output, candidate),
    painHypothesis: extractPainHypothesis(output, candidate),
    paymentEvidence: output.evidenceUsed.filter((e) => isPaymentRelated(e)),
    whyThisVehicleNow: candidate.whyThisCandidate,
    nextSignalAfterBuild: output.recommendedNextStep,
  };
}

function buildGovernanceCommitMemo(
  base: CommitMemo,
  output: EvaluatorOutput,
  candidate: RealizationCandidate,
): GovernanceCommitMemo {
  const gov = candidate as Partial<GovernanceWorldCandidate>;
  return {
    ...base,
    selectedWorldForm: candidate.worldForm ?? 'market',
    minimumWorldShape: gov.likelyMinimumWorldShape ?? candidate.notes,
    stateDensityAssessment: deriveStateDensity(output, candidate),
    governancePressureAssessment: deriveGovernancePressure(output, candidate),
    firstCycleDesign: extractCycleDesign(output),
    thyraHandoffRequirements: extractThyraRequirements(output, candidate),
  };
}

function buildCapabilityCommitMemo(
  base: CommitMemo,
  output: EvaluatorOutput,
  candidate: RealizationCandidate,
): CapabilityCommitMemo {
  const skillDomain = candidate.domain ?? candidate.description;
  const currentLevel = candidate.assumptions.find((a) =>
    a.toLowerCase().includes('current') || a.toLowerCase().includes('level'),
  ) ?? 'unknown';
  const targetLevel = candidate.whyThisCandidate.find((w) =>
    w.toLowerCase().includes('target') || w.toLowerCase().includes('goal'),
  ) ?? (output.recommendedNextStep[0] || 'target');
  const proofMethod = candidate.form;

  return {
    ...base,
    skillDomain,
    currentLevel,
    targetLevel,
    proofMethod,
    milestones: output.recommendedNextStep,
  };
}

function buildLeverageCommitMemo(
  base: CommitMemo,
  output: EvaluatorOutput,
  candidate: RealizationCandidate,
): LeverageCommitMemo {
  const leverageType = candidate.form;
  const currentBottleneck = candidate.whyThisCandidate[0] ?? candidate.description;
  const amplificationTarget = output.recommendedNextStep[0] ?? candidate.description;
  const riskIfNotBuilt = output.unresolvedRisks[0] ?? '';

  return {
    ...base,
    leverageType,
    currentBottleneck,
    amplificationTarget,
    dependencies: candidate.assumptions,
    riskIfNotBuilt,
  };
}

function buildExpressionCommitMemo(
  base: CommitMemo,
  output: EvaluatorOutput,
  candidate: RealizationCandidate,
): ExpressionCommitMemo {
  const medium = candidate.form;
  const audience = candidate.domain ?? 'unknown';
  const coreMessage = candidate.whyThisCandidate[0] ?? candidate.description;

  return {
    ...base,
    medium,
    audience,
    coreMessage,
    styleConstraints: candidate.assumptions,
    existingAssets: candidate.notes,
  };
}

function buildIdentityCommitMemo(
  base: CommitMemo,
  output: EvaluatorOutput,
  candidate: RealizationCandidate,
): IdentityCommitMemo {
  const scope = candidate.domain ?? 'unknown';

  return {
    ...base,
    scope,
    coreValues: candidate.whyThisCandidate,
    tensions: output.unresolvedRisks,
    rituals: output.recommendedNextStep,
    boundaries: candidate.assumptions,
  };
}

// ─── Main Export ───

export function buildCommitMemo(
  evaluatorOutput: EvaluatorOutput,
  candidate: RealizationCandidate,
): CommitMemo | EconomicCommitMemo | GovernanceCommitMemo | CapabilityCommitMemo | LeverageCommitMemo | ExpressionCommitMemo | IdentityCommitMemo {
  const baseMemo: CommitMemo = {
    candidateId: candidate.id,
    regime: candidate.regime,
    verdict: evaluatorOutput.verdict,
    rationale: evaluatorOutput.rationale,
    evidenceUsed: evaluatorOutput.evidenceUsed,
    unresolvedRisks: evaluatorOutput.unresolvedRisks,
    whatForgeShouldBuild: deriveWhatToBuild(evaluatorOutput, candidate),
    whatForgeMustNotBuild: deriveWhatNotToBuild(evaluatorOutput, candidate),
    recommendedNextStep: evaluatorOutput.recommendedNextStep,
  };

  switch (candidate.regime) {
    case 'economic':
      return buildEconomicCommitMemo(baseMemo, evaluatorOutput, candidate);
    case 'governance':
      return buildGovernanceCommitMemo(baseMemo, evaluatorOutput, candidate);
    case 'capability':
      return buildCapabilityCommitMemo(baseMemo, evaluatorOutput, candidate);
    case 'leverage':
      return buildLeverageCommitMemo(baseMemo, evaluatorOutput, candidate);
    case 'expression':
      return buildExpressionCommitMemo(baseMemo, evaluatorOutput, candidate);
    case 'identity':
      return buildIdentityCommitMemo(baseMemo, evaluatorOutput, candidate);
  }
}
