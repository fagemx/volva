# Deep Skill Architecture — Validation Plan

## Track Acceptance Criteria

### Track A: Skill Object Schema + Parser

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Build | `bun run build` zero errors | `bun run build 2>&1` |
| Lint | Zero warnings | `bun run lint` |
| 12 sections | All section schemas exist | `grep -c "Schema = z.object" src/schemas/skill-object.ts` ≥ 14 |
| YAML parse | Parse canonical examples | `bun test src/skills/yaml-parser.test.ts` |
| Overlay merge | Merge + scope enforcement | `bun test src/skills/overlay-merge.test.ts` |
| No any | Zero `as any` in module | `grep -c "as any" src/schemas/skill-object.ts src/skills/yaml-parser.ts src/skills/overlay-merge.ts` = 0 |

### Track B: Skill Registry

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Scan | Finds skill.object.yaml files | `bun test src/skills/registry.test.ts` |
| Filter | minStatus filter works | `bun test src/skills/registry.test.ts` |
| Trigger match | Keywords match triggerWhen | `bun test src/skills/trigger-matcher.test.ts` |
| Exclusion | doNotTriggerWhen excludes | `bun test src/skills/trigger-matcher.test.ts` |
| Priority sort | Results sorted by priority | `bun test src/skills/trigger-matcher.test.ts` |

### Track C: Container Router

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| 6 gates | All gates execute in order | `bun test src/containers/router.test.ts` |
| Posture detect | 4 postures correctly identified | `bun test src/containers/posture.test.ts` |
| Confidence | Low → Shape fallback | `bun test src/containers/router.test.ts` |
| Transitions | Valid transitions pass, invalid reject | `bun test src/containers/transitions.test.ts` |
| World spawn | Spawn creates child context | `bun test src/containers/transitions.test.ts` |
| LAYER-02 | No direct registry import | `grep -r "from.*registry" src/containers/router.ts \| grep -v "type "` = 0 |

### Track D: Skill Lifecycle + Telemetry

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| DB tables | skill_instances + skill_runs created | `bun test src/skills/lifecycle.test.ts` |
| Stage advance | Forward + cyclic transitions | `bun test src/skills/lifecycle.test.ts` |
| Telemetry | run_count, success_count accumulate | `bun test src/skills/telemetry.test.ts` |
| Promotion | 5 gates evaluated correctly | `bun test src/skills/promotion.test.ts` |
| Retirement | Superseded + idle detected | `bun test src/skills/promotion.test.ts` |

### Track E: Harvest Flow

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Capture | LLM extracts SkillCandidate | `bun test src/skills/harvest.test.ts` |
| LLM safety | try/catch + Zod validation | Code review: harvest.ts has try/catch |
| Crystallize | Outputs valid skill.object.yaml | `bun test src/skills/crystallizer.test.ts` |
| Defaults | status=draft, stage=crystallize | `bun test src/skills/crystallizer.test.ts` |

### Track F: Conductor Integration + Routes

| Item | Pass Criteria | Verification |
|------|--------------|-------------|
| Bridge | resolveContainer() works | `bun test src/routes/container-bridge.test.ts` |
| Skill routes | CRUD + match API | `bun test src/routes/skills.test.ts` |
| Container routes | Select + transition API | `bun test src/routes/containers.test.ts` |
| E2E | All golden paths pass | `bun test` |
| Full build | Zero errors + warnings | `bun run build && bun run lint` |

---

## Golden Path Scenarios

### GP-1: Skill Container Selection (Track A + B + C)

**Description**: Request matches an existing skill → Skill container selected → correct routing.

**Steps**:
1. Create test `skill.object.yaml` with `triggerWhen: ["deploy", "service"]`, `status: sandbox`
2. `SkillRegistry.scan(testDir)` → found: 1
3. `createSkillLookup(registry)` → SkillLookup
4. `selectContainer({ userMessage: "deploy checkout-service", intentType: "confirm" }, lookup)`
5. Verify: `primary: 'skill'`, `confidence: 'high'`

**Verification**: ContainerSelection.primary === 'skill', skillId matches test skill.

---

### GP-2: Shape Fallback on Ambiguity (Track C)

**Description**: Ambiguous request with no matching skill → Shape container with clarification.

**Steps**:
1. Empty skill registry
2. `selectContainer({ userMessage: "I want to do something interesting", intentType: "new_intent" }, emptyLookup)`
3. Verify: `primary: 'shape'`, posture: `explore`
4. `getConfidenceBehavior(selection)` → `askClarification: false` (explore is medium confidence)

**Verification**: ContainerSelection.primary === 'shape'.

---

### GP-3: Full Harvest Flow (Track A + C + E)

**Description**: User completes work, triggers harvest → pattern captured → skill skeleton generated.

**Steps**:
1. Mock conversation history: 5 turns of workflow design
2. `selectContainer({ userMessage: "save this as a reusable skill", intentType: "settle_signal" }, lookup)` → `primary: 'harvest'`
3. `capturePattern(mockLlm, history, "workflow design")` → SkillCandidate
4. `crystallize(candidate)` → CrystallizeResult
5. `SkillObjectSchema.safeParse(result.skillObject)` → success: true
6. Verify: status = 'draft', currentStage = 'crystallize'

**Verification**: Valid skill.object.yaml + SKILL.md generated with correct defaults.

---

### GP-4: Lifecycle Telemetry → Promotion Check (Track D)

**Description**: Skill accumulates runs → telemetry tracked → promotion gates evaluated.

**Steps**:
1. Create skill_instance in DB (status: sandbox, stage: execute)
2. `recordRun(db, { skillInstanceId, outcome: 'success' })` × 3
3. `getMetrics(db, skillInstanceId)` → runCount: 3, successCount: 3
4. Create test SkillObject with triggerWhen + doNotTriggerWhen + smokeChecks
5. `evaluatePromotionGates(metrics, skillObject)` → min_success: passed, trigger_boundary: passed, verification_exists: passed
6. Only human_review gate blocks

**Verification**: All automated gates pass, only human_review remains as blocker.

---

### GP-5: World Spawn Lifecycle (Track C)

**Description**: World container spawns child Task → child completes → results return to World.

**Steps**:
1. `selectContainer({ userMessage: "Build me a workspace for deployment", hasActiveWorld: false })` → `primary: 'world'`
2. In World context: `spawnFromWorld(worldId, 'task', "deploy staging")` → SpawnResult
3. Verify: SpawnResult.parentWorld === worldId, childContainer === 'task'
4. `checkContainerTransition('world', 'task', reason)` → `allowed: false` (must spawn, not transition)

**Verification**: World uses spawn, not transition. Direct transition from World is rejected.

---

### GP-6: Secondary Container Detection (Track C)

**Description**: User request with "then capture" tail pattern → secondary container set to harvest.

**Steps**:
1. `selectContainer({ userMessage: "Deploy checkout-service, then capture the flow as a skill", intentType: "confirm" }, lookup)`
2. Verify: `primary: 'skill'` or `'task'`, `secondary: 'harvest'`
3. Without tail pattern: `selectContainer({ userMessage: "Deploy checkout-service" })` → `secondary: undefined`

**Verification**: Secondary container is only set when tail pattern matches.

---

### GP-7: Harvest 2-Step Flow (Track E + F — SETTLE-01 compliance)

**Description**: Harvest requires user confirmation at both capture and crystallize steps.

**Steps**:
1. Container routing detects harvest posture → returns suggestion to user
2. User confirms → `POST /api/skills/harvest` with conversation history
3. Server returns SkillCandidate → user reviews
4. User confirms → `POST /api/skills/crystallize` with reviewed candidate
5. Server returns CrystallizeResult with valid skill.object.yaml

**Verification**: Two separate HTTP requests required. No auto-crystallization without user review.

---

## Quality Benchmarks

| CONTRACT Rule | Metric | Baseline | Verification |
|--------------|--------|----------|-------------|
| TYPE-01 | `as any` count | 0 | `grep -rc "as any\|: any" src/skills/ src/containers/ src/schemas/skill-object.ts` |
| SCHEMA-01 | Section schema count | ≥ 12 | `grep -c "Schema = z.object" src/schemas/skill-object.ts` |
| LAYER-01 | Cross-layer import violations | 0 | `grep -rc "from.*conductor\|from.*containers" src/skills/ --include="*.ts"` + `grep -rc "from.*conductor" src/containers/ --include="*.ts"` |
| LAYER-02 | Router only type-imports from skills/types.ts | 0 | `grep -r "from.*skills" src/containers/router.ts \| grep -v "type "` |
| OWNER-01 | Overlay scope enforcement tests (incl. nested path) | ≥ 4 | `grep -c "OverlayScopeError\|reviewPolicy\|out-of-scope" src/skills/overlay-merge.test.ts` |
| LLM-01 / LLM-02 | LLM calls with schema + try/catch | 100% | Code review of harvest.ts |
| COND-02 | Harvest LLM call in separate request | 100% | Code review: harvest route is independent of handleTurn |
| SETTLE-01 | Harvest has 2-step user confirmation | 100% | GP-7 test: two separate HTTP requests |
| ARCH-01 | No direct Thyra DB access | 0 | `grep -rc "bun:sqlite.*thyra" src/` |
| TEST-01 | Test pass rate | 100% | `bun test` |
