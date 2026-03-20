# Völva Integration API — Karvi Endpoints

> Status: `working draft`
>
> Purpose: Define the HTTP endpoints Karvi exposes for Völva to dispatch skills and forge builds.
>
> Shared types: see `./shared-types.md`

---

## 1. One-Liner

> **Two endpoints, two scenarios. `/dispatch-skill` for known capabilities, `/forge-build` for committed decisions.**

---

## 2. What It's NOT

### Not a replacement for existing Karvi APIs
`/api/tasks`, `/api/projects`, `/api/executions` continue to work for CLI dispatch and board management. The Völva endpoints are additive.

### Not an ACP interface
These are HTTP POST endpoints. When ACP arrives (Vision 14), Völva will switch to ACP `session/prompt` carrying the same payloads. The endpoints may become ACP bridge entry points.

### Not for human users
These endpoints receive structured JSON from Völva's route layer, not human-typed commands. No conversational parsing.

---

## 3. Route Map

```text
/api/volva/
├── dispatch-skill     POST   Execute a skill via Karvi
├── forge-build        POST   Build deliverables from CommitMemo
├── status/:id         GET    Check dispatch/build status
└── cancel/:id         POST   Cancel in-progress dispatch/build
```

---

## 4. Endpoints

### POST /api/volva/dispatch-skill

Execute a Völva skill via Karvi's step-worker.

**Request**: `SkillDispatchRequest` (see `skill-dispatch-protocol-v0.md` §3)

**Response** (sync = false, returns immediately):
```json
{
  "ok": true,
  "data": {
    "dispatchId": "disp_abc123",
    "status": "queued",
    "estimatedDurationSec": 600
  }
}
```

**Response** (sync = true, waits for completion):
```json
{
  "ok": true,
  "data": {
    "dispatchId": "disp_abc123",
    "result": { /* SkillDispatchResult */ }
  }
}
```

**Error responses**:
```json
{ "ok": false, "error": { "code": "APPROVAL_REQUIRED", "message": "Skill requires human approval before dispatch" } }
{ "ok": false, "error": { "code": "INVALID_SKILL", "message": "Skill content not found: deploy-service" } }
{ "ok": false, "error": { "code": "PERMISSION_DENIED", "message": "Skill requires process.spawn but Karvi config disallows it" } }
```

**Validation rules**:
- Request must pass `SkillDispatchRequestSchema.safeParse()`
- `skillContent` must be non-empty (Völva sends SKILL.md content directly)
- If `approval.requireHumanBeforeDispatch === true` AND no `approvalToken` → return `APPROVAL_REQUIRED` with `pendingApprovalId`
- If `approvalToken` present → validate it matches the pending request
- `executionMode: destructive` requires additional validation (future: Thyra gate)
- Karvi may override `dispatch.targetSelection.runtimeOptions` based on its own availability

**Approval flow**: see `shared-types.md` §3.5 for the full re-submission protocol.

---

### POST /api/volva/forge-build

Execute a forge build from CommitMemo.

**Request**: `ForgeBuildRequest` (see `forge-pipeline-protocol-v0.md` §3)

**Response** (returns immediately, streams progress via SSE):
```json
{
  "ok": true,
  "data": {
    "buildId": "build_def456",
    "status": "queued",
    "pipeline": "forge-economic",
    "steps": 3
  }
}
```

**SSE stream** (on `/api/volva/status/:id?stream=true`):
```
event: step_started
data: {"stepId":"plan","type":"plan"}

event: step_completed
data: {"stepId":"plan","type":"plan","status":"success"}

event: step_started
data: {"stepId":"implement","type":"implement"}

event: build_completed
data: {"buildId":"build_def456","result":{/* ForgeBuildResult */}}
```

**Error responses**:
```json
{ "ok": false, "error": { "code": "UNKNOWN_REGIME", "message": "No forge template for regime: identity" } }
{ "ok": false, "error": { "code": "EMPTY_BUILD", "message": "whatToBuild is empty" } }
```

---

### GET /api/volva/status/:id

Check status of a dispatch or build.

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": "disp_abc123",
    "type": "skill-dispatch",
    "status": "running",
    "currentStep": "implement",
    "progress": {
      "stepsCompleted": 1,
      "stepsTotal": 3
    },
    "startedAt": "2026-03-19T10:00:00Z",
    "elapsedMs": 45000
  }
}
```

Query param `?stream=true` → SSE stream instead of JSON snapshot.

**SSE event types**: see `shared-types.md` §3.3 for the full event schema (`step_started`, `step_completed`, `progress`, `dispatch_completed`, `build_completed`, `error`).

---

### POST /api/volva/cancel/:id

Cancel an in-progress dispatch or build.

**Response**:
```json
{
  "ok": true,
  "data": {
    "id": "disp_abc123",
    "status": "cancelled",
    "stepsCompleted": 1,
    "stepsAborted": 2
  }
}
```

---

## 5. Resource Graph

```text
SkillDispatch
├─ has one SkillDispatchRequest (input)
├─ has one SkillDispatchResult (output)
├─ has many StepResults
└─ has one TelemetryReport

ForgeBuild
├─ has one ForgeBuildRequest (input)
├─ has one ForgeBuildResult (output)
├─ has many StepResults
├─ has many Artifacts
└─ has one TelemetryReport
```

---

## 6. Authentication & Authorization (v1 placeholder)

v0: No auth — Völva and Karvi run on the same machine, localhost only.

v1 considerations:
- Shared secret token in `Authorization: Bearer <token>` header
- `executionMode: destructive` skills may require Thyra pre-approval
- Per-skill budget limits enforced by Karvi (from Thyra constitution)

---

## 7. Boundaries / Out of Scope

- **SSE event format details** — follows existing Karvi SSE patterns
- **Worktree management** — Karvi internal concern
- **Runtime selection** — Karvi maps `workerClass` to runtime internally
- **Board.json integration** — Karvi may or may not track Völva dispatches on the board

---

## Closing Line

> **Two endpoints. Structured input. Structured output. No ambiguity about what to build or how to report back.**
