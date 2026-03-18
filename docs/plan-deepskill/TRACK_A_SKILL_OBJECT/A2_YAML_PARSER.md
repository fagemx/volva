# A2: YAML Parser / Writer

> **Module**: `src/skills/yaml-parser.ts`
> **Layer**: L0
> **Dependencies**: A1（SkillObjectSchema）
> **Blocks**: A3（Overlay Merge）, B1（Registry）, E2（Crystallizer）

---

## 給 Agent 的起始指令

```bash
cat src/schemas/skill-object.ts              # A1 output — schemas
cat docs/deepskill/skill-object-v0.md        # Section 7 canonical examples
cat docs/plan-deepskill/CONTRACT.md          # SCHEMA-01 rule
bun run build                                 # verify baseline
```

---

## Final Result

- `src/skills/yaml-parser.ts` 提供 `parseSkillYaml(yaml: string)` 和 `serializeSkillObject(obj: SkillObject)`
- parse 結果經過 `SkillObjectSchema.safeParse()` 驗證
- serialize 產出合法 YAML（js-yaml）
- 測試覆蓋 canonical examples + malformed input

---

## 實作

### Step 1: parseSkillYaml

```typescript
import yaml from 'js-yaml';
import { SkillObjectSchema, type SkillObject } from '../schemas/skill-object';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseSkillYaml(yamlStr: string): ParseResult<SkillObject> {
  let raw: unknown;
  try {
    raw = yaml.load(yamlStr);
  } catch (e) {
    return { ok: false, error: `YAML parse error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
  const result = SkillObjectSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, data: result.data };
}
```

### Step 2: serializeSkillObject

```typescript
export function serializeSkillObject(obj: SkillObject): string {
  return yaml.dump(obj, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}
```

### Step 3: parseSkillYamlFile（convenience for file paths）

```typescript
import { readFileSync } from 'fs';

export function parseSkillYamlFile(filePath: string): ParseResult<SkillObject> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseSkillYaml(content);
  } catch (e) {
    return { ok: false, error: `File read error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}
```

---

## 驗收

```bash
# 1. Compiles
bun run build

# 2. Tests pass
bun test src/skills/yaml-parser.test.ts

# 3. No any types
grep -c "as any\|: any" src/skills/yaml-parser.ts
# Expected: 0
```

## Git Commit

```
feat(skills): add YAML parser/writer for skill objects

parseSkillYaml() validates against SkillObjectSchema via safeParse.
serializeSkillObject() outputs clean YAML via js-yaml.
```
