# Deep Skill Architecture — Track 拆解

## 層級定義

- **L0 基礎設施**：Skill Object Schema + Parser + Registry（型別定義 + YAML 解析 + skill 索引）
- **L1 路由層**：Container Router（容器選擇 + posture 偵測 + gate check + transition/spawn）
- **L2 生命週期**：Lifecycle + Telemetry + Harvest（stage tracking + metrics + pattern 擷取）
- **L3 整合層**：Conductor Bridge + Routes（接入現有 conductor + HTTP API）

## DAG

```
L0 基礎設施
  [A] Skill Object Schema + Parser
   │
   ├───────────────────────┐
   ▼                       ▼
  [B] Skill Registry      [D] Skill Lifecycle + Telemetry
   │                       │
   ├───────────┐           │
   ▼           │           │
L1 路由層      │           │
  [C] Container Router     │
   │           │           │
   ├───────────┤           │
   ▼           ▼           │
L2 生命週期                │
  [E] Harvest Flow         │
   │                       │
   ├───────────────────────┤
   ▼
L3 整合層
  [F] Conductor Integration + Routes
```

**關鍵依賴說明**：
- A 是所有 Track 的前提（`SkillObjectSchema` 型別必須先存在）
- B 依賴 A（registry 需要 parse skill.object.yaml，需要 SkillObject 型別）
- C 依賴 A + B（routing Gate 4 需要查 registry 找 matching skill）
- D 只依賴 A（lifecycle 操作 skill object 的 status/stage/telemetry 欄位），可與 B 並行
- E 依賴 A + C（harvest 產出 skill candidate，需要知道 container context 判斷是否觸發）
- F 整合 C + D + E，是唯一碰現有 conductor 的 Track

## Track → Step 對照

每個 Track 拆成可獨立執行的 Step，放在子目錄內：

### A: Skill Object Schema + Parser（L0）
```
TRACK_A_SKILL_OBJECT/
  A1_ZOD_SCHEMAS.md            ← 12 section 的 Zod schema + top-level SkillObjectSchema
  A2_YAML_PARSER.md            ← YAML ↔ SkillObject 雙向轉換 + safeParse
  A3_OVERLAY_MERGE.md          ← base + dispatch overlay + runtime overlay merge engine
```

### B: Skill Registry（L0）
```
TRACK_B_SKILL_REGISTRY/
  B1_FILE_INDEX.md             ← 掃描 skills/ 目錄，建立 SkillIndex（id → metadata + path）
  B2_TRIGGER_MATCHER.md        ← 比對 request context vs triggerWhen/doNotTriggerWhen + 排序
```

### C: Container Router（L1）
```
TRACK_C_CONTAINER_ROUTER/
  C1_TYPES_AND_POSTURE.md      ← Container enum + ContainerSelection + PostureSignal + posture detection
  C2_GATE_CHECK.md             ← 6-gate sequential routing + confidence behavior + fallback
  C3_TRANSITIONS_AND_TESTS.md  ← transition table + World spawn + routes + tests
```

### D: Skill Lifecycle + Telemetry（L2）
```
TRACK_D_LIFECYCLE/
  D1_DB_AND_STAGE.md           ← skill_instances + skill_runs tables + lifecycle stage machine
  D2_TELEMETRY.md              ← run_count / success_count / last_used_at collection
  D3_PROMOTION_AND_TESTS.md    ← promotion gate evaluation + retirement check + routes + tests
```

### E: Harvest Flow（L2）
```
TRACK_E_HARVEST/
  E1_PATTERN_CAPTURE.md        ← LLM extracts pattern from conversation → SkillCandidate
  E2_CRYSTALLIZE.md            ← SkillCandidate → skill.object.yaml + SKILL.md skeleton
```

### F: Conductor Integration + Routes（L3）
```
TRACK_F_INTEGRATION/
  F1_BRIDGE.md                 ← ContainerRouter ↔ existing conductor adapter
  F2_ROUTES.md                 ← Skill CRUD routes + container selection routes
  F3_E2E_TESTS.md              ← Golden path scenarios + end-to-end validation
```

---

## Track Details

## Track A: Skill Object Schema + Parser

**Layer**: L0
**Goal**: 把 `skill-object-v0.md` 的 12-section YAML schema 壓成 Zod 型別 + YAML parser + overlay merge engine

**Input**:
- `docs/deepskill/skill-object-v0.md`（canonical schema）
- `docs/deepskill/four-plane-ownership-v0.md`（ownership map + overlay merge rules）

**Output**:
- `src/schemas/skill-object.ts` — 所有 12 section 的 Zod schema + `SkillObjectSchema`
- `src/skills/yaml-parser.ts` — `parseSkillYaml(yaml: string): Result<SkillObject>` + `serializeSkillObject(obj: SkillObject): string`
- `src/skills/overlay-merge.ts` — `mergeSkillObject(base, dispatchOverlay?, runtimeOverlay?): Result<SkillObject>`
- 完整測試

**Dependencies**:
- blocks: B, C, D, E, F
- blocked-by: none (can start immediately)

**DoD**:
- [ ] `bun run build` zero errors
- [ ] 12 個 section schema 全部有 Zod 定義
- [ ] `parseSkillYaml` 能 parse `docs/deepskill/skill-object-v0.md` 裡的兩個 example
- [ ] overlay merge 正確合併 dispatch/runtime overlay
- [ ] overlay merge reject 越權欄位
- [ ] `bun test src/schemas/skill-object.test.ts` pass
- [ ] `bun test src/skills/yaml-parser.test.ts` pass
- [ ] `bun test src/skills/overlay-merge.test.ts` pass

**Smoke Test**:
```bash
bun run build
bun test src/schemas/skill-object.test.ts
bun test src/skills/yaml-parser.test.ts
bun test src/skills/overlay-merge.test.ts
```

**Task Count**: 3

---

## Track B: Skill Registry

**Layer**: L0
**Goal**: 建立 file-based skill index，讓 container router 能查詢「這個 request 有沒有 matching skill」

**Input**:
- Track A output（SkillObject 型別 + yaml parser）
- 現有 `.claude/skills/` 目錄結構

**Output**:
- `src/skills/registry.ts` — `SkillRegistry.scan(dir): SkillIndex` + `SkillRegistry.get(id): SkillObject | null`
- `src/skills/trigger-matcher.ts` — `matchSkills(context, index): SkillMatch[]`（ranked by priority）
- 完整測試

**Dependencies**:
- blocks: C
- blocked-by: A

**DoD**:
- [ ] `bun run build` zero errors
- [ ] `SkillRegistry.scan()` 能掃描含 `skill.object.yaml` 的目錄
- [ ] `matchSkills()` 能根據 `triggerWhen` / `doNotTriggerWhen` 過濾
- [ ] 結果按 `routing.priority` 排序
- [ ] 只回傳 `status` ≥ `sandbox` 的 skill
- [ ] `bun test src/skills/registry.test.ts` pass
- [ ] `bun test src/skills/trigger-matcher.test.ts` pass

**Smoke Test**:
```bash
bun run build
bun test src/skills/registry.test.ts
bun test src/skills/trigger-matcher.test.ts
```

**Task Count**: 2

---

## Track C: Container Router

**Layer**: L1
**Goal**: 實作 `container-routing-v0.md` 的 6-gate sequential routing protocol + posture detection + confidence behavior + transitions/spawns

**Input**:
- `docs/deepskill/container-routing-v0.md`（routing protocol）
- `docs/deepskill/volva-interaction-model-v0.md`（posture → container mapping）
- Track A output（SkillObject 型別）
- Track B output（SkillRegistry + TriggerMatcher — 透過 interface 注入）

**Output**:
- `src/containers/types.ts` — Container, PostureSignal, ContainerSelection types
- `src/containers/posture.ts` — `detectPosture(intentType, context): PostureSignal`
- `src/containers/router.ts` — `selectContainer(request, skillLookup): ContainerSelection`
- `src/containers/transitions.ts` — `checkContainerTransition()` + `spawnFromWorld()`
- 完整測試

**Dependencies**:
- blocks: E, F
- blocked-by: A, B

**DoD**:
- [ ] `bun run build` zero errors
- [ ] 6 gates 按順序執行
- [ ] 4 個 internal posture（explore/act/inspect/harvest）正確偵測
- [ ] confidence low → fallback to Shape
- [ ] confidence medium → proceed with rationale
- [ ] confidence high → proceed silently
- [ ] World spawn 語義正確（child container 在 World context 內執行）
- [ ] `src/containers/router.ts` 不直接 import `src/skills/registry.ts`（CONTRACT LAYER-02）
- [ ] `bun test src/containers/` all pass

**Smoke Test**:
```bash
bun run build
bun test src/containers/
```

**Task Count**: 3

---

## Track D: Skill Lifecycle + Telemetry

**Layer**: L2
**Goal**: 追蹤 skill 的 8 lifecycle stages + 收集 telemetry metrics + 評估 promotion gates

**Input**:
- `docs/deepskill/skill-lifecycle-v0.md`（8 stages, stage ↔ status mapping, promotion gates）
- `docs/deepskill/skill-object-v0.md`（telemetry section）
- Track A output（SkillObject 型別）
- 現有 `src/db.ts`（DB schema pattern）

**Output**:
- `src/skills/lifecycle.ts` — `advanceStage()` + `checkStatusPromotion()`
- `src/skills/telemetry.ts` — `recordRun()` + `getMetrics()`
- `src/skills/promotion.ts` — `evaluatePromotionGates()` + `checkRetirement()`
- DB migration: `skill_instances` + `skill_runs` tables
- 完整測試

**Dependencies**:
- blocks: F
- blocked-by: A

**DoD**:
- [ ] `bun run build` zero errors
- [ ] 8 lifecycle stages 有明確轉換函數
- [ ] `status` 變更需要明確觸發（不自動 promote）
- [ ] `telemetry`: run_count, success_count, last_used_at 正確累計
- [ ] promotion gate: 3+ 次成功、無 critical gotcha、有 trigger boundary、有 smoke check、human review
- [ ] retirement check: superseded / idle 90 days / merged
- [ ] `bun test src/skills/lifecycle.test.ts` pass
- [ ] `bun test src/skills/telemetry.test.ts` pass
- [ ] `bun test src/skills/promotion.test.ts` pass

**Smoke Test**:
```bash
bun run build
bun test src/skills/lifecycle.test.ts
bun test src/skills/telemetry.test.ts
bun test src/skills/promotion.test.ts
```

**Task Count**: 3

---

## Track E: Harvest Flow

**Layer**: L2
**Goal**: 從已完成的 conversation 中擷取 reusable pattern，產出 skill candidate + skeleton files

**Input**:
- `docs/deepskill/skill-lifecycle-v0.md`（Stage 1 Capture + Stage 2 Crystallize）
- `docs/deepskill/skill-object-v0.md`（canonical schema for skeleton）
- Track A output（SkillObject 型別 + YAML serializer）
- Track C output（container context — 知道何時觸發 harvest）

**Output**:
- `src/skills/harvest.ts` — `capturePattern(conversationHistory, context): SkillCandidate`
- `src/skills/crystallizer.ts` — `crystallize(candidate): { yaml: string, skillMd: string }`
- 完整測試

**Dependencies**:
- blocks: F
- blocked-by: A, C

**DoD**:
- [ ] `bun run build` zero errors
- [ ] `capturePattern` 用 LLM 從 conversation history 提取 purpose / triggers / boundaries（CONTRACT LLM-01 + LLM-02）
- [ ] `crystallize` 產出合法的 skill.object.yaml（通過 SkillObjectSchema.safeParse）
- [ ] `crystallize` 產出基本的 SKILL.md（含 entry instructions）
- [ ] 產出的 skill status = `draft`，currentStage = `crystallize`
- [ ] `bun test src/skills/harvest.test.ts` pass
- [ ] `bun test src/skills/crystallizer.test.ts` pass

**Smoke Test**:
```bash
bun run build
bun test src/skills/harvest.test.ts
bun test src/skills/crystallizer.test.ts
```

**Task Count**: 2

---

## Track F: Conductor Integration + Routes

**Layer**: L3
**Goal**: 把 container router 接入現有的 conductor/turn-handler，加上 HTTP API routes，跑 end-to-end golden path

**Input**:
- 現有 `src/conductor/turn-handler.ts`（現有 turn handling 邏輯）
- 現有 `src/routes/`（Hono routes pattern）
- Track C output（container router）
- Track D output（lifecycle + telemetry）
- Track E output（harvest flow）

**Output**:
- `src/routes/container-bridge.ts` — `resolveContainer()` adapter（container router → conductor）— 放在 routes/ (assembly layer) 以遵守 ARCH-02
- `src/routes/skills.ts` — Skill CRUD + trigger matching + harvest routes
- `src/routes/containers.ts` — Container selection + transition routes
- End-to-end tests

**Dependencies**:
- blocks: none
- blocked-by: C, D, E

**DoD**:
- [ ] `bun run build` zero errors
- [ ] Container router 在 turn-handler 之前執行，選擇 container context
- [ ] Skill 容器能載入 matching skill 的 environment 設定
- [ ] Harvest 容器能觸發 pattern capture
- [ ] `POST /api/skills` CRUD 工作
- [ ] `POST /api/containers/select` 回傳 ContainerSelection
- [ ] Golden path: "Deploy checkout-service" → Skill container → run → telemetry recorded
- [ ] Golden path: "I have a direction but don't know how" → Shape container
- [ ] Golden path: "That workflow was good, save it" → Harvest → skill candidate generated
- [ ] `bun test` all pass
- [ ] `bun run build && bun run lint` zero errors

**Smoke Test**:
```bash
bun run build
bun run lint
bun test
```

**Task Count**: 3

---

## Module Import 路徑

```
src/
  schemas/
    skill-object.ts              ← SkillObjectSchema + all section schemas（A1）
    intent.ts                    ← IntentType enum（existing, referenced by C1）
  skills/
    types.ts                     ← SkillLookup, SkillMatch interfaces（B1 — shared DI types）
    yaml-parser.ts               ← parseSkillYaml, serializeSkillObject（A2）
    overlay-merge.ts             ← mergeSkillObject（A3）
    registry.ts                  ← SkillRegistry class（B1）
    trigger-matcher.ts           ← matchSkills function（B2）
    lifecycle.ts                 ← advanceStage, checkStatusPromotion（D1）
    telemetry.ts                 ← recordRun, getMetrics（D2）
    promotion.ts                 ← evaluatePromotionGates, checkRetirement（D3）
    harvest.ts                   ← capturePattern（E1）
    crystallizer.ts              ← crystallize（E2）
  containers/
    types.ts                     ← Container, PostureSignal, ContainerSelection（C1）
    posture.ts                   ← detectPosture（C1）
    router.ts                    ← selectContainer + detectSecondary（C2）
    transitions.ts               ← checkContainerTransition, spawnFromWorld（C3）
  routes/
    container-bridge.ts          ← resolveContainer, containerToConversationMode（F1）
    skills.ts                    ← skillRoutes（F2）
    containers.ts                ← containerRoutes（F2）
```

## 跨模組依賴圖（import 方向）

```
schemas/skill-object ← skills/yaml-parser ← skills/overlay-merge
                     ← skills/registry ← skills/trigger-matcher
                     ← skills/lifecycle ← skills/telemetry ← skills/promotion
                     ← skills/harvest（+ llm/client） ← skills/crystallizer

skills/types ──(type import)──→ containers/router
skills/registry ──(NOT direct import)──→ containers/router

containers/types ← containers/posture
                 ← containers/router ← containers/transitions

routes/container-bridge → containers/router + conductor/turn-handler (assembly layer)
routes/skills → skills/registry + skills/lifecycle + skills/promotion + skills/harvest
routes/containers → containers/router + containers/transitions
```

**規則**：
- `skills/` 不得 import `containers/` 或 `conductor/`。
- `containers/` 不得 import `skills/`（除了 `type` import from `skills/types.ts`）或 `conductor/`。
- `routes/` 是 assembly layer，可以 import 所有下層模組（包括 `conductor/`）。
- `schemas/` 是共用基礎，所有模組可 import。

> 無例外。bridge 放在 `routes/` 解決了之前的 LAYER-01 violation。
