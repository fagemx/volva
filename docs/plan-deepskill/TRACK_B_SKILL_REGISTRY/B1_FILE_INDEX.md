# B1: File-Based Skill Index

> **Module**: `src/skills/registry.ts`
> **Layer**: L0
> **Dependencies**: A1（SkillObjectSchema）, A2（YAML Parser）
> **Blocks**: B2（Trigger Matcher）, C2（Gate 4 查詢）

---

## 給 Agent 的起始指令

```bash
cat src/schemas/skill-object.ts              # SkillObject 型別
cat src/skills/yaml-parser.ts                # parseSkillYamlFile
cat docs/deepskill/container-routing-v0.md   # Section 8 — registry 需求
cat docs/plan-deepskill/CONTRACT.md          # LAYER-01
bun run build
```

---

## Final Result

- `src/skills/registry.ts` 提供 `SkillRegistry` class
- `scan(dir: string)` 遞迴掃描 `skills/` 目錄，找到所有 `skill.object.yaml`，parse 並建立 index
- `get(id: string)` 回傳完整 SkillObject 或 null
- `list(filter?)` 回傳符合條件的 skill 摘要清單
- Index 是 in-memory Map<string, SkillEntry>

---

## 實作

### Step 1: SkillEntry type

```typescript
import type { SkillObject, SkillStatus } from '../schemas/skill-object';

export interface SkillEntry {
  id: string;
  name: string;
  status: SkillStatus;
  priority: number;
  path: string;           // path to skill.object.yaml
  triggerWhen: string[];
  doNotTriggerWhen: string[];
  object: SkillObject;    // full parsed object
}

export interface SkillFilter {
  minStatus?: SkillStatus;
  domain?: string;
  tags?: string[];
}
```

### Step 2: SkillRegistry class

```typescript
export class SkillRegistry {
  private index = new Map<string, SkillEntry>();

  /**
   * Scan a directory for skill.object.yaml files.
   * **Continue-on-error:** a single malformed YAML does NOT prevent other skills from loading.
   * Errors are accumulated and returned alongside successfully parsed skills.
   */
  scan(dir: string): { found: number; errors: string[] } {
    const errors: string[] = [];
    const yamlPaths = globSync(`${dir}/**/skill.object.yaml`);
    for (const yamlPath of yamlPaths) {
      const result = parseSkillYamlFile(yamlPath);
      if (!result.ok) {
        errors.push(`${yamlPath}: ${result.error}`);
        continue;  // skip this skill, continue scanning
      }
      const obj = result.data;
      this.index.set(obj.id, {
        id: obj.id,
        name: obj.name,
        status: obj.status,
        priority: obj.routing.priority,
        path: yamlPath,
        triggerWhen: obj.routing.triggerWhen,
        doNotTriggerWhen: obj.routing.doNotTriggerWhen,
        object: obj,
      });
    }
    return { found: this.index.size, errors };
  }

  get(id: string): SkillObject | null {
    return this.index.get(id)?.object ?? null;
  }

  list(filter?: SkillFilter): SkillEntry[] {
    let entries = [...this.index.values()];
    if (filter?.minStatus) {
      const statusOrder = ['draft', 'sandbox', 'promoted', 'core'];
      const minIdx = statusOrder.indexOf(filter.minStatus);
      entries = entries.filter(e => statusOrder.indexOf(e.status) >= minIdx);
    }
    // apply domain, tags filters
    return entries.sort((a, b) => b.priority - a.priority);
  }
}
```

### Step 3: Export SkillLookup interface to `src/skills/types.ts`

> **Design fix:** `SkillLookup` and `SkillMatch` 放在獨立的 `types.ts` 而非 `registry.ts`。
> 這讓 Container Router 可以 `import type { SkillLookup } from '../skills/types'`
> 而不是從 concrete implementation file import，避免未來的 bundler side-effect 問題。

```typescript
// src/skills/types.ts — shared interfaces for dependency injection
export interface SkillLookup {
  findMatching(context: string): SkillMatch[];
}

export interface SkillMatch {
  id: string;
  name: string;
  priority: number;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}
```

`registry.ts` re-exports these types:
```typescript
export type { SkillLookup, SkillMatch } from './types';
```

---

## 驗收

```bash
bun run build
bun test src/skills/registry.test.ts
# Test cases:
# - scan empty dir → found: 0
# - scan dir with 1 valid skill.object.yaml → found: 1
# - scan dir with invalid YAML → errors: 1
# - get existing id → SkillObject
# - get non-existing id → null
# - list with minStatus filter → only matching
```

## Git Commit

```
feat(skills): add file-based skill registry

SkillRegistry.scan() indexes skill.object.yaml files.
Exports SkillLookup interface for dependency injection into
Container Router (CONTRACT LAYER-02).
```
