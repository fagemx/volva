/**
 * Business logic functions extracted from routes/decisions.ts
 * These are pure helpers that transform session/candidate data
 * without HTTP concerns.
 */
import type { Database } from 'bun:sqlite';
import type {
  DecisionSessionManager,
  DecisionSession,
  CandidateRow,
} from './session-manager';
import type {
  IntentRoute,
  RealizationCandidate,
  CommitMemo,
  SignalPacket,
  Regime,
} from '../schemas/decision';

export function buildIntentRouteFromSession(session: DecisionSession): IntentRoute {
  return {
    primaryRegime: session.primaryRegime ?? 'economic',
    secondaryRegimes: session.secondaryRegimes,
    confidence: session.routingConfidence ?? 0,
    signals: [],
    rationale: [],
    keyUnknowns: session.keyUnknowns,
    suggestedFollowups: [],
  };
}

export function candidateToRealization(candidate: CandidateRow): RealizationCandidate {
  return {
    id: candidate.id,
    regime: candidate.regime,
    form: candidate.form as RealizationCandidate['form'],
    domain: candidate.domain ?? undefined,
    vehicle: candidate.vehicle ?? undefined,
    worldForm: candidate.worldForm as RealizationCandidate['worldForm'],
    description: candidate.description,
    whyThisCandidate: candidate.whyExists,
    assumptions: candidate.assumptions,
    probeReadinessHints: candidate.assumptions.length > 0
      ? candidate.assumptions.map((a) => `Validate: ${a}`)
      : ['Validate core assumptions'],
    timeToSignal: 'medium',
    notes: [],
  };
}

export function buildCommitMemoFromSignals(
  candidateId: string,
  candidate: CandidateRow,
  signals: SignalPacket[],
  rationale: string[],
): CommitMemo {
  const verdict = signals.some((s) => s.strength === 'strong')
    ? 'commit' as const
    : 'hold' as const;

  return {
    candidateId,
    regime: candidate.regime,
    verdict,
    rationale,
    evidenceUsed: signals.flatMap((s) => s.evidence),
    unresolvedRisks: candidate.assumptions,
    whatForgeShouldBuild: [`Build ${candidate.form}: ${candidate.description}`],
    whatForgeMustNotBuild: [],
    recommendedNextStep: verdict === 'commit'
      ? ['Proceed to forge handoff']
      : ['Gather additional signals before committing'],
  };
}

export function storeCommitMemo(
  sessionManager: DecisionSessionManager,
  sessionId: string,
  candidateId: string,
  memo: CommitMemo,
): void {
  sessionManager.addCommitMemo(sessionId, candidateId, {
    regime: memo.regime,
    verdict: memo.verdict,
    rationale: memo.rationale,
    evidenceUsed: memo.evidenceUsed,
    unresolvedRisks: memo.unresolvedRisks,
    recommendedNextStep: memo.recommendedNextStep,
    whatForgeShouldBuild: memo.whatForgeShouldBuild,
    whatForgeMustNotBuild: memo.whatForgeMustNotBuild,
  });
}

export function advanceToCommitReview(sessionManager: DecisionSessionManager, sessionId: string): void {
  sessionManager.advanceStage(sessionId, 'probe-design');
  sessionManager.advanceStage(sessionId, 'probe-review');
  sessionManager.advanceStage(sessionId, 'commit-review');
}

export function buildFastPathCommitMemo(session: DecisionSession): CommitMemo {
  return {
    candidateId: `fast-path-${session.id}`,
    regime: session.primaryRegime ?? 'economic',
    verdict: 'commit',
    rationale: ['Fast-path: all elements fixed, high certainty'],
    evidenceUsed: ['Path check fixed elements'],
    unresolvedRisks: [],
    whatForgeShouldBuild: ['Implement based on fixed elements from path check'],
    whatForgeMustNotBuild: [],
    recommendedNextStep: ['Proceed to Forge implementation'],
  };
}

type CommitMemoDraftRow = {
  candidate_id: string;
  regime: Regime;
  verdict: 'commit' | 'hold' | 'discard';
  rationale_json: string;
  evidence_used_json: string;
  unresolved_risks_json: string;
  recommended_next_step_json: string;
  what_forge_should_build_json: string;
  what_forge_must_not_build_json: string;
};

export function getLatestCommitMemoDraft(db: Database, sessionId: string): CommitMemo | null {
  const row = db
    .query(
      `SELECT candidate_id, regime, verdict, rationale_json, evidence_used_json,
              unresolved_risks_json, recommended_next_step_json,
              what_forge_should_build_json, what_forge_must_not_build_json
       FROM commit_memo_drafts
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(sessionId) as CommitMemoDraftRow | null;

  if (!row) return null;
  if (row.verdict !== 'commit') return null;

  return {
    candidateId: row.candidate_id,
    regime: row.regime,
    verdict: 'commit',
    rationale: JSON.parse(row.rationale_json) as string[],
    evidenceUsed: JSON.parse(row.evidence_used_json) as string[],
    unresolvedRisks: JSON.parse(row.unresolved_risks_json) as string[],
    recommendedNextStep: JSON.parse(row.recommended_next_step_json) as string[],
    whatForgeShouldBuild: JSON.parse(row.what_forge_should_build_json) as string[],
    whatForgeMustNotBuild: JSON.parse(row.what_forge_must_not_build_json) as string[],
  };
}
