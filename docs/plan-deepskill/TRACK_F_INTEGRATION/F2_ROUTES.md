# F2: Skill CRUD Routes + Container Selection Routes

> **Module**: `src/routes/skills.ts`, `src/routes/containers.ts`
> **Layer**: L3
> **Dependencies**: F1（Bridge）, B1（Registry）, D1-D3（Lifecycle + Telemetry + Promotion）
> **Blocks**: F3（E2E Tests）

---

## 給 Agent 的起始指令

```bash
cat src/routes/conversations.ts              # 現有 Hono routes pattern
cat src/routes/response.ts                   # ok() / error() helpers
cat src/index.ts                             # app setup + route mounting
cat src/routes/container-bridge.ts            # F1 output
cat src/skills/registry.ts                   # B1 output
cat src/skills/lifecycle.ts                  # D1 output
cat src/skills/telemetry.ts                  # D2 output
cat src/skills/promotion.ts                  # D3 output
bun run build
```

---

## Final Result

- `src/routes/skills.ts` — Skill 相關 API
- `src/routes/containers.ts` — Container selection API
- 所有 routes follow 現有 Hono pattern（ok/error helpers）

---

## 實作

### Step 1: Skill routes (`routes/skills.ts`)

> **Route mounting pattern:** 現有 Hono app 在 `index.ts` 直接定義 routes（如 `app.post('/api/conversations', ...)`）。
> 新 routes 應 follow 同樣 pattern：routes file export 一個 function 接收 app，直接加 route。
> 路徑包含完整 `/api/` prefix。

```typescript
// GET  /api/skills              — list skills from registry
// GET  /api/skills/:id          — get skill by id
// GET  /api/skills/:id/metrics  — get telemetry metrics
// POST /api/skills/:id/run      — record a skill run
// GET  /api/skills/:id/promotion — evaluate promotion gates
// POST /api/skills/match        — find matching skills for context
// POST /api/skills/harvest      — capture pattern from conversation (step 1: returns SkillCandidate)
// POST /api/skills/crystallize  — crystallize candidate into skill skeleton (step 2: requires user-reviewed candidate)
```

### Step 2: Container routes (`routes/containers.ts`)

```typescript
// POST /api/containers/select    — run container routing protocol
//   body: { userMessage, intentType?, hasActiveWorld?, previousContainer? }
//   returns: ContainerSelection + ConfidenceBehavior

// POST /api/containers/transition — check if transition is allowed
//   body: { current, proposed, reason }
//   returns: TransitionResult
```

### Step 3: Mount in `index.ts`

```typescript
// Follow existing pattern — import route setup functions and call them
import { setupSkillRoutes } from './routes/skills';
import { setupContainerRoutes } from './routes/containers';

setupSkillRoutes(app, db, registry, llm);
setupContainerRoutes(app, registry);
```

---

## 驗收

```bash
bun run build
bun run lint
bun test src/routes/skills.test.ts
bun test src/routes/containers.test.ts

# API smoke test:
# POST /api/containers/select { userMessage: "deploy checkout" } → { primary: "task", confidence: "medium" }
# POST /api/skills/match { context: "deploy service" } → [{ id: "skill.deploy-service", ... }] or []
```

## Git Commit

```
feat(routes): add skill CRUD and container selection API routes

Skill routes: list, get, metrics, run recording, promotion evaluation,
trigger matching. Container routes: selection protocol, transition check.
Follows existing Hono route patterns.
```
