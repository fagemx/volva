# A2: DB Schema for Decision Pipeline

> **Module**: `src/db.ts` (extend existing `initSchema()`)
> **Layer**: L0
> **Dependencies**: A1 (Zod Schemas must exist for type alignment)
> **Blocks**: A3 (Session Manager), and all downstream Tracks (B-F)

---

## Bootstrap Instructions

```bash
cat docs/storage/volva-working-state-schema-v0.md   # DB table design (Sections 3-6)
cat src/db.ts                                         # existing initSchema() with 5 tables
cat src/schemas/decision.ts                           # A1 output: Zod schemas for enum values
cat docs/plan-world-design/CONTRACT.md                # STAGE-01, TYPE-01 rules
bun run build                                         # verify baseline
bun test                                              # verify existing tests still pass
```

---

## Final Result

- `src/db.ts` `initSchema()` extended with 8 new tables appended after existing 5 tables
- Tables: `decision_sessions`, `decision_card_snapshots`, `candidate_records`, `probe_records`, `signal_packets`, `commit_memo_drafts`, `promotion_check_drafts`, `decision_events`
- All JSON array/object columns use `_json` suffix
- All enum columns have `CHECK` constraints matching `shared-types.md` values
- All tables use `TEXT PRIMARY KEY`, `datetime('now')` defaults
- Foreign keys reference `decision_sessions(id)` (not `conversations(id)`)
- Existing 5 tables unchanged; `bun test` still passes

---

## Implementation Steps

### Step 1: decision_sessions table

Append to `initSchema()` after the existing `settlements` table:

```typescript
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
```

### Step 2: decision_card_snapshots table

Named `decision_card_snapshots` (not `card_snapshots`) to avoid collision with the existing `cards` table.

```sql
CREATE TABLE IF NOT EXISTS decision_card_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES decision_sessions(id),
  kind TEXT NOT NULL CHECK(kind IN ('world','workflow','task','pipeline','adapter','commerce','org','decision')),
  version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### Step 3: candidate_records table

```sql
CREATE TABLE IF NOT EXISTS candidate_records (
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
)
```

### Step 4: probe_records table

Follow `volva-working-state-schema-v0.md` Section 3.4 for columns:
- `id`, `session_id`, `candidate_id` (FK to candidate_records), `regime`
- `hypothesis`, `judge`, `probe_form`, `cheapest_probe`, `disconfirmers_json`
- `budget_bucket` CHECK IN ('signal','setup','fulfillment','reserve')
- `estimated_cost` REAL
- `status` CHECK IN ('draft','running','completed','cancelled')
- `started_at`, `completed_at`

### Step 5: signal_packets table

Follow `volva-working-state-schema-v0.md` Section 3.5 for columns:
- `id`, `probe_id` (FK to probe_records), `candidate_id` (FK to candidate_records), `regime`
- `signal_type` TEXT NOT NULL
- `strength` CHECK IN ('weak','moderate','strong')
- `evidence_json`, `negative_evidence_json`, `interpretation`, `next_questions_json`
- `created_at`

### Step 6: commit_memo_drafts table

Follow `volva-working-state-schema-v0.md` Section 3.6 for columns:
- `id`, `session_id`, `candidate_id`, `regime`
- `verdict` CHECK IN ('commit','hold','discard')
- `rationale_json`, `evidence_used_json`, `unresolved_risks_json`
- `recommended_next_step_json`, `handoff_notes_json`
- `what_forge_should_build_json`, `what_forge_must_not_build_json`
- `created_at`

### Step 7: promotion_check_drafts table

Follow `volva-working-state-schema-v0.md` Section 3.7:
- `id` TEXT PRIMARY KEY
- `session_id` TEXT NOT NULL REFERENCES decision_sessions(id)
- `target_type` TEXT NOT NULL CHECK IN ('arch-spec','project-plan','thyra-runtime')
- `target_path` TEXT
- `checklist_results_json` TEXT NOT NULL DEFAULT '{}'
- `blockers_json` TEXT NOT NULL DEFAULT '[]'
- `verdict` TEXT NOT NULL CHECK IN ('ready','not_ready','partial')
- `notes_json` TEXT
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))

### Step 8: decision_events table (append-only event log)

Follow `volva-working-state-schema-v0.md` Section 6:

```sql
CREATE TABLE IF NOT EXISTS decision_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES decision_sessions(id),
  event_type TEXT NOT NULL CHECK(event_type IN (
    'route_assigned','route_changed','path_checked',
    'candidate_generated','candidate_pruned',
    'probe_started','probe_completed',
    'signal_recorded','commit_drafted',
    'promotion_checked','spec_crystallized'
  )),
  object_type TEXT NOT NULL CHECK(object_type IN ('session','card','candidate','probe','signal','commit','promotion')),
  object_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### Step 9: Verify existing tests

Run `bun test` to confirm the 5 existing tables are unaffected. The new tables are additive.

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. Existing tests still pass
bun test

# 4. Count new tables in initSchema()
grep -c "CREATE TABLE IF NOT EXISTS" src/db.ts
# Expected: 13 (5 existing + 8 new)

# 5. All CHECK constraints present
grep -c "CHECK(" src/db.ts
# Expected: increased by at least 15

# 6. All _json columns present
grep -c "_json" src/db.ts
# Expected: >= 15

# 7. Foreign keys reference decision_sessions
grep "REFERENCES decision_sessions" src/db.ts
# Expected: 5+ matches (card_snapshots, candidate_records, probe_records, commit_memo_drafts, decision_events)

# 8. No any types (CONTRACT TYPE-01)
grep -c "as any\|: any" src/db.ts
# Expected: 0

# 9. Quick :memory: smoke test
bun -e "import { createDb, initSchema } from './src/db'; const db = createDb(); initSchema(db); console.log('OK:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().length, 'tables');"
# Expected: OK: 13 tables
```

## Git Commit

```
feat(db): add 8 decision pipeline tables to initSchema

Append decision_sessions, decision_card_snapshots, candidate_records,
probe_records, signal_packets, commit_memo_drafts, promotion_check_drafts,
and decision_events tables per volva-working-state-schema-v0.md.
```
