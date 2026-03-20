# Skill Dispatch Protocol — How Karvi Receives and Executes Völva Skills

> Status: `working draft`
>
> Purpose: Define the request/response contract for Völva dispatching a skill to Karvi for execution.
>
> Shared types: see `./shared-types.md`

---

## 1. One-Liner

> **A SkillDispatchRequest carries everything Karvi needs to execute a skill — identity, environment, dispatch policy, and verification criteria — without Karvi needing to understand the skill's purpose.**

---

## 2. What It's NOT

### Not the full SkillObject
Völva's SkillObject has 12 sections. Karvi only needs 4: `identity` (who), `environment` (what tools/permissions), `dispatch` (how to run), `verification` (how to check). Purpose, routing, memory, governance stay in Völva.

### Not a raw CLI command
Karvi doesn't receive "run `bun test`". It receives a structured dispatch request with skill context, and its step-worker translates that into the right CLI invocations.

### Not a pipeline definition
A single skill dispatch is ONE execution. Pipelines (multi-step) are Forge builds (see `forge-pipeline-protocol-v0.md`). A skill dispatch may use Karvi's internal step pipeline (plan→implement→review) but that's Karvi's internal decision.

---

## 3. Core Definition

### What Karvi receives from Völva

> Canonical definition: see `./shared-types.md` §1.1

Key fields (see shared-types.md for full type):
- `skillContent: string` — Völva reads SKILL.md and sends full text (Karvi doesn't access Völva's filesystem)
- `dispatch.targetSelection.runtimeOptions` — which runtimes are acceptable
- `dispatch.handoff` — input/output artifact declarations
- `dispatch.approval` — human gate requirements
- `approvalToken?` — present only on re-submission after APPROVAL_REQUIRED
```

### What Karvi returns to Völva

> Canonical definition: see `./shared-types.md` §1.2

Key fields:
- `steps: StepResult[]` — each step includes `artifacts: string[]`
- `telemetry: TelemetryReport` — all fields required (runtime, model, stepsExecuted always populated)
- `verification.smokeChecksPassed` — did skill's smoke checks pass
```

---

## 4. Canonical Flow

```text
Völva                                   Karvi
─────                                   ─────
1. Build SkillDispatchRequest
   from SkillObject + user context
        │
        ├──→ POST /api/volva/dispatch-skill
        │         │
        │         ├── Validate request (Zod)
        │         ├── Check approval gate
        │         │   (if requireHumanBeforeDispatch → reject with APPROVAL_REQUIRED)
        │         ├── Map workerClass → runtime selection
        │         ├── Load SKILL.md content from skill package
        │         ├── Build internal dispatch plan
        │         ├── Create worktree (if needed)
        │         └── Execute via step-worker
        │              │
        │   ◄──── SSE: progress events ────┤
        │              │
        │   ◄──── SkillDispatchResult ─────┘
        │
2. Record telemetry
   (run_count++, outcome, duration)
3. Return to user
```

---

## 5. Schema Details

### SkillPermissions

```typescript
type SkillPermissions = {
  filesystem: { read: boolean; write: boolean };
  network: { read: boolean; write: boolean };
  process: { spawn: boolean };
  secrets: { read: string[] };      // secret names, NOT values
};
```

### Karvi's Internal Mapping

Karvi translates `SkillDispatchRequest` to its internal `DispatchPlan`:

| SkillDispatchRequest field | Karvi DispatchPlan field |
|---------------------------|------------------------|
| `context.userMessage` | `message` |
| `context.workingDir` | `workingDir` |
| `skillContent` | `skillContent` (injected directly into step instructions — no filesystem read needed) |
| `dispatch.targetSelection.runtimeOptions` | `runtimeHint` (Karvi picks best available from the list) |
| `dispatch.workerClass` | `requiredSkills` (maps to SKILL_ROLE_MAP) |
| `dispatch.handoff.inputArtifacts` | `upstreamArtifacts` (resolved before step execution) |
| `dispatch.executionPolicy.timeoutMinutes` | `timeoutSec` (× 60) |
| `dispatch.executionPolicy.retries` | `retryCount` |
| `environment.executionMode` | controls worktree isolation level |

---

## 6. Canonical Examples

### Example A: Deploy Service Skill

```json
// POST /api/volva/dispatch-skill
{
  "skillId": "skill.deploy-service",
  "skillName": "deploy-service",
  "skillVersion": "1.2.0",
  "environment": {
    "toolsRequired": ["git", "docker"],
    "toolsOptional": ["kubectl"],
    "permissions": {
      "filesystem": { "read": true, "write": true },
      "network": { "read": true, "write": true },
      "process": { "spawn": true },
      "secrets": { "read": ["DEPLOY_KEY", "REGISTRY_TOKEN"] }
    },
    "externalSideEffects": true,
    "executionMode": "active"
  },
  "dispatch": {
    "workerClass": ["implementation", "ops"],
    "executionPolicy": {
      "sync": false,
      "retries": 1,
      "timeoutMinutes": 20,
      "escalationOnFailure": true
    },
    "approval": {
      "requireHumanBeforeDispatch": false,
      "requireHumanBeforeMerge": true
    }
  },
  "verification": {
    "smokeChecks": ["staging-smoke-pass", "error-rate-within-threshold"],
    "assertions": [],
    "humanCheckpoints": ["prod-rollout-approval"],
    "outcomeSignals": ["deploy_url_reachable"]
  },
  "context": {
    "conversationId": "conv_abc123",
    "userMessage": "Deploy checkout-service to staging",
    "workingDir": "/repos/checkout-service",
    "inputs": {
      "service_name": "checkout-service",
      "artifact_ref": "v2.3.1",
      "target_env": "staging"
    }
  }
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "skillId": "skill.deploy-service",
    "status": "success",
    "durationMs": 342000,
    "steps": [
      { "stepId": "plan", "type": "plan", "status": "success", "artifacts": [] },
      { "stepId": "implement", "type": "implement", "status": "success", "artifacts": ["https://github.com/org/checkout-service/pull/89"] },
      { "stepId": "review", "type": "review", "status": "success", "artifacts": [] }
    ],
    "outputs": {
      "deploy_url": "https://staging.checkout.example.com",
      "deploy_status": "success"
    },
    "verification": {
      "smokeChecksPassed": true,
      "failedChecks": []
    },
    "telemetry": {
      "tokensUsed": 45200,
      "costUsd": 0.18,
      "runtime": "claude",
      "model": "claude-sonnet-4-5-20250514"
    }
  }
}
```

### Example B: Arch-Spec Skill (Advisory)

```json
{
  "skillId": "skill.arch-spec",
  "skillName": "arch-spec",
  "skillVersion": "0.3.0",
  "environment": {
    "toolsRequired": [],
    "toolsOptional": [],
    "permissions": {
      "filesystem": { "read": true, "write": true },
      "network": { "read": false, "write": false },
      "process": { "spawn": false },
      "secrets": { "read": [] }
    },
    "externalSideEffects": false,
    "executionMode": "assistive"
  },
  "dispatch": {
    "workerClass": ["review", "research"],
    "executionPolicy": {
      "sync": false,
      "retries": 0,
      "timeoutMinutes": 30,
      "escalationOnFailure": false
    },
    "approval": {
      "requireHumanBeforeDispatch": false,
      "requireHumanBeforeMerge": true
    }
  },
  "verification": {
    "smokeChecks": ["has-boundaries", "has-non-goals", "has-promotion-check"],
    "assertions": [],
    "humanCheckpoints": ["boundary-review", "promotion-decision"],
    "outcomeSignals": []
  },
  "context": {
    "userMessage": "Crystallize the settlement router concept",
    "inputs": {}
  }
}
```

---

## 7. Boundaries / Out of Scope

- **Skill discovery/matching** — Völva's registry handles this before dispatch
- **Skill lifecycle tracking** — Völva records telemetry after receiving results
- **Thyra overlay enforcement** — Thyra's runtime.yaml may restrict permissions further
- **ACP session management** — transport concern, not payload concern
- **Cost accounting** — Karvi reports cost; Völva/Thyra decide budget policy

---

## Closing Line

> **Karvi doesn't need to understand why a skill exists. It needs to understand how to run it safely, within the boundaries the skill object declares.**
