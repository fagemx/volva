import type { Database } from 'bun:sqlite';
import type { Regime } from '../schemas/decision';

// ─── Types ───

export type DecisionStage =
  | 'routing'
  | 'path-check'
  | 'space-building'
  | 'probe-design'
  | 'probe-review'
  | 'commit-review'
  | 'spec-crystallization'
  | 'promotion-check'
  | 'done';

export type SessionStatus = 'active' | 'paused' | 'promoted' | 'archived';

const STAGE_ORDER: readonly DecisionStage[] = [
  'routing',
  'path-check',
  'space-building',
  'probe-design',
  'probe-review',
  'commit-review',
  'spec-crystallization',
  'promotion-check',
  'done',
] as const;

export interface DecisionSession {
  id: string;
  conversationId: string | null;
  userId: string | null;
  title: string | null;
  primaryRegime: Regime | null;
  secondaryRegimes: Regime[];
  routingConfidence: number | null;
  pathCertainty: 'low' | 'medium' | 'high' | null;
  routeDecision: 'space-builder' | 'space-builder-then-forge' | 'forge-fast-path' | null;
  stage: DecisionStage;
  status: SessionStatus;
  keyUnknowns: string[];
  currentSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateRow {
  id: string;
  sessionId: string;
  regime: Regime;
  form: string;
  domain: string | null;
  vehicle: string | null;
  worldForm: string | null;
  description: string;
  whyExists: string[];
  assumptions: string[];
  status: string;
  personFit: string | null;
  testability: string | null;
  leveragePotential: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProbeRow {
  id: string;
  sessionId: string;
  candidateId: string;
  regime: Regime;
  hypothesis: string;
  judge: string;
  probeForm: string;
  cheapestProbe: string;
  disconfirmers: string[];
  budgetBucket: string | null;
  estimatedCost: number | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SignalRow {
  id: string;
  probeId: string;
  candidateId: string;
  regime: Regime;
  signalType: string;
  strength: 'weak' | 'moderate' | 'strong';
  evidence: string[];
  negativeEvidence: string[];
  interpretation: string;
  nextQuestions: string[];
  createdAt: string;
}

// ─── Allowed backward resets ───

const ALLOWED_RESETS: Record<string, DecisionStage[]> = {
  'commit-review': ['space-building'],
  'space-building': ['path-check'],
  'probe-design': ['space-building'],
  'probe-review': ['probe-design', 'space-building'],
};

// ─── DecisionSessionManager ───

export class DecisionSessionManager {
  constructor(private db: Database) {}

  // ─── Private Helpers ───

  private requireSession(id: string): DecisionSession {
    const session = this.getSession(id);
    if (!session) throw new Error(`Session not found: ${id}`);
    return session;
  }

  // ─── CRUD ───

  createSession(opts?: {
    conversationId?: string;
    userId?: string;
    title?: string;
  }): DecisionSession {
    const id = `ds_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO decision_sessions (id, conversation_id, user_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, opts?.conversationId ?? null, opts?.userId ?? null, opts?.title ?? null, now, now],
    );
    return this.requireSession(id);
  }

  getSession(id: string): DecisionSession | null {
    const row = this.db
      .query('SELECT * FROM decision_sessions WHERE id = ?')
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToSession(row);
  }

  updateSession(
    id: string,
    updates: {
      title?: string;
      primaryRegime?: Regime;
      secondaryRegimes?: Regime[];
      routingConfidence?: number;
      pathCertainty?: 'low' | 'medium' | 'high';
      routeDecision?: 'space-builder' | 'space-builder-then-forge' | 'forge-fast-path';
      status?: SessionStatus;
      keyUnknowns?: string[];
      currentSummary?: string;
    },
  ): DecisionSession {
    this.requireSession(id);

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (updates.title !== undefined) {
      sets.push('title = ?');
      params.push(updates.title);
    }
    if (updates.primaryRegime !== undefined) {
      sets.push('primary_regime = ?');
      params.push(updates.primaryRegime);
    }
    if (updates.secondaryRegimes !== undefined) {
      sets.push('secondary_regimes_json = ?');
      params.push(JSON.stringify(updates.secondaryRegimes));
    }
    if (updates.routingConfidence !== undefined) {
      sets.push('routing_confidence = ?');
      params.push(updates.routingConfidence);
    }
    if (updates.pathCertainty !== undefined) {
      sets.push('path_certainty = ?');
      params.push(updates.pathCertainty);
    }
    if (updates.routeDecision !== undefined) {
      sets.push('route_decision = ?');
      params.push(updates.routeDecision);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.keyUnknowns !== undefined) {
      sets.push('key_unknowns_json = ?');
      params.push(JSON.stringify(updates.keyUnknowns));
    }
    if (updates.currentSummary !== undefined) {
      sets.push('current_summary = ?');
      params.push(updates.currentSummary);
    }

    params.push(id);
    this.db.run(`UPDATE decision_sessions SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.requireSession(id);
  }

  // ─── Stage Machine (CONTRACT STAGE-01: only session-manager updates stage) ───

  advanceStage(sessionId: string, targetStage: DecisionStage): DecisionSession {
    const session = this.requireSession(sessionId);

    const currentIndex = STAGE_ORDER.indexOf(session.stage);
    const targetIndex = STAGE_ORDER.indexOf(targetStage);

    if (targetIndex <= currentIndex) {
      throw new Error(
        `Cannot move from "${session.stage}" to "${targetStage}": must advance forward`,
      );
    }

    if (targetIndex !== currentIndex + 1) {
      throw new Error(
        `Cannot skip stages: "${session.stage}" → "${targetStage}". Next valid stage: "${STAGE_ORDER[currentIndex + 1]}"`,
      );
    }

    // Stage-specific preconditions
    if (targetStage === 'path-check' && !session.primaryRegime) {
      throw new Error('Cannot advance to path-check: primaryRegime not set (run routing first)');
    }

    if (targetStage === 'space-building' && !session.routeDecision) {
      throw new Error('Cannot advance to space-building: routeDecision not set (run path-check first)');
    }

    const now = new Date().toISOString();
    this.db.run(
      'UPDATE decision_sessions SET stage = ?, updated_at = ? WHERE id = ?',
      [targetStage, now, sessionId],
    );
    return this.requireSession(sessionId);
  }

  /**
   * Fast-path completion: jump directly from path-check to done.
   * Only allowed when routeDecision === 'forge-fast-path'.
   */
  fastPathToDone(sessionId: string): DecisionSession {
    const session = this.requireSession(sessionId);
    if (session.stage !== 'path-check') {
      throw new Error(`fastPathToDone only allowed at path-check stage, currently: ${session.stage}`);
    }
    if (session.routeDecision !== 'forge-fast-path') {
      throw new Error(`fastPathToDone only allowed when routeDecision is forge-fast-path, got: ${session.routeDecision}`);
    }

    const now = new Date().toISOString();
    this.db.run(
      'UPDATE decision_sessions SET stage = ?, updated_at = ? WHERE id = ?',
      ['done', now, sessionId],
    );
    return this.requireSession(sessionId);
  }

  /**
   * Reset to an earlier stage. Limited to specific backward transitions:
   * - commit-review -> space-building
   * - space-building -> path-check
   * - probe-design -> space-building
   * - probe-review -> probe-design | space-building
   */
  resetToStage(sessionId: string, targetStage: DecisionStage): DecisionSession {
    const session = this.requireSession(sessionId);

    const allowed = ALLOWED_RESETS[session.stage] ?? [];
    if (!allowed.includes(targetStage)) {
      throw new Error(
        `Cannot reset from "${session.stage}" to "${targetStage}". Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const now = new Date().toISOString();
    this.db.run(
      'UPDATE decision_sessions SET stage = ?, updated_at = ? WHERE id = ?',
      [targetStage, now, sessionId],
    );
    return this.requireSession(sessionId);
  }

  // ─── Helpers ───

  addCandidate(
    sessionId: string,
    candidate: {
      regime: Regime;
      form: string;
      description: string;
      whyExists: string[];
      assumptions: string[];
      domain?: string;
      vehicle?: string;
      worldForm?: string;
    },
  ): string {
    const id = `cand_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO candidate_records
       (id, session_id, regime, form, description, why_exists_json, assumptions_json, domain, vehicle, world_form, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, sessionId, candidate.regime, candidate.form, candidate.description,
        JSON.stringify(candidate.whyExists), JSON.stringify(candidate.assumptions),
        candidate.domain ?? null, candidate.vehicle ?? null, candidate.worldForm ?? null,
        now, now,
      ],
    );
    return id;
  }

  getCandidates(sessionId: string): CandidateRow[] {
    const rows = this.db
      .query('SELECT * FROM candidate_records WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToCandidate(row));
  }

  addProbe(
    sessionId: string,
    candidateId: string,
    probe: {
      regime: Regime;
      hypothesis: string;
      judge: string;
      probeForm: string;
      cheapestProbe: string;
      disconfirmers: string[];
      budgetBucket?: string;
      estimatedCost?: number;
    },
  ): string {
    const id = `probe_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO probe_records
       (id, session_id, candidate_id, regime, hypothesis, judge, probe_form, cheapest_probe, disconfirmers_json, budget_bucket, estimated_cost, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, sessionId, candidateId, probe.regime, probe.hypothesis, probe.judge,
        probe.probeForm, probe.cheapestProbe, JSON.stringify(probe.disconfirmers),
        probe.budgetBucket ?? null, probe.estimatedCost ?? null, now,
      ],
    );
    return id;
  }

  getProbes(candidateId: string): ProbeRow[] {
    const rows = this.db
      .query('SELECT * FROM probe_records WHERE candidate_id = ? ORDER BY created_at ASC')
      .all(candidateId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToProbe(row));
  }

  addSignal(
    probeId: string,
    candidateId: string,
    signal: {
      regime: Regime;
      signalType: string;
      strength: 'weak' | 'moderate' | 'strong';
      evidence: string[];
      interpretation: string;
      nextQuestions: string[];
      negativeEvidence?: string[];
    },
  ): string {
    const id = `sig_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO signal_packets
       (id, probe_id, candidate_id, regime, signal_type, strength, evidence_json, negative_evidence_json, interpretation, next_questions_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, probeId, candidateId, signal.regime, signal.signalType, signal.strength,
        JSON.stringify(signal.evidence), JSON.stringify(signal.negativeEvidence ?? []),
        signal.interpretation, JSON.stringify(signal.nextQuestions), now,
      ],
    );
    return id;
  }

  getSignals(probeId: string): SignalRow[] {
    const rows = this.db
      .query('SELECT * FROM signal_packets WHERE probe_id = ? ORDER BY created_at ASC')
      .all(probeId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToSignal(row));
  }

  addCommitMemo(
    sessionId: string,
    candidateId: string,
    memo: {
      regime: Regime;
      verdict: 'commit' | 'hold' | 'discard';
      rationale: string[];
      evidenceUsed: string[];
      unresolvedRisks: string[];
      recommendedNextStep: string[];
      whatForgeShouldBuild: string[];
      whatForgeMustNotBuild: string[];
      handoffNotes?: string[];
    },
  ): string {
    const id = `commit_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO commit_memo_drafts
       (id, session_id, candidate_id, regime, verdict, rationale_json, evidence_used_json,
        unresolved_risks_json, recommended_next_step_json, what_forge_should_build_json,
        what_forge_must_not_build_json, handoff_notes_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, sessionId, candidateId, memo.regime, memo.verdict,
        JSON.stringify(memo.rationale), JSON.stringify(memo.evidenceUsed),
        JSON.stringify(memo.unresolvedRisks), JSON.stringify(memo.recommendedNextStep),
        JSON.stringify(memo.whatForgeShouldBuild), JSON.stringify(memo.whatForgeMustNotBuild),
        memo.handoffNotes ? JSON.stringify(memo.handoffNotes) : null, now,
      ],
    );
    return id;
  }

  addEvent(
    sessionId: string,
    event: {
      eventType: string;
      objectType: string;
      objectId: string;
      payload: Record<string, unknown>;
    },
  ): string {
    const id = `evt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO decision_events
       (id, session_id, event_type, object_type, object_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, sessionId, event.eventType, event.objectType, event.objectId, JSON.stringify(event.payload), now],
    );
    return id;
  }

  // ─── Private Row Mappers ───

  private rowToSession(row: Record<string, unknown>): DecisionSession {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string | null,
      userId: row.user_id as string | null,
      title: row.title as string | null,
      primaryRegime: row.primary_regime as Regime | null,
      secondaryRegimes: row.secondary_regimes_json
        ? (JSON.parse(row.secondary_regimes_json as string) as Regime[])
        : [],
      routingConfidence: row.routing_confidence as number | null,
      pathCertainty: row.path_certainty as 'low' | 'medium' | 'high' | null,
      routeDecision: row.route_decision as 'space-builder' | 'space-builder-then-forge' | 'forge-fast-path' | null,
      stage: row.stage as DecisionStage,
      status: row.status as SessionStatus,
      keyUnknowns: JSON.parse(row.key_unknowns_json as string) as string[],
      currentSummary: row.current_summary as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToCandidate(row: Record<string, unknown>): CandidateRow {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      regime: row.regime as Regime,
      form: row.form as string,
      domain: row.domain as string | null,
      vehicle: row.vehicle as string | null,
      worldForm: row.world_form as string | null,
      description: row.description as string,
      whyExists: JSON.parse(row.why_exists_json as string) as string[],
      assumptions: JSON.parse(row.assumptions_json as string) as string[],
      status: row.status as string,
      personFit: row.person_fit as string | null,
      testability: row.testability as string | null,
      leveragePotential: row.leverage_potential as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private rowToProbe(row: Record<string, unknown>): ProbeRow {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      candidateId: row.candidate_id as string,
      regime: row.regime as Regime,
      hypothesis: row.hypothesis as string,
      judge: row.judge as string,
      probeForm: row.probe_form as string,
      cheapestProbe: row.cheapest_probe as string,
      disconfirmers: JSON.parse(row.disconfirmers_json as string) as string[],
      budgetBucket: row.budget_bucket as string | null,
      estimatedCost: row.estimated_cost as number | null,
      status: row.status as string,
      startedAt: row.started_at as string | null,
      completedAt: row.completed_at as string | null,
      createdAt: row.created_at as string,
    };
  }

  private rowToSignal(row: Record<string, unknown>): SignalRow {
    return {
      id: row.id as string,
      probeId: row.probe_id as string,
      candidateId: row.candidate_id as string,
      regime: row.regime as Regime,
      signalType: row.signal_type as string,
      strength: row.strength as 'weak' | 'moderate' | 'strong',
      evidence: JSON.parse(row.evidence_json as string) as string[],
      negativeEvidence: JSON.parse(row.negative_evidence_json as string) as string[],
      interpretation: row.interpretation as string,
      nextQuestions: JSON.parse(row.next_questions_json as string) as string[],
      createdAt: row.created_at as string,
    };
  }
}
