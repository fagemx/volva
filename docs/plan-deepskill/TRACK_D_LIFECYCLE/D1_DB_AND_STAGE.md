# D1: DB Schema + Lifecycle Stage Tracking

> **Module**: `src/skills/lifecycle.ts`, DB migration in `src/db.ts`
> **Layer**: L2
> **Dependencies**: A1（SkillObjectSchema — LifecycleStageEnum, SkillStatusEnum）
> **Blocks**: D2（Telemetry）, D3（Promotion）

---

## 給 Agent 的起始指令

```bash
cat src/schemas/skill-object.ts              # LifecycleStageEnum, SkillStatusEnum
cat src/db.ts                                # existing DB schema pattern
cat docs/deepskill/skill-lifecycle-v0.md     # Section 5: 8 stages, Section 6: stage ↔ status
cat docs/plan-deepskill/CONTRACT.md
bun run build
```

---

## Final Result

- `src/db.ts` 新增 `skill_instances` + `skill_runs` tables
- `src/skills/lifecycle.ts` 提供 `advanceStage()` + `getSkillInstance()` + `updateStatus()`
- Stage 轉換有驗證（不能跳過 stage）
- Status 變更需明確觸發（不自動 promote）

---

## 實作

### Step 1: DB tables — append to existing `initSchema()` in `src/db.ts`

> **Integration guidance:** 在 `src/db.ts` 的 `initSchema(db)` 函數末尾，
> 在現有 `settlements` table 的 `db.run(...)` 之後，加上以下兩個 `db.run(...)` 呼叫。
> **不要**建立新的 init function。保持 `initSchema()` 為唯一的 schema entry point。

```sql
CREATE TABLE IF NOT EXISTS skill_instances (
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
);

CREATE TABLE IF NOT EXISTS skill_runs (
  id TEXT PRIMARY KEY,
  skill_instance_id TEXT NOT NULL REFERENCES skill_instances(id),
  conversation_id TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure','partial')),
  duration_ms INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Step 2: lifecycle.ts — stage advancement

```typescript
const STAGE_ORDER: LifecycleStage[] = [
  'capture', 'crystallize', 'package', 'route', 'execute', 'verify', 'learn', 'govern',
];

// Stages 5-7 are cyclic: execute → verify → learn → execute
const CYCLIC_STAGES: LifecycleStage[] = ['execute', 'verify', 'learn'];

export function advanceStage(current: LifecycleStage, target: LifecycleStage): {
  allowed: boolean;
  reason: string;
} {
  const currentIdx = STAGE_ORDER.indexOf(current);
  const targetIdx = STAGE_ORDER.indexOf(target);

  // Forward progression
  if (targetIdx === currentIdx + 1) {
    return { allowed: true, reason: `Advanced from ${current} to ${target}` };
  }

  // Cyclic: learn → execute
  if (current === 'learn' && target === 'execute') {
    return { allowed: true, reason: 'Cyclic: re-entering execute from learn' };
  }

  // Govern can go back to execute (new run after governance)
  if (current === 'govern' && target === 'execute') {
    return { allowed: true, reason: 'Re-entering execute after governance' };
  }

  return { allowed: false, reason: `Cannot transition from ${current} to ${target}` };
}
```

---

## 驗收

```bash
bun run build
bun test src/skills/lifecycle.test.ts
# Test cases:
# - capture → crystallize: allowed
# - crystallize → package: allowed
# - learn → execute: allowed (cyclic)
# - capture → execute: NOT allowed (skip)
# - verify → capture: NOT allowed (backward non-cyclic)
# - DB: insert skill_instance, query by skill_id
```

## Git Commit

```
feat(skills): add lifecycle stage tracking with DB schema

New skill_instances and skill_runs tables. advanceStage() validates
stage transitions including cyclic execute→verify→learn loop
per skill-lifecycle-v0.md Section 5.
```
