# A3: DecisionSessionManager

> **Module**: `src/decision/session-manager.ts`
> **Layer**: L0
> **Dependencies**: A1 (Zod Schemas), A2 (DB Tables)
> **Blocks**: B (Intent Router), C (Path Check), D (Space Builder), E (Probe-Commit), F (Integration)

---

## Bootstrap Instructions

```bash
cat src/schemas/decision.ts                            # A1 output: Regime, stage enums
cat src/db.ts                                          # A2 output: 8 new tables
cat src/cards/card-manager.ts                          # existing manager pattern (constructor(db), query/insert)
cat docs/storage/volva-working-state-schema-v0.md      # DecisionSession, CandidateRecord, ProbeRecord, etc.
cat docs/plan-world-design/CONTRACT.md                 # STAGE-01, LAYER-01 rules
bun run build                                          # verify A1 + A2 compiles
```

---

## Final Result

- `src/decision/session-manager.ts` with `DecisionSessionManager` class
- CRUD: `createSession`, `getSession`, `updateSession`
- Stage machine: `advanceStage` with ordered validation (9 stages, linear progression)
- Helpers: `addCandidate`, `addProbe`, `addSignal`, `addCommitMemo`, `addEvent`
- `src/decision/session-manager.test.ts` with tests covering normal + error paths
- `bun run build` zero errors, `bun test src/decision/session-manager.test.ts` passes

---

## Implementation Steps

### Step 1: Types and Stage Order

```typescript
// src/decision/session-manager.ts
import type { Database } from 'bun:sqlite';
import type { Regime } from '../schemas/decision';

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
```

### Step 2: DecisionSessionManager Class

```typescript
export class DecisionSessionManager {
  constructor(private db: Database) {}

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
    return this.getSession(id)!;
  }

  getSession(id: string): DecisionSession | null {
    const row = this.db
      .query('SELECT * FROM decision_sessions WHERE id = ?')
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToSession(row);
  }

  // ... updateSession, rowToSession helper (parse _json columns)
}
```

### Step 3: advanceStage with Validation (CONTRACT STAGE-01)

```typescript
advanceStage(sessionId: string, targetStage: DecisionStage): DecisionSession {
  const session = this.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

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
  return this.getSession(sessionId)!;
}

/**
 * Fast-path completion: jump directly from path-check to done.
 * Only allowed when routeDecision === 'forge-fast-path'.
 * Generates a synthetic CommitMemo from fixed elements.
 */
fastPathToDone(sessionId: string): DecisionSession {
  const session = this.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
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
  return this.getSession(sessionId)!;
}

/**
 * Reset to an earlier stage. Limited to specific backward transitions:
 * - commit-review → space-building (user wants different candidate)
 * - space-building → path-check (user wants to re-check path)
 * Does NOT allow resetting to 'routing' (create a new session instead).
 */
resetToStage(sessionId: string, targetStage: DecisionStage): DecisionSession {
  const session = this.getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const ALLOWED_RESETS: Record<string, DecisionStage[]> = {
    'commit-review': ['space-building'],
    'space-building': ['path-check'],
    'probe-design': ['space-building'],
    'probe-review': ['probe-design', 'space-building'],
  };

  const allowed = ALLOWED_RESETS[session.stage] ?? [];
  if (!allowed.includes(targetStage)) {
    throw new Error(`Cannot reset from "${session.stage}" to "${targetStage}". Allowed: ${allowed.join(', ') || 'none'}`);
  }

  const now = new Date().toISOString();
  this.db.run(
    'UPDATE decision_sessions SET stage = ?, updated_at = ? WHERE id = ?',
    [targetStage, now, sessionId],
  );
  return this.getSession(sessionId)!;
}
```

### Step 4: Helper Methods for Related Records

```typescript
addCandidate(sessionId: string, candidate: {
  regime: Regime;
  form: string;
  description: string;
  whyExists: string[];
  assumptions: string[];
  domain?: string;
  vehicle?: string;
  worldForm?: string;
}): string {
  const id = `cand_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  this.db.run(
    `INSERT INTO candidate_records
     (id, session_id, regime, form, description, why_exists_json, assumptions_json, domain, vehicle, world_form, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, candidate.regime, candidate.form, candidate.description,
     JSON.stringify(candidate.whyExists), JSON.stringify(candidate.assumptions),
     candidate.domain ?? null, candidate.vehicle ?? null, candidate.worldForm ?? null,
     now, now],
  );
  return id;
}
```

Implement similarly:
- `addProbe(sessionId, candidateId, probe)` → inserts into `probe_records`, returns probe id
- `addSignal(probeId, candidateId, signal)` → inserts into `signal_packets`, returns signal id
- `addCommitMemo(sessionId, candidateId, memo)` → inserts into `commit_memo_drafts`, returns memo id
- `addEvent(sessionId, event)` → inserts into `decision_events`, returns event id
- `getCandidates(sessionId)` → returns all candidate_records for session
- `getProbes(candidateId)` → returns all probe_records for candidate
- `getSignals(probeId)` → returns all signal_packets for probe

Each insert method generates a prefixed UUID (`cand_`, `probe_`, `sig_`, `commit_`, `evt_`) and returns the id.

### Step 5: rowToSession Helper

```typescript
private rowToSession(row: Record<string, unknown>): DecisionSession {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string | null,
    userId: row.user_id as string | null,
    title: row.title as string | null,
    primaryRegime: row.primary_regime as Regime | null,
    secondaryRegimes: row.secondary_regimes_json
      ? JSON.parse(row.secondary_regimes_json as string) as Regime[]
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
```

### Step 6: Tests

```typescript
// src/decision/session-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initSchema } from '../db';
import { DecisionSessionManager } from './session-manager';
import type { Database } from 'bun:sqlite';

describe('DecisionSessionManager', () => {
  let db: Database;
  let manager: DecisionSessionManager;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    manager = new DecisionSessionManager(db);
  });

  // ─── CRUD ───
  it('creates a session with default stage and status', () => {
    const session = manager.createSession({ title: 'test' });
    expect(session.id).toMatch(/^ds_/);
    expect(session.stage).toBe('routing');
    expect(session.status).toBe('active');
    expect(session.title).toBe('test');
  });

  it('returns null for nonexistent session', () => {
    expect(manager.getSession('ds_nonexistent')).toBeNull();
  });

  // ─── Stage Machine ───
  it('advances routing → path-check when primaryRegime is set', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic' });
    const advanced = manager.advanceStage(session.id, 'path-check');
    expect(advanced.stage).toBe('path-check');
  });

  it('rejects path-check advance without primaryRegime', () => {
    const session = manager.createSession();
    expect(() => manager.advanceStage(session.id, 'path-check'))
      .toThrow('primaryRegime not set');
  });

  it('rejects backward stage transition', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic' });
    manager.advanceStage(session.id, 'path-check');
    expect(() => manager.advanceStage(session.id, 'routing'))
      .toThrow('must advance forward');
  });

  it('rejects stage skip', () => {
    const session = manager.createSession();
    expect(() => manager.advanceStage(session.id, 'space-building'))
      .toThrow('Cannot skip stages');
  });

  // ─── Fast-Path ───
  it('fastPathToDone jumps from path-check to done when forge-fast-path', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, {
      primaryRegime: 'leverage',
      routeDecision: 'forge-fast-path',
    });
    manager.advanceStage(session.id, 'path-check');
    const done = manager.fastPathToDone(session.id);
    expect(done.stage).toBe('done');
  });

  it('rejects fastPathToDone when not forge-fast-path', () => {
    const session = manager.createSession();
    manager.updateSession(session.id, {
      primaryRegime: 'economic',
      routeDecision: 'space-builder',
    });
    manager.advanceStage(session.id, 'path-check');
    expect(() => manager.fastPathToDone(session.id)).toThrow('forge-fast-path');
  });

  // ─── Reset ───
  it('resets from commit-review to space-building', () => {
    // advance to commit-review (would need full flow, simplified here)
    const session = manager.createSession();
    manager.updateSession(session.id, { primaryRegime: 'economic', routeDecision: 'space-builder' });
    manager.advanceStage(session.id, 'path-check');
    manager.advanceStage(session.id, 'space-building');
    manager.advanceStage(session.id, 'probe-design');
    manager.advanceStage(session.id, 'probe-review');
    manager.advanceStage(session.id, 'commit-review');
    const reset = manager.resetToStage(session.id, 'space-building');
    expect(reset.stage).toBe('space-building');
  });

  it('rejects invalid reset', () => {
    const session = manager.createSession();
    expect(() => manager.resetToStage(session.id, 'done')).toThrow('Cannot reset');
  });

  // ─── Helpers ───
  it('adds and retrieves candidates for a session', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic',
      form: 'service',
      description: 'test candidate',
      whyExists: ['reason 1'],
      assumptions: ['assumption 1'],
    });
    expect(candId).toMatch(/^cand_/);
    const candidates = manager.getCandidates(session.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].description).toBe('test candidate');
  });

  it('adds probe, signal, and commit memo in sequence', () => {
    const session = manager.createSession();
    const candId = manager.addCandidate(session.id, {
      regime: 'economic', form: 'tool', description: 'x',
      whyExists: [], assumptions: [],
    });
    const probeId = manager.addProbe(session.id, candId, {
      regime: 'economic', hypothesis: 'h', judge: 'j',
      probeForm: 'interview', cheapestProbe: 'ask 3 people',
      disconfirmers: ['no interest'],
    });
    expect(probeId).toMatch(/^probe_/);

    const sigId = manager.addSignal(probeId, candId, {
      regime: 'economic', signalType: 'buyer_interest',
      strength: 'moderate', evidence: ['2/3 interested'],
      interpretation: 'promising', nextQuestions: ['price?'],
    });
    expect(sigId).toMatch(/^sig_/);

    const memoId = manager.addCommitMemo(session.id, candId, {
      regime: 'economic', verdict: 'commit',
      rationale: ['strong signal'], evidenceUsed: ['buyer interest'],
      unresolvedRisks: [], recommendedNextStep: ['build MVP'],
      whatForgeShouldBuild: ['landing page'],
      whatForgeMustNotBuild: ['full platform'],
    });
    expect(memoId).toMatch(/^commit_/);
  });

  // ─── Event Log ───
  it('records decision events', () => {
    const session = manager.createSession();
    const evtId = manager.addEvent(session.id, {
      eventType: 'route_assigned',
      objectType: 'session',
      objectId: session.id,
      payload: { regime: 'economic' },
    });
    expect(evtId).toMatch(/^evt_/);
  });
});
```

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. Tests pass
bun test src/decision/session-manager.test.ts

# 4. Stage validation enforced (CONTRACT STAGE-01)
grep "advanceStage" src/decision/session-manager.ts
# Expected: function exists with precondition checks

# 5. Only session-manager updates stage column
grep -rn "UPDATE.*decision_sessions.*stage" src/ --include="*.ts" | grep -v session-manager
# Expected: 0 matches

# 6. No imports from conductor/cards/settlement (CONTRACT LAYER-01)
grep -r "from.*conductor\|from.*cards\|from.*settlement" src/decision/ --include="*.ts" | wc -l
# Expected: 0

# 7. No any types (CONTRACT TYPE-01)
grep -c "as any\|: any" src/decision/session-manager.ts
# Expected: 0

# 8. Uses real :memory: DB (not mocks)
grep ":memory:" src/decision/session-manager.test.ts
# Expected: >= 1
```

## Git Commit

```
feat(decision): add DecisionSessionManager with stage machine

Implement session CRUD, ordered stage transitions with precondition
validation, and helpers for candidates, probes, signals, commit memos,
and events. Tests use real SQLite :memory: DB.
```
