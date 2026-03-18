# F1: Decision API Routes

> **Module**: `src/routes/decisions.ts`
> **Layer**: L4
> **Dependencies**: A3（DecisionSessionManager）, B1（Intent Router — classifyIntent）, C1（Path Check — checkPath）, D1（Space Builder — buildSpace）, D2（Kill Filters — applyKillFilters）, E1（Probe Shell）, E2（Regime Evaluators）, E3（Commit Memo — buildCommitMemo）
> **Blocks**: F2（Forge Handoff）, F3（E2E Tests）

---

## Bootstrap Instructions

```bash
# 1. Read existing route pattern
cat src/routes/conversations.ts              # DI pattern, Hono, response helpers
cat src/routes/response.ts                   # ok(), error() helpers

# 2. Read all decision modules
cat src/decision/session-manager.ts
cat src/decision/intent-router.ts
cat src/decision/path-check.ts
cat src/decision/space-builder.ts
cat src/decision/kill-filters.ts
cat src/decision/probe-shell.ts
cat src/decision/evaluators/economic.ts
cat src/decision/evaluators/governance.ts
cat src/decision/commit-memo.ts

# 3. Read index.ts for route mounting
cat src/index.ts

# 4. Read COND-02 compliance table
cat docs/plan-world-design/00_OVERVIEW.md    # COND-02 section
cat docs/plan-world-design/CONTRACT.md

# 5. Verify baseline
bun run build
```

---

## Final Result

- `src/routes/decisions.ts` exports `decisionRoutes(deps): Hono` with 8 endpoints
- `src/index.ts` mounts `decisionRoutes` via `app.route('/', decisionRoutes(deps))`
- Each endpoint respects COND-02 (max 2 LLM calls per request)
- Multi-step flow: user confirms at each stage before proceeding (SETTLE-01 spirit)
- `bun run build` zero errors

---

## Implementation Steps

### Step 1: Define DecisionDeps interface and create route group

- **File**: `src/routes/decisions.ts`
- **Reference**: `src/routes/conversations.ts` (DI pattern)
- **Key changes**:
  1. Import dependencies:
     ```typescript
     import { Hono } from 'hono';
     import type { Database } from 'bun:sqlite';
     import { ok, error } from './response';
     import type { LLMClient } from '../llm/client';
     import type { DecisionSessionManager } from '../decision/session-manager';
     ```
  2. Define DI interface:
     ```typescript
     export interface DecisionDeps {
       db: Database;
       llm: LLMClient;
       sessionManager: DecisionSessionManager;
     }
     ```
  3. Create route factory:
     ```typescript
     export function decisionRoutes(deps: DecisionDeps): Hono {
       const app = new Hono();
       // ... endpoints
       return app;
     }
     ```

### Step 2: POST /api/decisions/start — Create session + classify intent

- **File**: `src/routes/decisions.ts`
- **Reference**: `00_OVERVIEW.md` COND-02 table (1 LLM for intent-router + 1 for reply = 2)
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/start', async (c) => { ... })`
  2. Read `userMessage` from request body
  3. LLM call #1: `classifyIntent(deps.llm, userMessage, {})`
  4. Create session via `deps.sessionManager.create(userMessage, intentRoute)`
  5. Return `ok(c, { sessionId, intentRoute })` — user reviews before proceeding
  6. Total LLM calls: 1 (COND-02 compliant)

### Step 3: POST /api/decisions/:id/path-check — Assess path certainty

- **File**: `src/routes/decisions.ts`
- **Reference**: `00_OVERVIEW.md` COND-02 table (0 LLM calls — pure function)
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/:id/path-check', async (c) => { ... })`
  2. Get session via `deps.sessionManager.getSession(id)`
  3. Validate session stage is `'routing'` (post intent-router)
  4. Call `checkPath(session.intentRoute, session.context)` — pure function
  5. Update session with `pathCheckResult`, advance stage to `'path-check'`
  6. Return `ok(c, { pathCheckResult })` with route recommendation
  7. Total LLM calls: 0

### Step 4: POST /api/decisions/:id/space-build — Generate + filter candidates

- **File**: `src/routes/decisions.ts`
- **Reference**: `00_OVERVIEW.md` COND-02 table (1 LLM for space-builder + 1 for reply = 2)
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/:id/space-build', async (c) => { ... })`
  2. Get session, validate stage is `'path-check'`
  3. Read optional `constraints` from request body
  4. LLM call #1: `buildSpace(deps.llm, session.intentRoute, session.pathCheckResult, context)`
  5. Pure filter: `applyKillFilters(candidates, session.intentRoute.primaryRegime, constraints)`
  6. Update session with candidates, advance stage to `'space-building'`
  7. Return `ok(c, { candidates: surviving, killed: killedCount })` — user reviews candidates
  8. Total LLM calls: 1 (COND-02 compliant)

### Step 5: POST /api/decisions/:id/evaluate — Run evaluator on selected candidate

- **File**: `src/routes/decisions.ts`
- **Reference**: `00_OVERVIEW.md` COND-02 table (1 LLM for evaluator + 1 for reply = 2)
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/:id/evaluate', async (c) => { ... })`
  2. Get session, validate stage is `'space-building'`
  3. Read `candidateId` and `signals` (array of SignalPacket) from request body
  4. Find candidate from session, build `EvaluatorInput`
  5. Route to regime evaluator:
     ```typescript
     const regime = session.intentRoute.primaryRegime;
     let output: EvaluatorOutput;
     if (regime === 'economic') {
       output = await evaluateEconomic(deps.llm, evaluatorInput);
     } else if (regime === 'governance') {
       output = await evaluateGovernance(deps.llm, evaluatorInput);
     } else {
       return error(c, 'UNSUPPORTED_REGIME', `Regime ${regime} not supported in v0`, 400);
     }
     ```
  6. Build commit memo: `buildCommitMemo(output, candidate)`
  7. Update session with commit memo, advance stage to `'commit-review'`
  8. Return `ok(c, { commitMemo })` — user reviews before forge
  9. Total LLM calls: 1 (COND-02 compliant)

### Step 6: POST /api/decisions/:id/forge — Confirm and handoff

- **File**: `src/routes/decisions.ts`
- **Reference**: `00_OVERVIEW.md` COND-02 table (0 LLM calls — pure function), CONTRACT SETTLE-01
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/:id/forge', async (c) => { ... })`
  2. Get session
  3. **Two code paths:**
     - **Normal path:** validate `stage === 'commit-review'`, verify `commitMemo.verdict === 'commit'`
     - **Fast-path:** validate `stage === 'path-check'` AND `routeDecision === 'forge-fast-path'`, generate synthetic CommitMemo from fixedElements, call `sessionManager.fastPathToDone(id)`
     ```typescript
     if (session.routeDecision === 'forge-fast-path' && session.stage === 'path-check') {
       // Fast-path: synthesize CommitMemo from fixed elements
       const syntheticMemo = buildFastPathCommitMemo(session);
       deps.sessionManager.fastPathToDone(session.id);
       return ok(c, { commitMemo: syntheticMemo, forgeReady: true, fastPath: true });
     }
     // Normal path
     if (session.stage !== 'commit-review') {
       return error(c, 'INVALID_STAGE', `Expected commit-review or fast-path, got ${session.stage}`, 400);
     }
     ```
  4. Read user `confirmation: true` from request body (CONTRACT SETTLE-01)
  5. Advance stage to `'done'`
  6. Return `ok(c, { commitMemo, forgeReady: true })`
  7. Total LLM calls: 0

### Step 6b: POST /api/decisions/:id/reclassify — Re-run intent classification

- **File**: `src/routes/decisions.ts`
- **Reference**: GP-4 (low confidence follow-up)
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/:id/reclassify', async (c) => { ... })`
  2. Validate session stage is `'routing'` (hasn't advanced past intent classification)
  3. Read `userMessage` (follow-up answer) from body
  4. LLM call #1: `classifyIntent(deps.llm, userMessage, { previousRoute: session.intentRoute })`
  5. Update session with new IntentRoute
  6. Return `ok(c, { sessionId, intentRoute: newRoute })`
  7. Total LLM calls: 1

### Step 6c: POST /api/decisions/:id/retry-evaluate — Re-evaluate after hold verdict

- **File**: `src/routes/decisions.ts`
- **Key changes**:
  1. Endpoint: `app.post('/api/decisions/:id/retry-evaluate', async (c) => { ... })`
  2. Validate stage is `'commit-review'` (hold verdict was returned)
  3. Read `additionalSignals` from body (new evidence from user)
  4. Reset stage to `'space-building'` via `sessionManager.resetToStage()`
  5. Re-run evaluate flow with merged signals
  6. Return `ok(c, { commitMemo })` — new verdict

### Step 6d: GET /api/decisions — List sessions + GET /api/decisions/:id — Get session

- **File**: `src/routes/decisions.ts`
- **Key changes**:
  1. `app.get('/api/decisions', ...)` — list sessions filtered by status (active/paused/done)
  2. `app.get('/api/decisions/:id', ...)` — get full session state with candidates, memos
  3. Enables session resume after disconnect

### Step 7: Mount routes in index.ts

- **File**: `src/index.ts`
- **Reference**: existing `app.route('/', conversationRoutes(deps))` pattern
- **Key changes**:
  1. Import: `import { decisionRoutes } from './routes/decisions';`
  2. Create `DecisionSessionManager` instance
  3. Mount: `app.route('/', decisionRoutes({ db, llm, sessionManager }))`

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. Route factory exported
grep -n "export function decisionRoutes" src/routes/decisions.ts

# 4. All 8 endpoints exist
grep -n "app.post('/api/decisions/start'" src/routes/decisions.ts
grep -n "app.post('/api/decisions/:id/reclassify'" src/routes/decisions.ts
grep -n "app.post('/api/decisions/:id/path-check'" src/routes/decisions.ts
grep -n "app.post('/api/decisions/:id/space-build'" src/routes/decisions.ts
grep -n "app.post('/api/decisions/:id/evaluate'" src/routes/decisions.ts
grep -n "app.post('/api/decisions/:id/retry-evaluate'" src/routes/decisions.ts
grep -n "app.post('/api/decisions/:id/forge'" src/routes/decisions.ts
grep -n "app.get('/api/decisions'" src/routes/decisions.ts

# 5. Routes mounted in index.ts
grep -n "decisionRoutes" src/index.ts

# 6. No more than 2 LLM calls per endpoint
# (Manual review: each handler calls LLM at most once + one reply)

# 7. Does not have 'any' usage (CONTRACT TYPE-01)
grep -n "as any\|: any" src/routes/decisions.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(routes): add decision pipeline API with 8 endpoints

POST start, reclassify, path-check, space-build, evaluate,
retry-evaluate, forge + GET list/get. Fast-path forge support.
Each endpoint ≤ 1 LLM call (COND-02). Multi-step flow (SETTLE-01).
Hold verdict retry and session resume supported.
```
