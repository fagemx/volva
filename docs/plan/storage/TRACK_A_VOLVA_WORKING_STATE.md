# Track A: Völva Working State DB

> Batch 1（無依賴，可立即開始）
> Repo: `C:\ai_agent\volva`
> Spec: `volva/docs/storage/volva-working-state-schema-v0.md`

## 核心設計

Build Völva's L1 persistent working decision state: 8 SQLite tables + Zod schemas + CRUD stores + append-only event log.

Follows existing Völva patterns: `src/db.ts` already has `createDb()` + `initSchema()`. New storage tables extend that schema.

---

## Step 1: Schema + DB Initialization

**Files**:
- `src/storage/db.ts` — `initStorageSchema(db)`
- `src/storage/schemas/decision-session.ts`
- `src/storage/schemas/card-snapshot.ts`
- `src/storage/schemas/candidate-record.ts`
- `src/storage/schemas/probe-record.ts`
- `src/storage/schemas/signal-packet.ts`
- `src/storage/schemas/commit-memo-draft.ts`
- `src/storage/schemas/promotion-check-draft.ts`
- `src/storage/schemas/decision-event.ts`
- `src/storage/schemas/regime.ts`

**Reference**: `volva/docs/storage/volva-working-state-schema-v0.md` §3 (types) + §5 (tables)

**Key changes**:

1. Create `src/storage/schemas/regime.ts`:
```ts
import { z } from 'zod';

export const RegimeSchema = z.enum([
  'economic', 'capability', 'leverage', 'expression', 'governance', 'identity'
]);
export type Regime = z.infer<typeof RegimeSchema>;
```

2. Create `src/storage/schemas/decision-session.ts`:
```ts
export const DecisionSessionSchema = z.object({
  id: z.string(),                    // ds_...
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  title: z.string().optional(),
  primaryRegime: RegimeSchema.optional(),
  secondaryRegimes: z.array(RegimeSchema).optional(),
  routingConfidence: z.number().min(0).max(1).optional(),
  pathCertainty: z.enum(['low', 'medium', 'high']).optional(),
  routeDecision: z.enum(['space-builder', 'space-builder-then-forge', 'forge-fast-path']).optional(),
  stage: z.enum([
    'routing', 'path-check', 'space-building', 'probe-design',
    'probe-review', 'commit-review', 'spec-crystallization', 'promotion-check', 'done'
  ]),
  status: z.enum(['active', 'paused', 'promoted', 'archived']),
  keyUnknowns: z.array(z.string()),
  currentSummary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

3. Similar Zod schemas for all 8 types (follow spec §3.1-3.7 + §4 for Regime)

4. Create `src/storage/db.ts`:
```ts
export function initStorageSchema(db: Database): void {
  // 7 snapshot tables + 1 event table
  // All use TEXT PRIMARY KEY with prefix convention
  // JSON columns: *_json suffix
  // decision_events: append-only (no UPDATE/DELETE)
}
```

**SQL tables**: Follow spec §5 exactly — `decision_sessions`, `card_snapshots`, `candidate_records`, `probe_records`, `signal_packets`, `commit_memo_drafts`, `promotion_check_drafts`, `decision_events`

**ID generation**: Use `nanoid` with prefix: `generateStorageId('ds')` → `ds_aBcDeFgHiJ`

```ts
import { nanoid } from 'nanoid';
export function generateStorageId(prefix: string): string {
  return `${prefix}_${nanoid(12)}`;
}
```

### Acceptance Criteria
```bash
bun run build
bun test src/storage/db.test.ts
# All 8 tables created
# All Zod schemas parse correctly
# generateStorageId produces correct prefix format
```

---

## Step 2: CRUD Operations

**Files**:
- `src/storage/session-store.ts`
- `src/storage/card-store.ts`
- `src/storage/candidate-store.ts`
- `src/storage/probe-store.ts`
- `src/storage/signal-store.ts`
- `src/storage/memo-store.ts`
- `src/storage/promotion-store.ts`

**Reference**: Existing Völva store patterns (e.g., how `src/cards/` works)

**Key changes**:

Each store follows this pattern:
```ts
export class SessionStore {
  constructor(private db: Database) {}
  create(input: CreateSessionInput): DecisionSession { ... }
  get(id: string): DecisionSession | null { ... }
  update(id: string, patch: Partial<DecisionSession>): DecisionSession { ... }
  list(filters?: SessionFilters): DecisionSession[] { ... }
}
```

- All CRUD uses Zod `.safeParse()` on input
- JSON columns serialized with `JSON.stringify()` / `JSON.parse()`
- `updatedAt` auto-set on every update
- Candidate status transitions follow the 7-value enum: generated → pruned → probe-ready → probing → hold → committed → discarded

### Acceptance Criteria
```bash
bun run build
bun test src/storage/session-store.test.ts
bun test src/storage/candidate-store.test.ts
bun test src/storage/probe-store.test.ts
# Full CRUD for all 7 entity types
# Status transitions validated
# Invalid input rejected by Zod
```

---

## Step 3: Event Log + Routes + Tests

**Files**:
- `src/storage/event-log.ts`
- `src/storage/routes/storage.ts`
- `src/storage/*.test.ts`

**Reference**: `volva-working-state-schema-v0.md` §6 (DecisionEvent + event log)

**Key changes**:

1. `DecisionEventLog`:
```ts
export class DecisionEventLog {
  constructor(private db: Database) {}
  append(event: Omit<DecisionEvent, 'id' | 'createdAt'>): DecisionEvent { ... }
  query(filters: { sessionId?: string; eventType?: string; since?: string }): DecisionEvent[] { ... }
  // NO update() or delete() — append-only (CONTRACT STORE-01)
}
```

2. Event types (11 values):
`route_assigned`, `route_changed`, `path_checked`, `candidate_generated`, `candidate_pruned`, `probe_started`, `probe_completed`, `signal_recorded`, `commit_drafted`, `promotion_checked`, `spec_crystallized`

3. API routes (Hono):
```
POST   /api/storage/sessions
GET    /api/storage/sessions/:id
PATCH  /api/storage/sessions/:id
GET    /api/storage/sessions
POST   /api/storage/candidates
PATCH  /api/storage/candidates/:id
POST   /api/storage/probes
PATCH  /api/storage/probes/:id
POST   /api/storage/signals
POST   /api/storage/commit-memos
POST   /api/storage/promotion-checks
GET    /api/storage/events
```

All routes return `{ ok: true, data }` or `{ ok: false, error: { code, message } }` (CONTRACT THY-11).

### Acceptance Criteria
```bash
bun run build
bun test src/storage/
# All routes return correct format
# Event log is append-only (no UPDATE/DELETE paths)
# All IDs use correct prefixes
# Full integration test: create session → add candidate → probe → signal → commit memo → events recorded
```

### Git Commit
```
feat(storage): add L1 working decision state DB with 8 tables and event log

Implements volva-working-state-schema-v0: DecisionSession, CardSnapshot,
CandidateRecord, ProbeRecord, SignalPacket, CommitMemoDraft,
PromotionCheckDraft, DecisionEvent. Dual-track persistence with
snapshot-overwrite tables + append-only event log.
```

---

## Track Completion Checklist
- [ ] A1: 8 Zod schemas + 8 SQL tables + ID generation
- [ ] A2: 7 CRUD stores with status transitions
- [ ] A3: Append-only event log + API routes + integration tests
- [ ] `bun run build` zero errors
- [ ] `bun test src/storage/` all pass
