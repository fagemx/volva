import type {
  RealizationCandidate,
  ProbeableForm,
  SignalPacket,
  Regime,
} from '../schemas/decision';

// ─── Types ───

export type SignalEvidence = {
  signalType: string;
  strength: 'weak' | 'moderate' | 'strong';
  evidence: string[];
  negativeEvidence?: string[];
  interpretation: string;
  nextQuestions: string[];
};

// ─── Internal Helpers ───

function deriveTestTarget(candidate: RealizationCandidate): string {
  if (candidate.regime === 'economic') {
    return `buyer willingness to pay for ${candidate.vehicle ?? candidate.form}`;
  }
  if (candidate.regime === 'governance') {
    return `world density of ${candidate.worldForm ?? candidate.form}`;
  }
  if (candidate.regime === 'capability') {
    return `skill delta achievable via ${candidate.form}`;
  }
  if (candidate.regime === 'leverage') {
    return `bottleneck reduction via ${candidate.form}`;
  }
  if (candidate.regime === 'expression') {
    return `medium fit for ${candidate.form}`;
  }
  // identity
  return `path sustainability of ${candidate.form}`;
}

function deriveJudge(candidate: RealizationCandidate): string {
  if (candidate.regime === 'economic') {
    return 'potential buyer';
  }
  if (candidate.regime === 'governance') {
    return 'world state/change closure';
  }
  if (candidate.regime === 'capability') {
    return 'observable skill growth';
  }
  if (candidate.regime === 'leverage') {
    return 'efficiency delta measurement';
  }
  if (candidate.regime === 'expression') {
    return 'audience resonance';
  }
  // identity
  return 'self-fit assessment';
}

function deriveCheapestProbe(candidate: RealizationCandidate): string {
  if (candidate.regime === 'economic') {
    return `direct offer / landing page CTA for ${candidate.vehicle ?? candidate.form}`;
  }
  if (candidate.regime === 'governance') {
    return `minimum state instantiation of ${candidate.worldForm ?? candidate.form}`;
  }
  if (candidate.regime === 'capability') {
    return `timed project / 7-day challenge for ${candidate.form}`;
  }
  if (candidate.regime === 'leverage') {
    return `baseline vs automated run comparison for ${candidate.form}`;
  }
  if (candidate.regime === 'expression') {
    return `single-piece production in ${candidate.form}`;
  }
  // identity
  return `staged reversibility test for ${candidate.form}`;
}

function deriveDisconfirmers(candidate: RealizationCandidate): string[] {
  return candidate.assumptions.map((assumption) => `NOT: ${assumption}`);
}

// ─── Exported Functions ───

/**
 * Pre-disqualify candidates that lack required fields for probing.
 * A candidate is NOT probe-ready if any of these are empty/missing:
 * - whyThisCandidate
 * - assumptions
 * - probeReadinessHints
 */
export function isProbeReady(candidate: RealizationCandidate): boolean {
  if (candidate.whyThisCandidate.length === 0) return false;
  if (candidate.assumptions.length === 0) return false;
  if (!candidate.probeReadinessHints || candidate.probeReadinessHints.length === 0) return false;
  return true;
}

/**
 * Convert a RealizationCandidate into a ProbeableForm with the 5 required fields:
 * hypothesis, testTarget, judge, cheapestBelievableProbe, disconfirmers
 */
export function packageProbe(candidate: RealizationCandidate): ProbeableForm {
  return {
    candidateId: candidate.id,
    regime: candidate.regime,
    hypothesis: candidate.whyThisCandidate.join('; '),
    testTarget: deriveTestTarget(candidate),
    judge: deriveJudge(candidate),
    cheapestBelievableProbe: deriveCheapestProbe(candidate),
    disconfirmers: deriveDisconfirmers(candidate),
  };
}

/**
 * Assemble a normalized SignalPacket from raw evidence.
 */
export function recordSignal(
  probeId: string,
  candidateId: string,
  regime: Regime,
  evidence: SignalEvidence,
): SignalPacket {
  return {
    candidateId,
    probeId,
    regime,
    signalType: evidence.signalType,
    strength: evidence.strength,
    evidence: evidence.evidence,
    negativeEvidence: evidence.negativeEvidence,
    interpretation: evidence.interpretation,
    nextQuestions: evidence.nextQuestions,
  };
}
