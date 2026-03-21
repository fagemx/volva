import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from './db';
import {
  ConversationMode,
  ConductorPhase,
  MessageRole,
  ConversationSchema,
  MessageSchema,
  CreateConversationInput,
} from './schemas/conversation';
import type { Database } from 'bun:sqlite';

// ─── DB Schema Tests ───

describe('DB Layer — initSchema', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('creates all 15 tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    // Core tables
    expect(names).toContain('conversations');
    expect(names).toContain('messages');
    expect(names).toContain('cards');
    expect(names).toContain('card_diffs');
    expect(names).toContain('settlements');
    // Decision pipeline tables
    expect(names).toContain('decision_sessions');
    expect(names).toContain('decision_card_snapshots');
    expect(names).toContain('candidate_records');
    expect(names).toContain('probe_records');
    expect(names).toContain('signal_packets');
    expect(names).toContain('commit_memo_drafts');
    expect(names).toContain('promotion_check_drafts');
    expect(names).toContain('decision_events');
    // Approval audit table
    expect(names).toContain('approval_audits');
    // Dispatch queue table
    expect(names).toContain('dispatch_queue');
  });

  it('creates secondary indexes on high-frequency columns', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_cards_conv_version');
    expect(names).toContain('idx_messages_conv_turn');
    expect(names).toContain('idx_card_diffs_card');
    expect(names).toContain('idx_decision_sessions_status');
    expect(names).toContain('idx_candidate_records_session');
    expect(names).toContain('idx_approval_audits_pending');
    expect(names).toContain('idx_dispatch_queue_status');
  });

  it('is idempotent (can call initSchema twice)', () => {
    expect(() => { initSchema(db); }).not.toThrow();
  });

  // ── conversations ──

  it('can insert and query a conversation', () => {
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES ('c1', 'world_design', 'explore')"
    );
    const row = db
      .prepare("SELECT * FROM conversations WHERE id = 'c1'")
      .get() as Record<string, unknown>;
    expect(row.mode).toBe('world_design');
    expect(row.phase).toBe('explore');
  });

  it('defaults phase to explore', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    const row = db
      .prepare("SELECT phase FROM conversations WHERE id = 'c1'")
      .get() as Record<string, unknown>;
    expect(row.phase).toBe('explore');
  });

  it('rejects invalid mode', () => {
    expect(() => {
      db.run(
        "INSERT INTO conversations (id, mode, phase) VALUES ('c2', 'invalid', 'explore')"
      );
    }).toThrow();
  });

  it('rejects invalid phase', () => {
    expect(() => {
      db.run(
        "INSERT INTO conversations (id, mode, phase) VALUES ('c3', 'task', 'invalid_phase')"
      );
    }).toThrow();
  });

  // ── messages ──

  it('can insert a message with FK', () => {
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES ('c1', 'task', 'explore')"
    );
    db.run(
      "INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'c1', 'user', 'hello', 0)"
    );
    const msg = db
      .prepare("SELECT * FROM messages WHERE id = 'm1'")
      .get() as Record<string, unknown>;
    expect(msg.content).toBe('hello');
    expect(msg.turn).toBe(0);
  });

  it('rejects message with invalid conversation_id FK', () => {
    expect(() => {
      db.run(
        "INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'nonexistent', 'user', 'hello', 0)"
      );
    }).toThrow();
  });

  it('rejects invalid message role', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    expect(() => {
      db.run(
        "INSERT INTO messages (id, conversation_id, role, content, turn) VALUES ('m1', 'c1', 'invalid_role', 'hello', 0)"
      );
    }).toThrow();
  });

  // ── cards ──

  it('can insert a card with JSON content', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    const content = JSON.stringify({ goal: 'test', version: 1 });
    db.run(
      "INSERT INTO cards (id, conversation_id, type, version, content) VALUES (?, ?, ?, ?, ?)",
      ['k1', 'c1', 'world', 1, content]
    );
    const card = db
      .prepare("SELECT * FROM cards WHERE id = 'k1'")
      .get() as Record<string, unknown>;
    expect(card.type).toBe('world');
    expect(JSON.parse(card.content as string)).toHaveProperty('goal', 'test');
  });

  it('rejects duplicate (conversation_id, version) in cards', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    db.run("INSERT INTO cards (id, conversation_id, type, version, content) VALUES ('k1', 'c1', 'world', 1, '{}')");
    expect(() => {
      db.run("INSERT INTO cards (id, conversation_id, type, version, content) VALUES ('k2', 'c1', 'world', 1, '{}')");
    }).toThrow();
  });

  it('allows same version across different conversations', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    db.run("INSERT INTO conversations (id, mode) VALUES ('c2', 'world_design')");
    db.run("INSERT INTO cards (id, conversation_id, type, version, content) VALUES ('k1', 'c1', 'world', 1, '{}')");
    expect(() => {
      db.run("INSERT INTO cards (id, conversation_id, type, version, content) VALUES ('k2', 'c2', 'world', 1, '{}')");
    }).not.toThrow();
  });

  it('rejects invalid card type', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    expect(() => {
      db.run(
        "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'invalid_type', '{}')"
      );
    }).toThrow();
  });

  // ── settlements ──

  it('can insert a settlement', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'world', '{}')"
    );
    db.run(
      "INSERT INTO settlements (id, conversation_id, card_id, target, payload) VALUES ('s1', 'c1', 'k1', 'village_pack', '{}')"
    );
    const row = db
      .prepare("SELECT * FROM settlements WHERE id = 's1'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('draft');
    expect(row.target).toBe('village_pack');
  });

  it('rejects settlement with invalid target', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'task', '{}')"
    );
    expect(() => {
      db.run(
        "INSERT INTO settlements (id, conversation_id, card_id, target, payload) VALUES ('s1', 'c1', 'k1', 'invalid_target', '{}')"
      );
    }).toThrow();
  });

  // ── card_diffs ──

  it('can insert a card_diff with FK', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'world_design')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'world', '{}')"
    );
    const diff = JSON.stringify({ added: ['goal'], removed: [], changed: [] });
    db.run(
      "INSERT INTO card_diffs (id, card_id, from_version, to_version, diff) VALUES ('d1', 'k1', 1, 2, ?)",
      [diff]
    );
    const row = db
      .prepare("SELECT * FROM card_diffs WHERE id = 'd1'")
      .get() as Record<string, unknown>;
    expect(row.card_id).toBe('k1');
    expect(row.from_version).toBe(1);
    expect(row.to_version).toBe(2);
    expect(JSON.parse(row.diff as string)).toHaveProperty('added');
  });

  it('rejects card_diff with invalid card_id FK', () => {
    expect(() => {
      db.run(
        "INSERT INTO card_diffs (id, card_id, from_version, to_version, diff) VALUES ('d1', 'nonexistent', 1, 2, '{}')"
      );
    }).toThrow();
  });

  it('rejects settlement with invalid status', () => {
    db.run("INSERT INTO conversations (id, mode) VALUES ('c1', 'task')");
    db.run(
      "INSERT INTO cards (id, conversation_id, type, content) VALUES ('k1', 'c1', 'task', '{}')"
    );
    expect(() => {
      db.run(
        "INSERT INTO settlements (id, conversation_id, card_id, target, payload, status) VALUES ('s1', 'c1', 'k1', 'village_pack', '{}', 'invalid_status')"
      );
    }).toThrow();
  });

  // ── decision_sessions ──

  it('can insert a decision_session with defaults', () => {
    db.run(
      "INSERT INTO decision_sessions (id) VALUES ('ds1')"
    );
    const row = db
      .prepare("SELECT * FROM decision_sessions WHERE id = 'ds1'")
      .get() as Record<string, unknown>;
    expect(row.stage).toBe('routing');
    expect(row.status).toBe('active');
    expect(row.key_unknowns_json).toBe('[]');
  });

  it('can insert a decision_session with all fields', () => {
    db.run(
      `INSERT INTO decision_sessions (id, conversation_id, user_id, title, primary_regime, secondary_regimes_json, routing_confidence, path_certainty, route_decision, stage, status, key_unknowns_json, current_summary)
       VALUES ('ds1', 'c1-ref', 'u1', 'Test Session', 'economic', '["capability"]', 0.85, 'high', 'forge-fast-path', 'probe-design', 'paused', '["unknown1"]', 'summary text')`
    );
    const row = db
      .prepare("SELECT * FROM decision_sessions WHERE id = 'ds1'")
      .get() as Record<string, unknown>;
    expect(row.primary_regime).toBe('economic');
    expect(row.path_certainty).toBe('high');
    expect(row.route_decision).toBe('forge-fast-path');
    expect(row.stage).toBe('probe-design');
    expect(row.status).toBe('paused');
  });

  it('rejects invalid decision_session stage', () => {
    expect(() => {
      db.run("INSERT INTO decision_sessions (id, stage) VALUES ('ds1', 'invalid_stage')");
    }).toThrow();
  });

  it('rejects invalid decision_session status', () => {
    expect(() => {
      db.run("INSERT INTO decision_sessions (id, status) VALUES ('ds1', 'invalid_status')");
    }).toThrow();
  });

  it('rejects invalid decision_session primary_regime', () => {
    expect(() => {
      db.run("INSERT INTO decision_sessions (id, primary_regime) VALUES ('ds1', 'finance')");
    }).toThrow();
  });

  // ── decision_card_snapshots ──

  it('can insert a decision_card_snapshot', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO decision_card_snapshots (id, session_id, kind, version, summary, payload_json) VALUES ('dcs1', 'ds1', 'decision', 1, 'snapshot summary', '{}')"
    );
    const row = db
      .prepare("SELECT * FROM decision_card_snapshots WHERE id = 'dcs1'")
      .get() as Record<string, unknown>;
    expect(row.kind).toBe('decision');
    expect(row.is_current).toBe(1);
  });

  it('rejects decision_card_snapshot with invalid kind', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO decision_card_snapshots (id, session_id, kind, version, summary, payload_json) VALUES ('dcs1', 'ds1', 'invalid_kind', 1, 'summary', '{}')"
      );
    }).toThrow();
  });

  it('rejects decision_card_snapshot with invalid session_id FK', () => {
    expect(() => {
      db.run(
        "INSERT INTO decision_card_snapshots (id, session_id, kind, version, summary, payload_json) VALUES ('dcs1', 'nonexistent', 'world', 1, 'summary', '{}')"
      );
    }).toThrow();
  });

  // ── candidate_records ──

  it('can insert a candidate_record', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'service', 'A consulting service')"
    );
    const row = db
      .prepare("SELECT * FROM candidate_records WHERE id = 'cr1'")
      .get() as Record<string, unknown>;
    expect(row.regime).toBe('economic');
    expect(row.form).toBe('service');
    expect(row.status).toBe('generated');
    expect(row.why_exists_json).toBe('[]');
  });

  it('rejects candidate_record with invalid regime', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'finance', 'service', 'desc')"
      );
    }).toThrow();
  });

  it('rejects candidate_record with invalid form', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'app', 'desc')"
      );
    }).toThrow();
  });

  // ── probe_records ──

  it('can insert a probe_record', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'service', 'desc')"
    );
    db.run(
      "INSERT INTO probe_records (id, session_id, candidate_id, regime, hypothesis, judge, probe_form, cheapest_probe) VALUES ('pr1', 'ds1', 'cr1', 'economic', 'People will pay', 'conversion', 'landing_page', 'simple page')"
    );
    const row = db
      .prepare("SELECT * FROM probe_records WHERE id = 'pr1'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('draft');
    expect(row.hypothesis).toBe('People will pay');
  });

  it('rejects probe_record with invalid candidate_id FK', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO probe_records (id, session_id, candidate_id, regime, hypothesis, judge, probe_form, cheapest_probe) VALUES ('pr1', 'ds1', 'nonexistent', 'economic', 'h', 'j', 'f', 'c')"
      );
    }).toThrow();
  });

  // ── signal_packets ──

  it('can insert a signal_packet', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'service', 'desc')"
    );
    db.run(
      "INSERT INTO probe_records (id, session_id, candidate_id, regime, hypothesis, judge, probe_form, cheapest_probe) VALUES ('pr1', 'ds1', 'cr1', 'economic', 'h', 'j', 'f', 'c')"
    );
    db.run(
      "INSERT INTO signal_packets (id, probe_id, candidate_id, regime, signal_type, strength, interpretation) VALUES ('sp1', 'pr1', 'cr1', 'economic', 'willingness_to_pay', 'strong', 'clear interest')"
    );
    const row = db
      .prepare("SELECT * FROM signal_packets WHERE id = 'sp1'")
      .get() as Record<string, unknown>;
    expect(row.strength).toBe('strong');
    expect(row.evidence_json).toBe('[]');
  });

  it('rejects signal_packet with invalid strength', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'service', 'desc')"
    );
    db.run(
      "INSERT INTO probe_records (id, session_id, candidate_id, regime, hypothesis, judge, probe_form, cheapest_probe) VALUES ('pr1', 'ds1', 'cr1', 'economic', 'h', 'j', 'f', 'c')"
    );
    expect(() => {
      db.run(
        "INSERT INTO signal_packets (id, probe_id, candidate_id, regime, signal_type, strength, interpretation) VALUES ('sp1', 'pr1', 'cr1', 'economic', 'type', 'very_strong', 'interp')"
      );
    }).toThrow();
  });

  // ── commit_memo_drafts ──

  it('can insert a commit_memo_draft', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'service', 'desc')"
    );
    db.run(
      "INSERT INTO commit_memo_drafts (id, session_id, candidate_id, regime, verdict) VALUES ('cm1', 'ds1', 'cr1', 'economic', 'commit')"
    );
    const row = db
      .prepare("SELECT * FROM commit_memo_drafts WHERE id = 'cm1'")
      .get() as Record<string, unknown>;
    expect(row.verdict).toBe('commit');
    expect(row.rationale_json).toBe('[]');
  });

  it('rejects commit_memo_draft with invalid verdict', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO candidate_records (id, session_id, regime, form, description) VALUES ('cr1', 'ds1', 'economic', 'service', 'desc')"
    );
    expect(() => {
      db.run(
        "INSERT INTO commit_memo_drafts (id, session_id, candidate_id, regime, verdict) VALUES ('cm1', 'ds1', 'cr1', 'economic', 'approve')"
      );
    }).toThrow();
  });

  // ── promotion_check_drafts ──

  it('can insert a promotion_check_draft', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO promotion_check_drafts (id, session_id, target_type, verdict) VALUES ('pc1', 'ds1', 'arch-spec', 'ready')"
    );
    const row = db
      .prepare("SELECT * FROM promotion_check_drafts WHERE id = 'pc1'")
      .get() as Record<string, unknown>;
    expect(row.verdict).toBe('ready');
    expect(row.blockers_json).toBe('[]');
  });

  it('rejects promotion_check_draft with invalid target_type', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO promotion_check_drafts (id, session_id, target_type, verdict) VALUES ('pc1', 'ds1', 'invalid_type', 'ready')"
      );
    }).toThrow();
  });

  it('rejects promotion_check_draft with invalid verdict', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO promotion_check_drafts (id, session_id, target_type, verdict) VALUES ('pc1', 'ds1', 'arch-spec', 'approved')"
      );
    }).toThrow();
  });

  // ── decision_events ──

  it('can insert a decision_event', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO decision_events (id, session_id, event_type, object_type, object_id) VALUES ('de1', 'ds1', 'route_assigned', 'session', 'ds1')"
    );
    const row = db
      .prepare("SELECT * FROM decision_events WHERE id = 'de1'")
      .get() as Record<string, unknown>;
    expect(row.event_type).toBe('route_assigned');
    expect(row.payload_json).toBe('{}');
  });

  it('accepts dispatch_cancelled event_type', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    db.run(
      "INSERT INTO decision_events (id, session_id, event_type, object_type, object_id, payload_json) VALUES ('de2', 'ds1', 'dispatch_cancelled', 'session', 'disp-001', '{\"reason\":\"user_cancel\"}')"
    );
    const row = db
      .prepare("SELECT * FROM decision_events WHERE id = 'de2'")
      .get() as Record<string, unknown>;
    expect(row.event_type).toBe('dispatch_cancelled');
    expect(row.object_id).toBe('disp-001');
  });

  it('rejects decision_event with invalid event_type', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO decision_events (id, session_id, event_type, object_type, object_id) VALUES ('de1', 'ds1', 'invalid_event', 'session', 'ds1')"
      );
    }).toThrow();
  });

  it('rejects decision_event with invalid object_type', () => {
    db.run("INSERT INTO decision_sessions (id) VALUES ('ds1')");
    expect(() => {
      db.run(
        "INSERT INTO decision_events (id, session_id, event_type, object_type, object_id) VALUES ('de1', 'ds1', 'route_assigned', 'invalid_type', 'ds1')"
      );
    }).toThrow();
  });

  it('rejects decision_event with invalid session_id FK', () => {
    expect(() => {
      db.run(
        "INSERT INTO decision_events (id, session_id, event_type, object_type, object_id) VALUES ('de1', 'nonexistent', 'route_assigned', 'session', 'ds1')"
      );
    }).toThrow();
  });

  // ── dispatch_queue ──

  it('can insert and query a dispatch_queue entry', () => {
    db.run(
      `INSERT INTO dispatch_queue (id, skill_id, conversation_id, request_json, fallback_reason)
       VALUES ('dq1', 'skill.deploy', 'conv_1', '{"skillId":"skill.deploy"}', 'Karvi health check failed')`,
    );
    const row = db
      .prepare("SELECT * FROM dispatch_queue WHERE id = 'dq1'")
      .get() as Record<string, unknown>;
    expect(row.skill_id).toBe('skill.deploy');
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(0);
    expect(row.max_retries).toBe(3);
  });

  it('rejects dispatch_queue with invalid status', () => {
    expect(() => {
      db.run(
        `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason, status)
         VALUES ('dq2', 'skill.x', '{}', 'reason', 'invalid_status')`,
      );
    }).toThrow();
  });

  it('can update dispatch_queue status to dispatched', () => {
    db.run(
      `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason)
       VALUES ('dq3', 'skill.deploy', '{}', 'reason')`,
    );
    db.run("UPDATE dispatch_queue SET status = 'dispatched', updated_at = datetime('now') WHERE id = 'dq3'");
    const row = db
      .prepare("SELECT status FROM dispatch_queue WHERE id = 'dq3'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('dispatched');
  });

  // ── approval_audits ──

  it('can insert and query an approval audit', () => {
    db.run(
      `INSERT INTO approval_audits (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
       VALUES ('a1', 'appr_123', 'skill.deploy', 'deploy', 'destructive', '{}', 1, '{}', 'pending')`,
    );
    const row = db
      .prepare("SELECT * FROM approval_audits WHERE id = 'a1'")
      .get() as Record<string, unknown>;
    expect(row.pending_id).toBe('appr_123');
    expect(row.decision).toBe('pending');
    expect(row.execution_mode).toBe('destructive');
    expect(row.external_side_effects).toBe(1);
  });

  it('rejects invalid approval decision', () => {
    expect(() => {
      db.run(
        `INSERT INTO approval_audits (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
         VALUES ('a2', 'appr_456', 'skill.deploy', 'deploy', 'active', '{}', 0, '{}', 'invalid')`,
      );
    }).toThrow();
  });

  it('can update approval decision', () => {
    db.run(
      `INSERT INTO approval_audits (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
       VALUES ('a3', 'appr_789', 'skill.deploy', 'deploy', 'active', '{}', 0, '{}', 'pending')`,
    );
    db.run(
      "UPDATE approval_audits SET decision = 'approved', decided_by = 'alice', decided_at = datetime('now') WHERE id = 'a3'",
    );
    const row = db
      .prepare("SELECT * FROM approval_audits WHERE id = 'a3'")
      .get() as Record<string, unknown>;
    expect(row.decision).toBe('approved');
    expect(row.decided_by).toBe('alice');
  });
});

// ─── Zod Schema Tests ───

describe('Zod Schemas — conversation.ts', () => {
  it('ConversationMode accepts valid values', () => {
    expect(ConversationMode.parse('world_design')).toBe('world_design');
    expect(ConversationMode.parse('workflow_design')).toBe('workflow_design');
    expect(ConversationMode.parse('task')).toBe('task');
  });

  it('ConversationMode rejects invalid value', () => {
    expect(() => ConversationMode.parse('invalid')).toThrow();
  });

  it('ConductorPhase accepts valid values', () => {
    expect(ConductorPhase.parse('explore')).toBe('explore');
    expect(ConductorPhase.parse('focus')).toBe('focus');
    expect(ConductorPhase.parse('settle')).toBe('settle');
  });

  it('ConductorPhase rejects invalid value', () => {
    expect(() => ConductorPhase.parse('invalid')).toThrow();
  });

  it('MessageRole accepts valid values', () => {
    expect(MessageRole.parse('user')).toBe('user');
    expect(MessageRole.parse('assistant')).toBe('assistant');
    expect(MessageRole.parse('system')).toBe('system');
  });

  it('MessageRole rejects invalid value', () => {
    expect(() => MessageRole.parse('invalid')).toThrow();
  });

  it('ConversationSchema parses valid input', () => {
    const result = ConversationSchema.safeParse({
      id: 'c1',
      mode: 'world_design',
      phase: 'explore',
      village_id: null,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('ConversationSchema rejects invalid mode', () => {
    const result = ConversationSchema.safeParse({
      id: 'c1',
      mode: 'bad_mode',
      phase: 'explore',
      village_id: null,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('MessageSchema parses valid input', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      turn: 0,
      created_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('MessageSchema rejects negative turn', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      turn: -1,
      created_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('MessageSchema rejects non-integer turn', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'hello',
      turn: 1.5,
      created_at: '2026-01-01 00:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('CreateConversationInput accepts mode only', () => {
    const result = CreateConversationInput.safeParse({ mode: 'task' });
    expect(result.success).toBe(true);
  });

  it('CreateConversationInput accepts mode + village_id', () => {
    const result = CreateConversationInput.safeParse({
      mode: 'world_design',
      village_id: 'v1',
    });
    expect(result.success).toBe(true);
  });

  it('CreateConversationInput defaults mode to world_design when missing', () => {
    const result = CreateConversationInput.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('world_design');
    }
  });
});
