# D2: Telemetry Collection

> **Module**: `src/skills/telemetry.ts`
> **Layer**: L2
> **Dependencies**: D1（skill_instances + skill_runs tables）
> **Blocks**: D3（Promotion Gate — needs metrics to evaluate gates）

---

## 給 Agent 的起始指令

```bash
cat src/skills/lifecycle.ts                  # D1 output
cat src/db.ts                                # DB tables
cat docs/deepskill/skill-object-v0.md        # telemetry section
cat docs/deepskill/skill-lifecycle-v0.md     # Section 7: promotion gates use telemetry
bun run build
```

---

## Final Result

- `src/skills/telemetry.ts` 提供 `recordRun()` + `getMetrics()`
- `recordRun()` 寫入 `skill_runs` + 更新 `skill_instances` counters
- `getMetrics()` 回傳 run_count, success_count, last_used_at

---

## 實作

### Step 1: recordRun

```typescript
import type { Database } from 'bun:sqlite';

export interface RunRecord {
  skillInstanceId: string;
  conversationId?: string;
  outcome: 'success' | 'failure' | 'partial';
  durationMs?: number;
  notes?: string;
}

export function recordRun(db: Database, run: RunRecord): string {
  const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`INSERT INTO skill_runs (id, skill_instance_id, conversation_id, outcome, duration_ms, notes)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, run.skillInstanceId, run.conversationId ?? null,
    run.outcome, run.durationMs ?? null, run.notes ?? null,
  );

  // Update counters on skill_instances
  db.prepare(`UPDATE skill_instances SET
    run_count = run_count + 1,
    success_count = success_count + (CASE WHEN ? = 'success' THEN 1 ELSE 0 END),
    last_used_at = datetime('now'),
    updated_at = datetime('now')
    WHERE id = ?`).run(run.outcome, run.skillInstanceId);

  return id;
}
```

### Step 2: getMetrics

```typescript
export interface SkillMetrics {
  runCount: number;
  successCount: number;
  lastUsedAt: string | null;
  recentOutcomes: Array<{ outcome: string; createdAt: string }>;
}

export function getMetrics(db: Database, skillInstanceId: string): SkillMetrics | null {
  const row = db.prepare(
    `SELECT run_count, success_count, last_used_at FROM skill_instances WHERE id = ?`
  ).get(skillInstanceId) as Record<string, unknown> | null;

  if (!row) return null;

  const recentRuns = db.prepare(
    `SELECT outcome, created_at FROM skill_runs WHERE skill_instance_id = ? ORDER BY created_at DESC LIMIT 10`
  ).all(skillInstanceId) as Array<Record<string, unknown>>;

  return {
    runCount: row.run_count as number,
    successCount: row.success_count as number,
    lastUsedAt: row.last_used_at as string | null,
    recentOutcomes: recentRuns.map(r => ({
      outcome: r.outcome as string,
      createdAt: r.created_at as string,
    })),
  };
}
```

---

## 驗收

```bash
bun run build
bun test src/skills/telemetry.test.ts
# Test cases (real SQLite :memory:):
# - recordRun success → run_count +1, success_count +1
# - recordRun failure → run_count +1, success_count unchanged
# - getMetrics → correct counters
# - getMetrics non-existing → null
# - last_used_at updated on each run
```

## Git Commit

```
feat(skills): add telemetry collection for skill runs

recordRun() writes to skill_runs and updates counters on
skill_instances. getMetrics() returns run_count, success_count,
last_used_at for promotion gate evaluation.
```
