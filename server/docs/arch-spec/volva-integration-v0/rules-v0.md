# rules-v0.md

> Status: `working draft`
>
> Purpose: What invariants and decision rules govern Volva dispatch behavior?
>
> Shared types: see `./shared-types.md`

---

## 1. One-Liner

> **Fifteen rules extracted from the actual implementation -- covering approval gates, runtime selection, plan construction, worktree lifecycle, telemetry, SSE streaming, and error handling.**

---

## 2. What It's NOT / Most Common Mistakes

1. **Not configurable policy.** Unlike issue-autopilot where rules are driven by an ExecutionContract, most Volva rules are hard-coded in the implementation. The caller controls behavior through the request shape (e.g., `requireHumanBeforeDispatch`), not through a separate policy object.

2. **Not board-level rules.** Volva dispatches bypass board.json entirely. These rules govern the Volva subsystem only -- they have no effect on kernel dispatch, step-worker, or board task lifecycle.

3. **Not aspirational.** Every rule below has a direct code reference. If it's not in the code, it's not listed here.

---

## 3. Core Definition -- Rules by Category

### Category 1: Approval Rules

**R1: Approval gate.**
If `dispatch.approval.requireHumanBeforeDispatch` is `true` AND no `approvalToken` is present in the request, the dispatch is rejected with `APPROVAL_REQUIRED` (HTTP 403). A `pendingApprovalId` is returned for the caller to obtain human approval.
Source: `routes/volva.js` line 91.

**R2: Approval token TTL.**
Pending approvals expire after 30 minutes (`APPROVAL_TTL_MS = 30 * 60 * 1000`). Expired tokens are rejected with "Approval token has expired" and deleted from the store.
Source: `approval.js` line 11, line 44.

**R3: Approval one-time use.**
A valid approval token is consumed (deleted from `pendingApprovals` Map) upon successful validation. The same token cannot be reused for a second dispatch.
Source: `approval.js` line 50.

### Category 2: Runtime Selection Rules

**R4: Runtime selection -- first match.**
`selectRuntime()` iterates the request's `runtimeOptions` array in order and picks the first one that exists in `availableRuntimes`. Selection rationale is recorded: `"matched: <name> (first available from options)"`.
Source: `skill-dispatch.js` lines 36-43.

**R5: Runtime fallback.**
If none of the requested runtimes are available, falls back to `availableRuntimes[0]` or `'opencode'` if the available list is empty. Rationale recorded: `"fallback: <name> (none of [...] available)"`.
Source: `skill-dispatch.js` line 42.

**R6: Worker class resolution.**
`resolveWorkerClass()` iterates the `workerClass` array and returns the first match from `SKILL_ROLE_MAP`. If no match, defaults to `{ skills: [], codexRole: 'worker' }`. The SKILL_ROLE_MAP maps: `implementation` -> worker/coding-agent, `verification` -> reviewer/review-agent, `ops` -> worker/ops-agent, `review` -> reviewer/review-agent, `research` -> researcher/research-agent, `planning` -> planner/planning-agent.
Source: `skill-dispatch.js` lines 21-28, 52-58.

### Category 3: Plan Construction Rules

**R7: Forge regime validation.**
`buildForgePipeline()` resolves a template by `forge-<regime>`. If no template exists for the given regime, returns `{ ok: false, code: 'UNKNOWN_REGIME' }`. Currently supported regimes: `economic`, `governance`.
Source: `forge-pipeline.js` lines 266-273.

**R8: Empty build rejection.**
If `whatToBuild` is empty or missing, `buildForgePipeline()` returns `{ ok: false, code: 'EMPTY_BUILD' }` before attempting template resolution.
Source: `forge-pipeline.js` lines 258-264.

**R9: Constraint injection.**
The `implement` step in every forge template includes both `whatToBuild` AND `whatNotToBuild` as non-negotiable constraints. The review step verifies NO deliverable matches any item in `whatNotToBuild`. This enforces the decision pipeline's boundary -- the executor cannot exceed the scope approved by Volva.
Source: `forge-pipeline.js` implement/review template instructions (lines 48-56, 70-78 for economic; lines 124-134, 153-160 for governance).

### Category 4: Execution Rules

**R10: Worktree lifecycle.**
Every dispatch creates a worktree named `volva-<entryId>` before step execution. The worktree is always cleaned up in a `finally` block (best-effort; failure is non-fatal). All step execution runs inside the worktree path.
Source: `executor.js` lines 60-69 (create), lines 127-128 (cleanup).

**R11: Telemetry capture.**
Telemetry is always populated on completion, even if values are zero. Fields: `totalTokens` (sum of input + output across all steps), `totalCost` (sum of `totalCost` from usage), `runtime` (plan's runtimeHint), `model` (same as runtime), `stepsExecuted` (count of steps run).
Source: `executor.js` lines 108-114.

### Category 5: SSE and Response Rules

**R12: SSE heartbeat.**
SSE connections receive a heartbeat comment (`: heartbeat\n\n`) every 30 seconds. If the write fails, the heartbeat interval is cleared and the client is removed from the entry's `sseClients` array.
Source: `routes/volva.js` lines 58-61.

**R13: SSE client cleanup.**
On client disconnect (`req.on('close')`), the heartbeat interval is cleared and the client's response object is filtered out of `entry.sseClients`.
Source: `routes/volva.js` lines 62-65.

**R14: Error envelope format.**
All responses use a standard envelope: `{ ok: true, data: {...} }` for success, `{ ok: false, error: { code, message } }` for failure. The `approvalRequiredResponse` variant adds a `pendingApprovalId` field inside the error object.
Source: `response.js` lines 36-55.

**R15: HTTP status mapping.**
Error codes map to HTTP statuses as follows:

| Error Code | HTTP Status |
|-----------|-------------|
| `APPROVAL_REQUIRED` | 403 |
| `APPROVAL_INVALID` | 403 |
| `INVALID_SKILL` | 400 |
| `PERMISSION_DENIED` | 403 |
| `UNKNOWN_REGIME` | 400 |
| `EMPTY_BUILD` | 400 |
| `NOT_FOUND` | 404 |
| `ALREADY_CANCELLED` | 409 |
| `VALIDATION_ERROR` | 400 |
| (unknown code) | 500 |

Source: `response.js` lines 23-33, line 84.

---

## 4. Canonical Form -- Rule Evaluation Order

```text
Per-request rule evaluation:

1. VALIDATE (validators.js)
   └── fail → 400 VALIDATION_ERROR

2. APPROVAL GATE (skill-dispatch only)
   a. requireHumanBeforeDispatch? (R1)
      └── no token → 403 APPROVAL_REQUIRED + pendingId
   b. token present → validateApprovalToken (R2, R3)
      └── expired/invalid → 403 APPROVAL_INVALID

3. BUILD PLAN
   ┌── skill path:
   │   a. selectRuntime (R4, R5)
   │   b. resolveWorkerClass (R6)
   │   c. assemble SkillDispatchPlan
   │
   └── forge path:
       a. Empty build check (R8)
       b. Regime template lookup (R7)
       c. Fill template with constraints (R9)
       d. Assemble ForgeBuildPlan

4. EXECUTE (async, after 200 response)
   a. Create worktree (R10)
      └── fail → entry.status = 'failed'
   b. For each step:
      └── runtime.dispatch() → accumulate telemetry (R11)
   c. Cleanup worktree (R10 — finally block)

5. STREAM (concurrent with execute)
   a. SSE heartbeat every 30s (R12)
   b. Client disconnect cleanup (R13)
   c. Response envelope format (R14, R15)
```

---

## 5. Hard-Coded Constants (v0)

```javascript
const RULES = {
  APPROVAL_TTL_MS: 30 * 60 * 1000,      // R2: 30 minutes
  SSE_HEARTBEAT_MS: 30_000,             // R12: 30 seconds
  DEFAULT_TIMEOUT_SEC: 1200,            // step timeout if not specified (20 min)
  DEFAULT_RUNTIMES: ['claude', 'opencode', 'codex'],  // R5: default available list
  FALLBACK_RUNTIME: 'opencode',         // R5: last-resort fallback
  FALLBACK_CODEX_ROLE: 'worker',        // R6: default when no workerClass matches
};
```

---

## 6. Position in the Overall System

Rules sit between the request and the execution:

```text
Volva Request (structured intent)
      │
      ▼
Validation rules (R1-R3, R7-R9)     ← reject bad input / enforce gates
      │
      ▼
Selection rules (R4-R6)             ← pick runtime + worker profile
      │
      ▼
Execution rules (R10-R11)           ← worktree + telemetry invariants
      │
      ▼
Response rules (R12-R15)            ← SSE + envelope format
```

See `./canonical-form.md` for the five-stage lifecycle.
See `./schema-v0.md` for the data structures.

---

## 7. Canonical Examples

### Example 1: Approval flow

Request: `requireHumanBeforeDispatch: true`, no token.

- R1 fires: return 403 + `pendingApprovalId: "appr_abc123"`.
- 20 minutes later: caller re-submits with `approvalToken: { pendingId: "appr_abc123", approvedBy: "alice", approvedAt: "..." }`.
- R2: TTL check passes (20 min < 30 min).
- R3: Token consumed, deleted from `pendingApprovals`. Dispatch proceeds.
- If caller tried the same token again: R3 would fail ("invalid or expired").

### Example 2: Runtime fallback

Request: `runtimeOptions: ["codex", "anthropic"]`. Available runtimes: `["opencode", "claude"]`.

- R4: Check `codex` -> not available. Check `anthropic` -> not available.
- R5: Fallback to `availableRuntimes[0]` = `"opencode"`.
- Rationale recorded: `"fallback: opencode (none of [codex, anthropic] available)"`.

### Example 3: Forge build rejection

Request: `regime: "military"`, `whatToBuild: ["missile silo"]`.

- R8: `whatToBuild` is non-empty, passes.
- R7: No template for `forge-military`. Returns `{ ok: false, code: 'UNKNOWN_REGIME' }`.
- HTTP 400 returned.

---

## 8. Boundaries / What's Out of Scope

### In scope
- All 15 rules with code references
- Rule evaluation order per request
- Hard-coded constants
- Approval token lifecycle

### Out of scope
- Configurable rule policies (v0 is hard-coded)
- Retry logic at the dispatch level (handled by caller)
- Cost-based limits (telemetry is captured but not enforced)
- Rate limiting (not implemented in v0)
- Runtime-level timeout enforcement (delegated to runtime adapter)

---

## Closing Line

> **Fifteen rules, all traceable to source lines -- because a dispatch protocol you can't audit is just a black box with extra steps.**
