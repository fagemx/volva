# A1: Zod Schemas for 12-Section Skill Object

> **Module**: `src/schemas/skill-object.ts`
> **Layer**: L0
> **Dependencies**: 無（首個 task）
> **Blocks**: A2（YAML Parser）, A3（Overlay Merge）, 以及所有後續 Track

---

## 給 Agent 的起始指令

```bash
cat docs/deepskill/skill-object-v0.md       # canonical schema（Section 4）
cat docs/deepskill/four-plane-ownership-v0.md # ownership map（哪些欄位屬於哪個 plane）
cat src/schemas/card.ts                       # 現有 Zod schema pattern
cat docs/plan-deepskill/CONTRACT.md           # TYPE-01, SCHEMA-01 rules
bun run build                                 # verify baseline
```

---

## Final Result

- `src/schemas/skill-object.ts` 包含 12 個 section schema + 頂層 `SkillObjectSchema`
- 所有 enum 值與 `skill-object-v0.md` Section 4 完全對齊
- Export 所有 Zod schema + inferred TypeScript types
- `bun run build` zero errors

---

## 實作

### Step 1: Top-Level Fields

```typescript
// src/schemas/skill-object.ts
import { z } from 'zod';

export const SkillStatusEnum = z.enum(['draft', 'sandbox', 'promoted', 'core', 'deprecated', 'superseded']);
export type SkillStatus = z.infer<typeof SkillStatusEnum>;

export const LifecycleStageEnum = z.enum([
  'capture', 'crystallize', 'package', 'route', 'execute', 'verify', 'learn', 'govern',
]);
export type LifecycleStage = z.infer<typeof LifecycleStageEnum>;

export const MaturityEnum = z.enum(['emerging', 'stable', 'core']);
export const RiskTierEnum = z.enum(['low', 'medium', 'high', 'critical']);
export const ExecutionModeEnum = z.enum(['advisory', 'assistive', 'active', 'destructive']);
export const DispatchModeEnum = z.enum(['local', 'karvi', 'hybrid']);
```

### Step 2: 10 Required Section Schemas

逐一定義 identity, purpose, routing, contract, package, environment, dispatch, verification, memory, governance 的 Zod schema。

每個 schema 的欄位和型別嚴格對照 `skill-object-v0.md` Section 4 的 YAML。

**Key points:**
- `contract.inputs.required` / `optional`：每個 entry 是 `{ name: string, type: string, description: string }` + optional `default`
- `package.hooks`：每個 entry 是 `{ event: "pre-run"|"post-run"|"on-fail", script: string }`
- `environment.permissions`：包含 `filesystem`, `network`, `process`, `secrets`
- `routing.priority`：`z.number().int().min(0).max(100).default(50)`

### Step 3: 2 Auto-Managed Section Schemas

```typescript
const TelemetryMetricSchema = z.object({
  metric: z.string(),
});

const TelemetrySchema = z.object({
  track: z.array(TelemetryMetricSchema),
  thresholds: z.object({
    promotion_min_success: z.number().int().default(3),
    retirement_idle_days: z.number().int().default(90),
  }).partial(),
  reporting: z.object({
    target: z.string().default('edda'),
    frequency: z.enum(['on_governance', 'weekly', 'on_demand']).default('on_governance'),
  }).partial(),
});

const LifecycleSchema = z.object({
  createdFrom: z.array(z.string()),
  currentStage: LifecycleStageEnum,
  promotionPath: z.array(SkillStatusEnum),
  retirementCriteria: z.array(z.string()),
  lastReviewedAt: z.string().nullable(),
});
```

### Step 4: Top-Level SkillObjectSchema

```typescript
export const SkillObjectSchema = z.object({
  kind: z.literal('SkillObject'),
  apiVersion: z.string(),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  status: SkillStatusEnum,
  identity: IdentitySchema,
  purpose: PurposeSchema,
  routing: RoutingSchema,
  contract: ContractSchema,
  package: PackageSchema,
  environment: EnvironmentSchema,
  dispatch: DispatchSchema,
  verification: VerificationSchema,
  memory: MemorySchema,
  governance: GovernanceSchema,
  telemetry: TelemetrySchema.optional(),
  lifecycle: LifecycleSchema.optional(),
});

export type SkillObject = z.infer<typeof SkillObjectSchema>;
```

---

## 驗收

```bash
# 1. Compiles
bun run build

# 2. Lint
bun run lint

# 3. All section schemas exported
grep -c "Schema = z.object" src/schemas/skill-object.ts
# Expected: >= 14 (12 sections + top-level + sub-schemas)

# 4. No any types
grep -c "as any\|: any" src/schemas/skill-object.ts
# Expected: 0

# 5. SkillObjectSchema is exported
grep "export.*SkillObjectSchema" src/schemas/skill-object.ts
# Expected: 1 match
```

## Git Commit

```
feat(schemas): add Zod schemas for 12-section skill object

Define SkillObjectSchema with all required + auto-managed sections
per skill-object-v0.md. Includes SkillStatus, LifecycleStage,
ExecutionMode, DispatchMode enums.
```
