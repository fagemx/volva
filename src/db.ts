import { Database } from 'bun:sqlite';

export function createDb(path: string = ':memory:'): Database {
  const db = new Database(path);
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

export function initSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK(mode IN ('world_design','workflow_design','task','pipeline_design','adapter_config','commerce_design','org_design','world_management')),
    phase TEXT NOT NULL DEFAULT 'explore' CHECK(phase IN ('explore','focus','settle')),
    village_id TEXT,
    skills_json TEXT,
    nomod_streak INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    turn INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    type TEXT NOT NULL CHECK(type IN ('world','workflow','task','pipeline','adapter','commerce','org')),
    version INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(conversation_id, version)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS card_diffs (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id),
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    diff TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    card_id TEXT NOT NULL REFERENCES cards(id),
    target TEXT NOT NULL CHECK(target IN ('village_pack','workflow','task','pipeline','adapter_config','market_init','org_hierarchy')),
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','applied','failed')),
    thyra_response TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ─── Decision Pipeline Tables ───

  db.run(`CREATE TABLE IF NOT EXISTS decision_sessions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    user_id TEXT,
    title TEXT,
    primary_regime TEXT CHECK(primary_regime IN ('economic','capability','leverage','expression','governance','identity')),
    secondary_regimes_json TEXT,
    routing_confidence REAL,
    path_certainty TEXT CHECK(path_certainty IN ('low','medium','high')),
    route_decision TEXT CHECK(route_decision IN ('space-builder','space-builder-then-forge','forge-fast-path')),
    stage TEXT NOT NULL DEFAULT 'routing' CHECK(stage IN ('routing','path-check','space-building','probe-design','probe-review','commit-review','spec-crystallization','promotion-check','done')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','promoted','archived')),
    key_unknowns_json TEXT NOT NULL DEFAULT '[]',
    current_summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS decision_card_snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    kind TEXT NOT NULL CHECK(kind IN ('world','workflow','task','pipeline','adapter','commerce','org','decision')),
    version INTEGER NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS candidate_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    regime TEXT NOT NULL CHECK(regime IN ('economic','capability','leverage','expression','governance','identity')),
    form TEXT NOT NULL CHECK(form IN ('service','productized_service','tool','workflow_pack','learning_path','practice_loop','medium','world','operator_model','community_format')),
    domain TEXT,
    vehicle TEXT,
    world_form TEXT CHECK(world_form IN ('market','commons','town','port','night_engine','managed_knowledge_field')),
    description TEXT NOT NULL,
    why_exists_json TEXT NOT NULL DEFAULT '[]',
    assumptions_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','pruned','probe-ready','probing','hold','committed','discarded')),
    person_fit TEXT CHECK(person_fit IN ('low','medium','high')),
    testability TEXT CHECK(testability IN ('low','medium','high')),
    leverage_potential TEXT CHECK(leverage_potential IN ('low','medium','high')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS probe_records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    candidate_id TEXT NOT NULL REFERENCES candidate_records(id),
    regime TEXT NOT NULL CHECK(regime IN ('economic','capability','leverage','expression','governance','identity')),
    hypothesis TEXT NOT NULL,
    judge TEXT NOT NULL,
    probe_form TEXT NOT NULL,
    cheapest_probe TEXT NOT NULL,
    disconfirmers_json TEXT NOT NULL DEFAULT '[]',
    budget_bucket TEXT CHECK(budget_bucket IN ('signal','setup','fulfillment','reserve')),
    estimated_cost REAL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','completed','cancelled')),
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS signal_packets (
    id TEXT PRIMARY KEY,
    probe_id TEXT NOT NULL REFERENCES probe_records(id),
    candidate_id TEXT NOT NULL REFERENCES candidate_records(id),
    regime TEXT NOT NULL CHECK(regime IN ('economic','capability','leverage','expression','governance','identity')),
    signal_type TEXT NOT NULL,
    strength TEXT NOT NULL CHECK(strength IN ('weak','moderate','strong')),
    evidence_json TEXT NOT NULL DEFAULT '[]',
    negative_evidence_json TEXT NOT NULL DEFAULT '[]',
    interpretation TEXT NOT NULL,
    next_questions_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS commit_memo_drafts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    candidate_id TEXT NOT NULL REFERENCES candidate_records(id),
    regime TEXT NOT NULL CHECK(regime IN ('economic','capability','leverage','expression','governance','identity')),
    verdict TEXT NOT NULL CHECK(verdict IN ('commit','hold','discard')),
    rationale_json TEXT NOT NULL DEFAULT '[]',
    evidence_used_json TEXT NOT NULL DEFAULT '[]',
    unresolved_risks_json TEXT NOT NULL DEFAULT '[]',
    recommended_next_step_json TEXT NOT NULL DEFAULT '[]',
    handoff_notes_json TEXT,
    what_forge_should_build_json TEXT NOT NULL DEFAULT '[]',
    what_forge_must_not_build_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS promotion_check_drafts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    target_type TEXT NOT NULL CHECK(target_type IN ('arch-spec','project-plan','thyra-runtime')),
    target_path TEXT,
    checklist_results_json TEXT NOT NULL DEFAULT '{}',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    verdict TEXT NOT NULL CHECK(verdict IN ('ready','not_ready','partial')),
    notes_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS decision_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    event_type TEXT NOT NULL CHECK(event_type IN (
      'route_assigned','route_changed','path_checked',
      'candidate_generated','candidate_pruned',
      'probe_started','probe_completed',
      'signal_recorded','commit_drafted',
      'promotion_checked','spec_crystallized',
      'dispatch_cancelled'
    )),
    object_type TEXT NOT NULL CHECK(object_type IN ('session','card','candidate','probe','signal','commit','promotion')),
    object_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ─── Skill Lifecycle Tables ───

  db.run(`CREATE TABLE IF NOT EXISTS skill_instances (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK(status IN ('draft','sandbox','promoted','core','deprecated','superseded')),
    current_stage TEXT NOT NULL DEFAULT 'capture'
      CHECK(current_stage IN ('capture','crystallize','package','route','execute','verify','learn','govern')),
    run_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS skill_runs (
    id TEXT PRIMARY KEY,
    skill_instance_id TEXT NOT NULL REFERENCES skill_instances(id),
    conversation_id TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','partial')),
    duration_ms INTEGER,
    tokens_used INTEGER,
    cost_usd REAL,
    runtime TEXT,
    model TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS forge_builds (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES decision_sessions(id),
    regime TEXT NOT NULL CHECK(regime IN ('economic','capability','leverage','expression','governance','identity')),
    status TEXT NOT NULL CHECK(status IN ('success','failure','partial')),
    duration_ms INTEGER,
    artifact_count INTEGER NOT NULL DEFAULT 0,
    tokens_used INTEGER,
    cost_usd REAL,
    runtime TEXT,
    model TEXT,
    failed_steps_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ─── Approval Audit Table ───

  db.run(`CREATE TABLE IF NOT EXISTS approval_audits (
    id TEXT PRIMARY KEY,
    pending_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    execution_mode TEXT NOT NULL,
    permissions_json TEXT NOT NULL,
    external_side_effects INTEGER NOT NULL,
    dispatch_context_json TEXT NOT NULL,
    decision TEXT NOT NULL DEFAULT 'pending'
      CHECK(decision IN ('pending','approved','denied','expired')),
    decided_by TEXT,
    decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ─── Secondary Indexes ───

  db.run('CREATE INDEX IF NOT EXISTS idx_cards_conv_version ON cards(conversation_id, version)');
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_conv_turn ON messages(conversation_id, turn)');
  db.run('CREATE INDEX IF NOT EXISTS idx_card_diffs_card ON card_diffs(card_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_decision_sessions_status ON decision_sessions(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_candidate_records_session ON candidate_records(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_approval_audits_pending ON approval_audits(pending_id)');
}
