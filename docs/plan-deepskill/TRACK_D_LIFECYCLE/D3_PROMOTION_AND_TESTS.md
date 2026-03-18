# D3: Promotion Gate Evaluation + Routes + Tests

> **Module**: `src/skills/promotion.ts`
> **Layer**: L2
> **Dependencies**: D1（lifecycle）, D2（telemetry）, A1（SkillObjectSchema）
> **Blocks**: F2（Routes — promotion API）

---

## 給 Agent 的起始指令

```bash
cat src/skills/lifecycle.ts                  # D1
cat src/skills/telemetry.ts                  # D2
cat src/schemas/skill-object.ts              # SkillObject type
cat docs/deepskill/skill-lifecycle-v0.md     # Section 7: promotion gates + retirement
bun run build
```

---

## Final Result

- `src/skills/promotion.ts` 提供 `evaluatePromotionGates()` + `checkRetirement()`
- Promotion gates: 5 checks per skill-lifecycle-v0.md Section 7
- Retirement: 3 criteria
- 完整測試覆蓋 pass / fail 各 gate

---

## 實作

### Step 1: Promotion gate evaluation

```typescript
export interface GateResult {
  gate: string;
  passed: boolean;
  detail: string;
}

export interface PromotionEvaluation {
  eligible: boolean;
  gates: GateResult[];
  blockers: string[];
}

export function evaluatePromotionGates(
  metrics: SkillMetrics,
  skillObject: SkillObject,
): PromotionEvaluation {
  const gates: GateResult[] = [];
  const minSuccess = skillObject.telemetry?.thresholds?.promotion_min_success ?? 3;

  // Gate 1: Used successfully 3+ times
  const g1 = metrics.successCount >= minSuccess;
  gates.push({ gate: 'min_success', passed: g1, detail: `${metrics.successCount}/${minSuccess} successful runs` });

  // Gate 2: No unresolved critical gotchas (cannot check from code — manual)
  gates.push({ gate: 'no_critical_gotchas', passed: true, detail: 'Requires manual review' });

  // Gate 3: Clear trigger boundary
  const g3 = (skillObject.routing.triggerWhen.length > 0) && (skillObject.routing.doNotTriggerWhen.length > 0);
  gates.push({ gate: 'trigger_boundary', passed: g3, detail: `triggerWhen: ${skillObject.routing.triggerWhen.length}, doNotTriggerWhen: ${skillObject.routing.doNotTriggerWhen.length}` });

  // Gate 4: Verification checks exist
  const g4 = skillObject.verification.smokeChecks.length > 0;
  gates.push({ gate: 'verification_exists', passed: g4, detail: `smokeChecks: ${skillObject.verification.smokeChecks.length}` });

  // Gate 5: Human review (cannot auto-check — always requires explicit trigger)
  gates.push({ gate: 'human_review', passed: false, detail: 'Requires explicit human approval' });

  const blockers = gates.filter(g => !g.passed).map(g => g.gate);
  return { eligible: blockers.length === 0, gates, blockers };
}
```

### Step 2: Retirement check

```typescript
export interface RetirementCheck {
  shouldRetire: boolean;
  reason: string | null;
}

export function checkRetirement(
  metrics: SkillMetrics,
  skillObject: SkillObject,
): RetirementCheck {
  // Check 1: Superseded
  if (skillObject.governance.supersession.supersededBy !== null) {
    return { shouldRetire: true, reason: `Superseded by ${skillObject.governance.supersession.supersededBy}` };
  }

  // Check 2: Idle too long
  const idleDays = skillObject.telemetry?.thresholds?.retirement_idle_days ?? 90;
  if (metrics.lastUsedAt) {
    const daysSinceUse = (Date.now() - new Date(metrics.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUse > idleDays) {
      return { shouldRetire: true, reason: `No usage for ${Math.floor(daysSinceUse)} days (threshold: ${idleDays})` };
    }
  }

  return { shouldRetire: false, reason: null };
}
```

---

## 驗收

```bash
bun run build
bun test src/skills/promotion.test.ts

# Full Track D validation:
bun test src/skills/lifecycle.test.ts src/skills/telemetry.test.ts src/skills/promotion.test.ts

# Test cases:
# - 3 successes + triggers + smoke checks → eligible (except human review)
# - 2 successes → blocked on min_success
# - empty triggerWhen → blocked on trigger_boundary
# - empty smokeChecks → blocked on verification_exists
# - supersededBy set → shouldRetire: true
# - last_used_at 100 days ago → shouldRetire: true
# - last_used_at 10 days ago → shouldRetire: false
```

## Git Commit

```
feat(skills): add promotion gate evaluation and retirement check

evaluatePromotionGates() checks 5 gates per skill-lifecycle-v0.md
Section 7. checkRetirement() evaluates supersession and idle criteria.
Both use telemetry metrics from D2.
```
