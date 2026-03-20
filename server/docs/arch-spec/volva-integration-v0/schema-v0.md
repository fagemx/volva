# schema-v0.md

> Status: `working draft`
>
> Purpose: What are the first-class data structures in the Volva integration layer?
>
> Shared types: see `./shared-types.md`

---

## 1. One-Liner

> **The Volva schema is an in-memory dispatch store, two plan types, an approval state, a set of error codes, and SSE event envelopes -- all stateless, all disposable, nothing persisted to disk.**

---

## 2. What It's NOT / Most Common Mistakes

1. **Not persisted state.** Unlike autopilot's RunSnapshot, the Volva dispatch store is an in-memory `Map`. Server restart loses all active dispatches. This is intentional -- Volva dispatches are short-lived and the caller (Volva) tracks its own state.

2. **Not board.json structures.** Volva plans and entries share no fields with board tasks, step objects, or task-log entries. They are a parallel execution path.

3. **Not request schemas.** The request payloads (`SkillDispatchRequest`, `ForgeBuildRequest`) are documented in `shared-types.md` and validated by `validators.js`. This file documents the *internal* structures produced after validation.

---

## 3. Core Definition -- Data Structures

### 3.1 DispatchEntry (in-memory store object)

The central state atom. One entry per active dispatch or build. Stored in `dispatchStore` Map, keyed by `id`.

```typescript
type DispatchEntry = {
  id: string;                    // 'disp_<uuid-prefix>' or 'build_<uuid>'
  type: 'skill-dispatch' | 'forge-build' | 'pending-approval';
  status: 'queued' | 'running' | 'completed' | 'failed';
  request: SkillDispatchRequest | ForgeBuildRequest;  // original validated request
  plan: SkillDispatchPlan | ForgeBuildPlan | null;     // null for pending-approval
  result: DispatchResult | null;
  startedAt: string;             // ISO 8601 timestamp
  progress: {
    stepsCompleted: number;      // 0..stepsTotal
    stepsTotal: number;          // 3 for skill-dispatch, plan.steps.length for forge
    currentStep: number | null;  // 1-based index during execution, null before start
  };
  sseClients: ServerResponse[];  // active SSE connections (mutable array)
};
```

Source: `routes/volva.js` lines 101-111 (skill-dispatch), lines 142-153 (forge-build).

### 3.2 DispatchResult

The terminal output attached to `entry.result` after execution completes.

```typescript
// Success
type DispatchResultSuccess = {
  stepResults: StepResult[];
  telemetry: Telemetry;
};

// Failure
type DispatchResultFailure = {
  error: string;
  stepResults?: StepResult[];  // partial results if failure occurred mid-execution
};

type StepResult = {
  stepId: string;       // e.g., 'my-skill_plan', 'economic_implement'
  type: string;         // 'plan' | 'implement' | 'review' | 'execute'
  replyText: string;    // runtime's text output
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalCost?: number;
  } | null;
};

type Telemetry = {
  totalTokens: number;
  totalCost: number;
  runtime: string;       // runtimeHint value
  model: string;         // same as runtime (v0)
  stepsExecuted: number;
};
```

Source: `executor.js` lines 96-101 (StepResult), lines 108-114 (Telemetry), line 117 (success), line 124 (failure).

### 3.3 PendingApproval (approval.js state)

Stored in `pendingApprovals` Map, keyed by approval ID.

```typescript
type PendingApproval = {
  skillId: string;
  skillName: string;
  createdAt: number;    // Date.now() epoch ms -- NOT ISO string
};
```

TTL: 30 minutes from `createdAt`. Consumed (deleted) on successful validation. Expired entries cleaned by `clearExpiredApprovals()`.

Source: `approval.js` lines 18-25.

### 3.4 SkillDispatchPlan

Output of `buildSkillDispatchPlan()`. The internal execution plan for skill dispatches.

```typescript
type SkillDispatchPlan = {
  kind: 'volva_skill_dispatch';
  planId: string;              // 'disp_<uuid-8char>'

  // Identity
  skillId: string;
  skillName: string;
  skillVersion: string;

  // Content
  skillContent: string;        // full SKILL.md content, passed through

  // Execution
  runtimeHint: string;         // selected runtime name
  runtimeSelection: {
    runtime: string;
    rationale: string;         // explains why this runtime was chosen
  };
  message: string;             // context.userMessage
  workingDir: string | null;   // context.workingDir or null
  inputs: object;              // context.inputs key-value map

  // Worker
  requiredSkills: string[];    // from SKILL_ROLE_MAP
  codexRole: string;           // 'worker' | 'reviewer' | 'researcher' | 'planner'

  // Policy
  timeoutSec: number;          // executionPolicy.timeoutMinutes * 60
  retryCount: number;          // executionPolicy.retries
  sync: boolean;               // executionPolicy.sync
  escalationOnFailure: boolean;

  // Artifacts
  upstreamArtifacts: string[];  // handoff.inputArtifacts
  expectedOutputs: string[];    // handoff.outputArtifacts

  // Environment metadata
  executionMode: string;        // 'advisory' | 'assistive' | 'active' | 'destructive'
  externalSideEffects: boolean;
  permissions: {
    filesystem: { read: boolean; write: boolean };
    network: { read: boolean; write: boolean };
    process: { spawn: boolean };
    secrets: { read: string[] };
  };

  // Verification
  smokeChecks: string[];
  assertions: string[];

  // Timestamps
  createdAt: string;           // ISO 8601
};
```

Source: `skill-dispatch.js` lines 80-124.

### 3.5 ForgeBuildPlan

Output of `buildForgePipeline()`. The internal execution plan for forge builds.

```typescript
type ForgeBuildPlan = {
  kind: 'volva_forge_build';
  version: 1;
  buildId: string;             // 'build_<uuid>'
  sessionId: string;           // from request
  candidateId: string;         // from request
  regime: string;              // 'economic' | 'governance'
  pipeline: string;            // 'forge-economic' | 'forge-governance'
  steps: ForgeStep[];
  workingDir: string | null;   // context.workingDir or null
  targetRepo: string | null;   // context.targetRepo or null
  createdAt: string;           // ISO 8601
};

type ForgeStep = {
  stepId: string;              // '<regime>_<type>' e.g., 'economic_plan'
  type: 'plan' | 'implement' | 'review';
  group: number;               // 0, 1, 2 (sequential execution order)
  instruction: string;         // template-filled instruction text
};
```

Source: `forge-pipeline.js` lines 278-300.

### 3.6 SkillStep (generated by buildSkillSteps)

```typescript
type SkillStep = {
  stepId: string;              // '<skillName>_<type>' e.g., 'my-skill_plan'
  type: 'plan' | 'implement' | 'review';
  group: number;               // 0, 1, 2
  instruction: string;         // assembled by injectSkillContent()
  timeoutSec: number;          // from plan.timeoutSec or default 1200
};
```

Source: `skill-dispatch.js` lines 165-174.

### 3.7 ERROR_CODES enum

```typescript
const ERROR_CODES = {
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',   // 403 — need human approval
  APPROVAL_INVALID: 'APPROVAL_INVALID',     // 403 — token expired/consumed
  INVALID_SKILL: 'INVALID_SKILL',           // 400 — skill not found/invalid
  PERMISSION_DENIED: 'PERMISSION_DENIED',   // 403 — insufficient permissions
  UNKNOWN_REGIME: 'UNKNOWN_REGIME',         // 400 — no forge template for regime
  EMPTY_BUILD: 'EMPTY_BUILD',              // 400 — whatToBuild is empty
  NOT_FOUND: 'NOT_FOUND',                  // 404 — dispatch/build ID not found
  ALREADY_CANCELLED: 'ALREADY_CANCELLED',   // 409 — dispatch already cancelled
  VALIDATION_ERROR: 'VALIDATION_ERROR',     // 400 — request schema validation failed
};
```

Source: `response.js` lines 8-18.

### 3.8 Validator Enums

```typescript
const EXECUTION_MODES = ['advisory', 'assistive', 'active', 'destructive'];
const REGIMES = ['economic', 'capability', 'leverage', 'expression', 'governance', 'identity'];
const WORLD_FORMS = ['market', 'commons', 'town', 'port', 'night_engine', 'managed_knowledge_field'];
const DENSITY_LEVELS = ['low', 'medium', 'high'];
```

Source: `validators.js` lines 13-16.

Note: Only `economic` and `governance` have forge templates. The other regimes (`capability`, `leverage`, `expression`, `identity`) pass validation but fail at template resolution with `UNKNOWN_REGIME`.

---

## 4. Canonical Form -- Entity Relationship

```text
SkillDispatchRequest ──validates──→ SkillDispatchPlan ──stored in──→ DispatchEntry
                                        │                                │
                                        └── generates ──→ SkillStep[]    │
                                                                         │
ForgeBuildRequest ──validates──→ ForgeBuildPlan ──stored in──→ DispatchEntry
                                     │                            │
                                     └── contains ──→ ForgeStep[] │
                                                                  │
                                                    DispatchEntry ──produces──→ DispatchResult
                                                         │                         │
                                                         ├── sseClients[]          ├── stepResults[]
                                                         └── progress{}            └── telemetry{}

PendingApproval (separate Map)
  └── created when APPROVAL_REQUIRED
  └── consumed when approvalToken validated
  └── expires after APPROVAL_TTL_MS (30 min)
```

---

## 5. SSE Event Envelope Format

All SSE events follow the standard format:

```text
event: <event_name>
data: <JSON payload>

```

### Event types emitted by executor

| Event | Payload | When |
|-------|---------|------|
| `step_started` | `{ id, stepId, type, step, total }` | Before each step dispatches |
| `progress` | `{ id, stepId, step, total }` | On runtime activity callback |
| `step_completed` | `{ id, stepId, type, step, total }` | After each step finishes |
| `dispatch_completed` | `{ id, telemetry }` | All steps succeeded (skill-dispatch) |
| `build_completed` | `{ id, telemetry }` | All steps succeeded (forge-build) |
| `error` | `{ id, error }` | Fatal error during execution |

### Heartbeat (not a named event)

```text
: heartbeat

```

Sent every 30 seconds. Uses SSE comment format (colon prefix), not `event:`.

Source: `executor.js` lines 22-26 (emitSSE), `routes/volva.js` line 59 (heartbeat).

---

## 6. Status Snapshot Response Format

`GET /api/volva/status/<id>` returns:

```typescript
// Success envelope
{
  ok: true,
  data: {
    id: string;
    type: 'skill-dispatch' | 'forge-build';
    status: 'queued' | 'running' | 'completed' | 'failed';
    currentStep: number | null;
    progress: {
      stepsCompleted: number;
      stepsTotal: number;
      currentStep: number | null;
    };
    startedAt: string;          // ISO 8601
    elapsedMs: number;          // wall-clock ms since startedAt
    result?: DispatchResult;    // present only when status is terminal
  }
}

// Not found
{
  ok: false,
  error: { code: 'NOT_FOUND', message: 'ID not found: <id>' }
}
```

Source: `routes/volva.js` lines 70-81.

---

## 7. ID Generation Patterns

| Entity | Prefix | Generator | Example |
|--------|--------|-----------|---------|
| Skill dispatch | `disp_` | `'disp_' + randomUUID().slice(0, 8)` | `disp_a1b2c3d4` |
| Forge build | `build_` | `'build_' + crypto.randomUUID()` | `build_550e8400-e29b-41d4-a715-446655440000` |
| Approval | `appr_` | `'appr_' + crypto.randomUUID()` | `appr_550e8400-e29b-41d4-a715-446655440000` |

Note: Skill dispatch IDs use truncated UUIDs (8 chars). Forge build and approval IDs use full UUIDs. This inconsistency exists in the implementation.

Source: `skill-dispatch.js` line 82, `response.js` lines 63-75, `approval.js` line 19.

---

## 8. Canonical Examples

### Example 1: DispatchEntry after skill-dispatch queued

```json
{
  "id": "disp_a1b2c3d4",
  "type": "skill-dispatch",
  "status": "queued",
  "request": { "skillId": "deploy-k8s", "skillName": "deploy-k8s", "..." : "..." },
  "plan": {
    "kind": "volva_skill_dispatch",
    "planId": "disp_a1b2c3d4",
    "skillId": "deploy-k8s",
    "runtimeHint": "claude",
    "runtimeSelection": { "runtime": "claude", "rationale": "matched: claude (first available from options)" },
    "timeoutSec": 1200,
    "createdAt": "2026-03-19T10:00:00Z"
  },
  "result": null,
  "startedAt": "2026-03-19T10:00:00Z",
  "progress": { "stepsCompleted": 0, "stepsTotal": 3, "currentStep": null },
  "sseClients": []
}
```

### Example 2: DispatchEntry after forge-build completed

```json
{
  "id": "build_550e8400-e29b-41d4-a715-446655440000",
  "type": "forge-build",
  "status": "completed",
  "request": { "sessionId": "sess-1", "regime": "economic", "..." : "..." },
  "plan": {
    "kind": "volva_forge_build",
    "version": 1,
    "buildId": "build_550e8400-e29b-41d4-a715-446655440000",
    "regime": "economic",
    "pipeline": "forge-economic",
    "steps": [
      { "stepId": "economic_plan", "type": "plan", "group": 0, "instruction": "## Forge Plan ..." },
      { "stepId": "economic_implement", "type": "implement", "group": 1, "instruction": "## Forge Implement ..." },
      { "stepId": "economic_review", "type": "review", "group": 2, "instruction": "## Forge Review ..." }
    ]
  },
  "result": {
    "stepResults": [
      { "stepId": "economic_plan", "type": "plan", "replyText": "...", "usage": { "inputTokens": 500, "outputTokens": 200, "totalCost": 0.003 } },
      { "stepId": "economic_implement", "type": "implement", "replyText": "...", "usage": { "inputTokens": 800, "outputTokens": 1500, "totalCost": 0.01 } },
      { "stepId": "economic_review", "type": "review", "replyText": "...", "usage": { "inputTokens": 600, "outputTokens": 300, "totalCost": 0.004 } }
    ],
    "telemetry": {
      "totalTokens": 3900,
      "totalCost": 0.017,
      "runtime": "claude",
      "model": "claude",
      "stepsExecuted": 3
    }
  },
  "startedAt": "2026-03-19T10:00:00Z",
  "progress": { "stepsCompleted": 3, "stepsTotal": 3, "currentStep": 3 },
  "sseClients": []
}
```

---

## 9. Boundaries / What's Out of Scope

### In scope
- All internal data structures with field types
- ERROR_CODES enum with HTTP status mapping
- SSE event envelope format
- Status snapshot response format
- ID generation patterns
- Entity relationships

### Out of scope
- Request payload schemas (see `shared-types.md` and `validators.js`)
- Persistent storage (all in-memory in v0)
- Board.json schema (unrelated to Volva)
- Runtime adapter response formats (opaque to Volva layer)

---

## Closing Line

> **The schema is a Map, two plan types, and an event stream -- because Volva dispatches are ephemeral by design: execute, collect, discard.**
