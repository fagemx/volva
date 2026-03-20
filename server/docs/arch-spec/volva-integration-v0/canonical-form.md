# canonical-form.md

> Status: `working draft`
>
> Purpose: What does one complete Volva dispatch cycle look like, from request to result?
>
> Shared types: see `./shared-types.md`

---

## 1. One-Liner

> **One Volva dispatch cycle is: validate the request, check approval gates, build an execution plan (skill or forge), generate steps, dispatch to runtime via worktree, stream progress via SSE, collect telemetry, and clean up.**

---

## 2. What It's NOT / Most Common Mistakes

1. **Not a board task.** Volva dispatches bypass board.json entirely. The executor calls runtime adapters directly — no step-worker, no board state, no task-log.jsonl. The in-memory `dispatchStore` (a `Map`) is the only state.

2. **Not a continuous loop.** Unlike issue-autopilot which re-scans, a Volva dispatch is a single fire-and-forget cycle. The caller sends one request, gets back an ID, and monitors via SSE or polling until terminal.

3. **Not a unified path.** There are two distinct entry points — skill-dispatch and forge-build — that converge at execution but diverge at validation, plan building, and step generation. Do not treat them as one flow.

---

## 3. Core Definition — Five Stages

### Stage 1: VALIDATE

**What**: Parse and validate the incoming JSON request body against its schema.
**Skill path**: `validateSkillDispatchRequest(body)` checks `skillId`, `skillName`, `skillVersion`, `skillContent`, plus nested `environment`, `dispatch`, `verification`, and `context` objects.
**Forge path**: `validateForgeBuildRequest(body)` checks `sessionId`, `candidateId`, `regime`, `verdict`, `whatToBuild`, plus regime-specific context (economic or governance).
**Artifacts produced**: `{ ok: true, data }` or `{ ok: false, errors: string[] }`.
**Implementation**: `server/volva/validators.js`.

### Stage 2: BUILD PLAN

**What**: Transform the validated request into an internal execution plan.
**Skill path**: `buildSkillDispatchPlan(request, { availableRuntimes })` — selects runtime (first match from `runtimeOptions` against available), resolves worker class, computes timeout, and assembles a `SkillDispatchPlan` with kind `volva_skill_dispatch`.
**Forge path**: `buildForgePipeline(request)` — resolves forge template by regime (`forge-economic` or `forge-governance`), extracts placeholder data from request + regimeContext, fills template instructions, and assembles a `ForgeBuildPlan` with kind `volva_forge_build`.
**Gate**: Approval check happens *between* VALIDATE and BUILD PLAN for skill-dispatch only. If `requireHumanBeforeDispatch` is true and no `approvalToken` is provided, the cycle halts with `APPROVAL_REQUIRED` (HTTP 403).
**Artifacts produced**: `SkillDispatchPlan` or `ForgeBuildPlan`.
**Implementation**: `server/volva/skill-dispatch.js`, `server/volva/forge-pipeline.js`.

### Stage 3: GENERATE STEPS

**What**: Convert the plan into an ordered array of executable steps.
**Skill path**: `buildSkillSteps(plan)` generates 3 steps: `plan`, `implement`, `review`. Each step's instruction is assembled by `injectSkillContent()` which concatenates task message, skill definition, inputs, and step-specific guidance.
**Forge path**: Steps are already embedded in the plan from Stage 2. Template instructions are pre-filled with placeholder data (whatToBuild, whatNotToBuild, regime context fields).
**Fallback**: For forge-build entries, executor falls back to a single `execute` step if the entry type is not `skill-dispatch`.
**Artifacts produced**: `Array<{ stepId, type, group, instruction, timeoutSec }>`.
**Implementation**: `server/volva/skill-dispatch.js` (buildSkillSteps), `server/volva/forge-pipeline.js` (steps in plan).

### Stage 4: EXECUTE

**What**: Create a git worktree, dispatch each step sequentially to the selected runtime, collect results and telemetry.
**Worktree**: Created as `volva-<dispatchId>` via `worktree.createWorktree()`. All step execution runs inside the worktree path. Cleaned up in `finally` block (best-effort).
**Step loop**: Steps execute sequentially (group 0, 1, 2). Each step dispatches to the runtime adapter with instruction, timeout, and working directory. Runtime returns reply text and usage (tokens, cost).
**SSE events emitted**: `step_started`, `progress` (on activity callback), `step_completed` per step. On completion: `dispatch_completed` (skill) or `build_completed` (forge). On error: `error`.
**Telemetry**: Accumulated across all steps — `totalTokens`, `totalCost`, `runtime`, `model`, `stepsExecuted`.
**Implementation**: `server/volva/executor.js`.

### Stage 5: COLLECT

**What**: Store results in the dispatch entry and stream to SSE clients.
**Success**: `entry.status = 'completed'`, `entry.result = { stepResults, telemetry }`.
**Failure**: `entry.status = 'failed'`, `entry.result = { error, stepResults (partial) }`.
**Polling**: `GET /api/volva/status/<id>` returns a JSON snapshot with `id`, `type`, `status`, `progress`, `startedAt`, `elapsedMs`, and optionally `result`.
**SSE streaming**: `GET /api/volva/status/<id>?stream=true` opens an SSE connection. Heartbeat every 30s. Client cleanup on disconnect.
**Implementation**: `server/routes/volva.js`.

---

## 4. Canonical Form / Flow -- ASCII Diagram

```text
           Volva (caller)
               │
               │  POST /api/volva/dispatch-skill
               │  POST /api/volva/forge-build
               ▼
┌──────────────────────────────────────────────────────┐
│  1. VALIDATE                                          │
│  validators.js: validateSkillDispatchRequest()        │
│                 validateForgeBuildRequest()            │
│  → 400 VALIDATION_ERROR on failure                    │
└──────────────┬───────────────────────────────────────┘
               │ validated request
               ▼
┌──────────────────────────────────────────────────────┐
│  APPROVAL GATE (skill-dispatch only)                  │
│  requireHumanBeforeDispatch && !approvalToken?         │
│  → 403 APPROVAL_REQUIRED + pendingApprovalId          │
│  → caller re-submits with approvalToken               │
└──────────────┬───────────────────────────────────────┘
               │ approved
               ▼
┌──────────────────────────────────────────────────────┐
│  2. BUILD PLAN                                        │
│                                                       │
│  ┌─── skill-dispatch ───┐  ┌─── forge-build ────────┐│
│  │ buildSkillDispatchPlan│  │ buildForgePipeline()   ││
│  │ → selectRuntime()    │  │ → resolveForgeTemplate()││
│  │ → resolveWorkerClass()│  │ → fillTemplate()       ││
│  │ → SkillDispatchPlan  │  │ → ForgeBuildPlan       ││
│  └──────────┬───────────┘  └──────────┬─────────────┘│
└─────────────┼──────────────────────────┼─────────────┘
              │                          │
              ▼                          ▼
┌──────────────────────────────────────────────────────┐
│  3. GENERATE STEPS                                    │
│                                                       │
│  skill: buildSkillSteps(plan)                         │
│    → plan / implement / review                        │
│    → injectSkillContent() per step                    │
│                                                       │
│  forge: steps already in plan                         │
│    → plan / implement / review                        │
│    → template-filled instructions                     │
└──────────────┬───────────────────────────────────────┘
               │ steps[]
               ▼
┌──────────────────────────────────────────────────────┐
│  STORE ENTRY + RETURN ID                              │
│  dispatchStore.set(id, entry)                         │
│  → 200 { dispatchId | buildId, status: 'queued' }     │
│  → caller receives ID immediately                     │
└──────────────┬───────────────────────────────────────┘
               │ async (fire-and-forget)
               ▼
┌──────────────────────────────────────────────────────┐
│  4. EXECUTE  (executor.js)                            │
│                                                       │
│  worktree.createWorktree(repoRoot, 'volva-<id>')      │
│  for each step:                                       │
│    ├── SSE: step_started                              │
│    ├── runtime.dispatch(plan)                         │
│    ├── runtime.extractReplyText(result)               │
│    ├── runtime.extractUsage(result)                   │
│    ├── accumulate tokens + cost                       │
│    └── SSE: step_completed                            │
│  worktree.removeWorktree() (finally, best-effort)     │
└──────────────┬───────────────────────────────────────┘
               │ stepResults[] + telemetry
               ▼
┌──────────────────────────────────────────────────────┐
│  5. COLLECT                                           │
│  entry.status = completed | failed                    │
│  entry.result = { stepResults, telemetry }            │
│  SSE: dispatch_completed | build_completed | error    │
│                                                       │
│  Caller reads via:                                    │
│    GET /api/volva/status/<id>          → JSON snapshot │
│    GET /api/volva/status/<id>?stream   → SSE stream   │
└──────────────────────────────────────────────────────┘
```

---

## 5. Canonical Artifacts

Each dispatch cycle produces or consumes these artifacts:

```text
1. Request body (input)        ← SkillDispatchRequest or ForgeBuildRequest
2. DispatchEntry (in-memory)   ← dispatchStore Map entry (id, type, status, plan, result, sseClients)
3. SkillDispatchPlan / ForgeBuildPlan ← internal execution plan
4. Steps array                 ← plan/implement/review instructions
5. Worktree (transient)        ← git worktree, created and destroyed per dispatch
6. SSE event stream            ← step_started, progress, step_completed, dispatch_completed/build_completed
7. Telemetry                   ← totalTokens, totalCost, runtime, model, stepsExecuted
```

---

## 6. Position in the Overall System

The Volva dispatch cycle sits *beside* the kernel's step lifecycle, not inside it:

```text
volva dispatch cycle (this spec)
  ├── calls: runtime.dispatch() directly (executor.js)
  ├── manages: worktree lifecycle (create/destroy)
  ├── stores: dispatchStore (in-memory Map)
  └── streams: SSE events to connected clients

kernel step lifecycle (separate, NOT involved)
  ├── routes: step_completed → next step
  ├── delegates: step-worker.js (execution)
  └── persists: board.json + task-log.jsonl
```

Volva dispatches do NOT touch board.json, task-log.jsonl, or step-worker.

---

## 7. Canonical Examples

### Example: Skill dispatch with approval gate

1. Caller sends `POST /api/volva/dispatch-skill` with `requireHumanBeforeDispatch: true`, no `approvalToken`.
2. VALIDATE passes. Approval gate triggers.
3. Response: `403 { ok: false, error: { code: "APPROVAL_REQUIRED", pendingApprovalId: "appr_..." } }`.
4. Human approves. Caller re-sends with `approvalToken: { pendingId: "appr_...", approvedBy: "alice", approvedAt: "..." }`.
5. VALIDATE passes. Approval gate passes. BUILD PLAN runs.
6. Response: `200 { ok: true, data: { dispatchId: "disp_...", status: "queued" } }`.
7. Caller connects SSE: `GET /api/volva/status/disp_...?stream=true`.
8. Receives: `step_started` (plan) -> `step_completed` (plan) -> `step_started` (implement) -> ... -> `dispatch_completed`.

### Example: Forge build with governance regime

1. Caller sends `POST /api/volva/forge-build` with `regime: "governance"`, `whatToBuild: ["village YAML", "constitution draft"]`.
2. VALIDATE passes. No approval gate for forge builds.
3. `buildForgePipeline()` resolves `forge-governance` template, fills placeholders (worldForm, minimumWorldShape, etc.).
4. Response: `200 { ok: true, data: { buildId: "build_...", status: "queued", pipeline: "forge-governance", steps: 3 } }`.
5. Executor creates worktree, runs 3 steps sequentially, streams progress.
6. On completion, SSE emits `build_completed` with telemetry.

---

## 8. Boundaries / What's Out of Scope

### In scope for canonical form
- The five-stage lifecycle and its two paths (skill / forge)
- Approval gate mechanics
- Worktree lifecycle (create before, destroy after)
- SSE streaming and JSON polling
- Telemetry accumulation

### Out of scope
- Board.json integration (Volva dispatches are independent)
- Step-worker involvement (executor calls runtime directly)
- Persistent storage (dispatchStore is in-memory only)
- Retry logic at the dispatch level (runtime-level retries are separate)
- ACP transport (future; payloads unchanged)

---

## Closing Line

> **One Volva dispatch is not "run a task" -- it's "validate intent, build a plan, execute in isolation, stream results, clean up." The brain sends structured intent; the hands execute in a disposable worktree.**
