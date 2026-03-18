# Deep Skill Architecture — Planning Pack

## Goal

在 Völva 現有的 card-based conductor 之上，建構完整的 skill layer：
- **可路由（routable）** 的 container routing 系統（6 容器、3 軸 + posture mapping、confidence fallback）
- **可治理（governable）** 的 skill object YAML schema（12 sections、Zod 驗證、overlay merge）
- **可演化（evolvable）** 的 skill lifecycle（8 stage、promotion gate、telemetry tracking）
- **可收穫（harvestable）** 的 pattern 擷取流程（conversation → skill candidate → packaged skill）

## Dependency DAG

```
L0 基礎設施
  [A] Skill Object Schema + Parser
  [B] Skill Registry
   │
   ├─────────────────┐
   ▼                 ▼
L1 路由層
  [C] Container Router
   │
   ▼
L2 生命週期
  [D] Skill Lifecycle + Telemetry    [E] Harvest Flow
   │                                  │
   ├──────────────────────────────────┤
   ▼
L3 整合層
  [F] Conductor Integration + Routes
```

**關鍵依賴說明**：
- A 是所有 Track 的前提（skill object 型別必須先存在）
- B 依賴 A（registry 需要 parse skill YAML）
- C 依賴 A + B（routing Gate 4 需要查 registry）
- D 依賴 A（lifecycle 操作 skill object 的 status/stage/telemetry）
- E 依賴 A + C + **existing llm/**（harvest 用 LLM 擷取 pattern，需要 LLMClient）
- F 整合 C + D + E，接入現有 conductor

**Pre-existing dependencies**（不由本 plan 建立，但被引用）：
- `src/llm/client.ts` — E1 使用 LLMClient（existing module）
- `src/schemas/intent.ts` — C1 使用 IntentType enum（existing module）
- `src/db.ts` — D1 在現有 `initSchema()` 末尾加 table（existing module）

## Track Summary

| Track | Name | Layer | Tasks | Dependencies | Status |
|-------|------|-------|-------|-------------|--------|
| A | Skill Object Schema + Parser | L0 | 3 | — | ☐ |
| B | Skill Registry | L0 | 2 | A | ☐ |
| C | Container Router | L1 | 3 | A, B | ☐ |
| D | Skill Lifecycle + Telemetry | L2 | 3 | A | ☐ |
| E | Harvest Flow | L2 | 2 | A, C | ☐ |
| F | Conductor Integration + Routes | L3 | 3 | C, D, E | ☐ |

**Total: 6 Tracks, 16 Tasks**

## Parallel Execution Timeline

```
Batch 1（無依賴）：
  Agent 1 → Track A: A1 → A2 → A3

Batch 2（依賴 A，可並行）：
  Agent 1 → Track B: B1 → B2
  Agent 2 → Track D: D1 → D2 → D3

Batch 3（依賴 A + B）：
  Agent 1 → Track C: C1 → C2 → C3

Batch 4（依賴 A + C，可並行）：
  Agent 1 → Track E: E1 → E2

Batch 5（依賴 C + D + E）：
  Agent 1 → Track F: F1 → F2 → F3
```

## Progress Tracking

### Batch 1
- [ ] Track A: Skill Object Schema + Parser
  - [ ] A1: Zod Schemas for 12-Section Skill Object
  - [ ] A2: YAML Parser / Writer
  - [ ] A3: Overlay Merge Engine

### Batch 2
- [ ] Track B: Skill Registry
  - [ ] B1: File-Based Skill Index
  - [ ] B2: Trigger Matching Engine
- [ ] Track D: Skill Lifecycle + Telemetry
  - [ ] D1: DB Schema + Lifecycle Stage Tracking
  - [ ] D2: Telemetry Collection
  - [ ] D3: Promotion Gate Evaluation + Routes + Tests

### Batch 3
- [ ] Track C: Container Router
  - [ ] C1: Container Types + Posture Detection
  - [ ] C2: Sequential Gate Check + Confidence Behavior
  - [ ] C3: Container Transitions + Spawns + Tests

### Batch 4
- [ ] Track E: Harvest Flow
  - [ ] E1: Pattern Capture (Conversation → Skill Candidate)
  - [ ] E2: Crystallize + Package (Generate Skeleton)

### Batch 5
- [ ] Track F: Conductor Integration + Routes
  - [ ] F1: Container Router ↔ Conductor Bridge
  - [ ] F2: Skill Execution Routes
  - [ ] F3: End-to-End Tests + Golden Path

## Module Map

| Module | Introduced | Responsibility |
|--------|-----------|----------------|
| `src/schemas/skill-object.ts` | A1 | Zod schemas for all 12 skill object sections |
| `src/skills/yaml-parser.ts` | A2 | Parse / write skill.object.yaml files |
| `src/skills/overlay-merge.ts` | A3 | Merge base + dispatch + runtime overlays with scope enforcement |
| `src/skills/registry.ts` | B1 | Scan skill directories, build searchable index |
| `src/skills/trigger-matcher.ts` | B2 | Match request context against skill triggers |
| `src/containers/types.ts` | C1 | Container enum, ContainerSelection, PostureSignal types |
| `src/containers/posture.ts` | C1 | Detect internal posture from user intent |
| `src/containers/router.ts` | C2 | Sequential gate check, confidence behavior |
| `src/containers/transitions.ts` | C3 | Container transitions + World spawn logic |
| `src/skills/lifecycle.ts` | D1 | Stage tracking, status transitions |
| `src/skills/telemetry.ts` | D2 | Run count, success count, last_used_at collection |
| `src/skills/promotion.ts` | D3 | Promotion gate evaluation |
| `src/skills/harvest.ts` | E1 | Extract pattern from conversation history |
| `src/skills/crystallizer.ts` | E2 | Generate skill.object.yaml + SKILL.md skeleton |
| `src/skills/types.ts` | B1 | SkillLookup + SkillMatch interfaces (for DI) |
| `src/routes/container-bridge.ts` | F1 | Adapt container router to existing conductor (assembly layer) |
| `src/routes/skills.ts` | F2 | Skill CRUD + trigger matching API |
| `src/routes/containers.ts` | F2 | Container selection API |

## Data File Layout

```
src/
  schemas/
    skill-object.ts          # Zod schemas (A1)
  skills/
    yaml-parser.ts           # YAML ↔ SkillObject (A2)
    overlay-merge.ts         # Federated merge (A3)
    registry.ts              # File-based index (B1)
    trigger-matcher.ts       # Context → skill matching (B2)
    lifecycle.ts             # Stage tracking (D1)
    telemetry.ts             # Run metrics (D2)
    promotion.ts             # Gate evaluation (D3)
    harvest.ts               # Pattern capture (E1)
    crystallizer.ts          # Skeleton generation (E2)
  containers/
    types.ts                 # Container, Posture, Selection types (C1)
    posture.ts               # Posture detection (C1)
    router.ts                # Gate check + routing (C2)
    transitions.ts           # Transition + spawn logic (C3)
  routes/
    container-bridge.ts      # Conductor integration — assembly layer (F1)
    skills.ts                # Skill API routes (F2)
    containers.ts            # Container API routes (F2)
```

## Scope Exclusions

以下功能在 spec 中定義但 **v0 plan 不實作**，明確 deferred：

| Feature | Spec 位置 | Reason for deferral |
|---------|-----------|-------------------|
| **Forge sub-phase** | `volva-interaction-model-v0.md` Section 8 | World container 內部行為，需先有 World long-lived session 管理 |
| **Custom telemetry metrics** | `skill-object-v0.md` Example B `avg_deploy_duration_seconds` | v0 只追蹤 built-in 3 metrics (run_count, success_count, last_used_at) |
| **Karvi dispatch overlay** | `four-plane-ownership-v0.md` Section 6 | v0 所有 skill 都是 `dispatch.mode: local` |
| **Thyra runtime overlay** | `four-plane-ownership-v0.md` Section 6 | v0 不做 runtime constraint enforcement |
| **Edda event recording** | `four-plane-ownership-v0.md` Section 6 | v0 用 local DB；Edda event API 尚未實作 |
| **Semantic trigger matching** | `container-routing-v0.md` Section 9 | v0 用 keyword matching，不用 embedding/LLM |
| **Feature flag for legacy→container migration** | — | v0 新舊 API 並存，不強制遷移 |
