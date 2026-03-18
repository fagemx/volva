# F3: End-to-End Tests + Golden Path

> **Module**: `src/routes/container-bridge.test.ts` (integration), `src/routes/*.test.ts`
> **Layer**: L3
> **Dependencies**: F1（Bridge）, F2（Routes）, 全部前置 Track
> **Blocks**: 無（最終 task）

---

## 給 Agent 的起始指令

```bash
cat docs/plan-deepskill/VALIDATION.md        # golden path scenarios
cat docs/plan-deepskill/CONTRACT.md          # all rules
cat src/routes/container-bridge.ts            # F1
cat src/routes/skills.ts                     # F2
cat src/routes/containers.ts                 # F2
bun run build
bun test                                     # verify all existing tests still pass
```

---

## Final Result

- Golden path scenarios 全部通過
- 所有 CONTRACT rules 驗證通過
- `bun test` 全部通過（包括既有測試）
- `bun run build && bun run lint` zero errors

---

## 實作

### Step 1: Golden Path GP-1 test — Skill Container Selection

```typescript
// Test: "Deploy checkout-service" with matching skill
// 1. Create test skill.object.yaml with triggerWhen: ["deploy", "service"]
// 2. SkillRegistry.scan() picks it up
// 3. selectContainer() → primary: 'skill'
// 4. resolveContainer() → ContainerContext with skillId
```

### Step 2: Golden Path GP-2 test — Shape Fallback

```typescript
// Test: "I have a direction but don't know how"
// 1. selectContainer() → primary: 'shape', confidence: 'medium'
// 2. No skill match needed
// 3. Posture: explore
```

### Step 3: Golden Path GP-3 test — Harvest Flow

```typescript
// Test: "That workflow was good, save it"
// 1. selectContainer() → primary: 'harvest'
// 2. capturePattern() → SkillCandidate (LLM mocked)
// 3. crystallize() → valid skill.object.yaml + SKILL.md
// 4. Output passes SkillObjectSchema.safeParse
```

### Step 4: Golden Path GP-4 test — Lifecycle Telemetry

```typescript
// Test: Skill runs accumulate telemetry
// 1. Create skill_instance in DB
// 2. recordRun() × 3 with success
// 3. getMetrics() → runCount: 3, successCount: 3
// 4. evaluatePromotionGates() → min_success: passed
```

### Step 5: Golden Path GP-5 test — World Spawn Lifecycle

```typescript
// Test: World spawns child Task, direct transition rejected
// 1. selectContainer({ userMessage: "Build me a workspace", hasActiveWorld: false }) → world
// 2. spawnFromWorld(worldId, 'task', "deploy staging") → SpawnResult with parentWorld
// 3. checkContainerTransition('world', 'task', reason) → allowed: false (must spawn)
// 4. Verify: SpawnResult.childContainer === 'task'
```

### Step 6: Golden Path GP-6 test — Secondary Container Detection

```typescript
// Test: "Deploy checkout-service, then capture the flow as a skill"
// 1. selectContainer() → primary: 'skill' or 'task', secondary: 'harvest'
// 2. Verify secondary is set from "then capture" tail pattern
```

### Step 7: CONTRACT validation

```bash
# TYPE-01
bun run build

# SCHEMA-01
grep -r "as any\|: any" src/skills/ src/containers/ src/schemas/skill-object.ts | wc -l
# Expected: 0

# LAYER-01: skills/ 不 import containers/ 或 conductor/
grep -r "from.*conductor\|from.*containers" src/skills/ --include="*.ts" | wc -l
# Expected: 0

# LAYER-01: containers/ 不 import conductor/
grep -r "from.*conductor" src/containers/ --include="*.ts" | wc -l
# Expected: 0

# LAYER-02: router only type-imports from skills/types.ts
grep -r "from.*skills" src/containers/router.ts | grep -v "type " | wc -l
# Expected: 0

# bridge 在 routes/ 不在 containers/
test ! -f src/containers/bridge.ts
# Expected: pass (file does not exist)
test -f src/routes/container-bridge.ts
# Expected: pass (file exists)

# SETTLE-01: harvest has 2-step flow
grep -c "harvest\|crystallize" src/routes/skills.ts
# Expected: >= 2 (separate endpoints)

# ARCH-01: no direct Thyra DB access
grep -r "bun:sqlite.*thyra\|thyra.*Database" src/ --include="*.ts" | wc -l
# Expected: 0

# All tests
bun test
```

---

## 驗收

```bash
# Full system validation
bun run build
bun run lint
bun test

# Expected:
# - Zero build errors
# - Zero lint warnings
# - All tests pass (existing + new)
# - Golden paths GP-1 through GP-4 pass
```

## Git Commit

```
feat: add end-to-end tests for deep skill architecture

Golden path tests: skill container selection, shape fallback,
harvest flow, lifecycle telemetry. CONTRACT rules validated.
All existing tests continue to pass.
```
