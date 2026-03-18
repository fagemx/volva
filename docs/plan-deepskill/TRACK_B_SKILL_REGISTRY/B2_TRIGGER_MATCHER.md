# B2: Trigger Matching Engine

> **Module**: `src/skills/trigger-matcher.ts`
> **Layer**: L0
> **Dependencies**: B1（SkillRegistry + SkillLookup interface）
> **Blocks**: C2（Gate 4 — "Does a mature skill exist?"）

---

## 給 Agent 的起始指令

```bash
cat src/skills/registry.ts                   # B1 output — SkillRegistry + SkillLookup
cat docs/deepskill/container-routing-v0.md   # Section 4 Gate 4, Section 9 Registry Dependency
cat docs/deepskill/skill-object-v0.md        # routing section — triggerWhen/doNotTriggerWhen/priority
bun run build
```

---

## Final Result

- `src/skills/trigger-matcher.ts` 提供 `createSkillLookup(registry: SkillRegistry): SkillLookup`
- `findMatching(context)` 比對 context 字串 vs 每個 skill 的 `triggerWhen` / `doNotTriggerWhen`
- 只回傳 status ≥ sandbox 的 skill
- 結果按 `routing.priority` 排序（high first）
- v0 matching 用 keyword inclusion（不需要 semantic search）

---

## 實作

### Step 1: matchSkills function

```typescript
export function matchSkills(
  context: string,
  entries: SkillEntry[],
): SkillMatch[] {
  const contextLower = context.toLowerCase();
  const matches: SkillMatch[] = [];

  for (const entry of entries) {
    // skip draft/deprecated/superseded
    if (['draft', 'deprecated', 'superseded'].includes(entry.status)) continue;

    // check doNotTriggerWhen first (exclusion)
    const excluded = entry.doNotTriggerWhen.some(pattern =>
      contextLower.includes(pattern.toLowerCase()),
    );
    if (excluded) continue;

    // check triggerWhen (inclusion)
    const triggerHits = entry.triggerWhen.filter(pattern =>
      contextLower.includes(pattern.toLowerCase()),
    );
    if (triggerHits.length === 0) continue;

    matches.push({
      id: entry.id,
      name: entry.name,
      priority: entry.priority,
      confidence: triggerHits.length >= 2 ? 'high' : 'medium',
      rationale: `Matched triggers: ${triggerHits.join(', ')}`,
    });
  }

  return matches.sort((a, b) => b.priority - a.priority);
}
```

### Step 2: createSkillLookup factory

```typescript
export function createSkillLookup(registry: SkillRegistry): SkillLookup {
  return {
    findMatching(context: string): SkillMatch[] {
      const entries = registry.list({ minStatus: 'sandbox' });
      return matchSkills(context, entries);
    },
  };
}
```

---

## 驗收

```bash
bun run build
bun test src/skills/trigger-matcher.test.ts
# Test cases:
# - context matches triggerWhen → returned
# - context matches doNotTriggerWhen → excluded
# - draft skill → excluded
# - multiple matches → sorted by priority
# - no match → empty array
# - 2+ trigger hits → confidence: high
# - 1 trigger hit → confidence: medium
```

## Git Commit

```
feat(skills): add trigger matching engine

matchSkills() compares request context against skill triggerWhen/
doNotTriggerWhen with keyword matching. Returns ranked matches
filtered to status >= sandbox. Implements SkillLookup interface.
```
