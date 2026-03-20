# shared-types.md — Völva↔Karvi Integration Types

> Status: `canonical`
>
> Rule: When other files in this spec stack reference types, reference this file — don't redefine.
>
> Wire format: JSON over HTTP. Field names use camelCase.

---

## 1. Skill Dispatch Types

### 1.1 SkillDispatchRequest

```typescript
type SkillDispatchRequest = {
  skillId: string;
  skillName: string;
  skillVersion: string;

  // Skill content — Völva sends SKILL.md content directly because skill packages
  // live in Völva's repo, not Karvi's. Karvi does NOT read from Völva's filesystem.
  skillContent: string;           // full SKILL.md text

  environment: SkillEnvironment;
  dispatch: SkillDispatch;
  verification: SkillVerification;
  context: DispatchContext;
};

type SkillEnvironment = {
  toolsRequired: string[];
  toolsOptional: string[];
  permissions: SkillPermissions;
  externalSideEffects: boolean;
  executionMode: 'advisory' | 'assistive' | 'active' | 'destructive';
};

type SkillPermissions = {
  filesystem: { read: boolean; write: boolean };
  network: { read: boolean; write: boolean };
  process: { spawn: boolean };
  secrets: { read: string[] };    // secret NAMES, not values
};

type SkillDispatch = {
  // Target selection — tells Karvi which runtimes are acceptable
  targetSelection: {
    repoPolicy: string;          // "explicit" | "any"
    runtimeOptions: string[];    // ["claude", "opencode", "codex"] — Karvi picks from this list
  };

  workerClass: string[];          // ["implementation", "verification", "ops"]

  // Handoff artifacts — what this skill needs as input and produces as output
  handoff: {
    inputArtifacts: string[];     // e.g., ["pr_url_from_prior_skill"]
    outputArtifacts: string[];    // e.g., ["deploy_url", "smoke_test_report"]
  };

  executionPolicy: {
    sync: boolean;
    retries: number;
    timeoutMinutes: number;
    escalationOnFailure: boolean;
  };
  approval: {
    requireHumanBeforeDispatch: boolean;
    requireHumanBeforeMerge: boolean;
  };
};

type SkillVerification = {
  smokeChecks: string[];
  assertions: string[];
  humanCheckpoints: string[];
  outcomeSignals: string[];
};

type DispatchContext = {
  conversationId?: string;
  userMessage: string;
  workingDir?: string;
  inputs: Record<string, string>;
};
```

> **Ownership note:** Völva sends `dispatch.*` fields as a **merged view** (Völva base + Karvi overlay already applied).
> Per four-plane-ownership-v0.md, Karvi is the authoritative owner of `dispatch.*`.
> In practice: Völva's skill.object.yaml has defaults; Karvi's dispatch.yaml overrides them;
> Völva runs `mergeSkillObject()` before dispatch and sends the merged result.
> Karvi may further override `runtimeOptions` or `timeoutMinutes` based on its own load/capacity.

### 1.2 SkillDispatchResult

```typescript
type SkillDispatchResult = {
  skillId: string;
  status: 'success' | 'failure' | 'partial' | 'cancelled';
  durationMs: number;
  steps: StepResult[];
  outputs: Record<string, string>;
  verification: {
    smokeChecksPassed: boolean;
    failedChecks: string[];
  };
  telemetry: TelemetryReport;
};
```

---

## 2. Forge Build Types

### 2.1 Regime

```typescript
type Regime = 'economic' | 'capability' | 'leverage' | 'expression' | 'governance' | 'identity';
```

Note: matches `volva/docs/world-design-v0/shared-types.md` §1.1 exactly.

### 2.2 ForgeBuildRequest

```typescript
type ForgeBuildRequest = {
  // Source decision
  sessionId: string;
  candidateId: string;
  regime: Regime;
  verdict: 'commit';              // always 'commit' — forge only receives committed decisions

  // Build instructions (from CommitMemo)
  whatToBuild: string[];           // from commitMemo.whatForgeShouldBuild
  whatNotToBuild: string[];        // from commitMemo.whatForgeMustNotBuild
  rationale: string[];
  evidenceUsed: string[];          // from commitMemo.evidenceUsed
  unresolvedRisks: string[];       // from commitMemo.unresolvedRisks

  // Regime-specific context
  regimeContext: EconomicForgeContext | GovernanceForgeContext;

  // Execution context
  context: {
    workingDir?: string;
    targetRepo?: string;
  };
};

type EconomicForgeContext = {
  kind: 'economic';
  buyerHypothesis: string;
  painHypothesis: string;
  vehicleType: string;
  paymentEvidence: string[];       // from EconomicCommitMemo
  whyThisVehicleNow: string[];    // from EconomicCommitMemo
  nextSignalAfterBuild: string[]; // from EconomicCommitMemo — what to measure after build
};

type GovernanceForgeContext = {
  kind: 'governance';
  worldForm: WorldForm;            // typed enum, not string
  minimumWorldShape: string[];
  firstCycleDesign: string[];
  stateDensityAssessment: 'low' | 'medium' | 'high';
  governancePressureAssessment: 'low' | 'medium' | 'high';
  thyraHandoffRequirements: string[];  // what Thyra needs from this build output
};

type WorldForm = 'market' | 'commons' | 'town' | 'port' | 'night_engine' | 'managed_knowledge_field';
```

### 2.3 ForgeBuildResult

```typescript
type ForgeBuildResult = {
  sessionId: string;
  status: 'success' | 'failure' | 'partial';
  durationMs: number;
  artifacts: Artifact[];
  steps: StepResult[];            // uses shared StepResult (§3.1) — includes artifacts per step
  telemetry: TelemetryReport;
};

type Artifact = {
  type: 'file' | 'pr' | 'config' | 'spec';
  path: string;
  description: string;
};
```

---

## 3. Shared Sub-Types

### 3.1 StepResult

```typescript
type StepResult = {
  stepId: string;
  type: string;                   // "plan" | "implement" | "review" | custom
  status: 'success' | 'failure' | 'skipped';
  artifacts: string[];            // always present (empty array if none)
};
```

### 3.2 TelemetryReport

```typescript
type TelemetryReport = {
  tokensUsed: number;
  costUsd: number;
  runtime: string;                // which agent runtime was used (always populated by Karvi)
  model: string;                  // which model was used (always populated by Karvi)
  stepsExecuted: number;          // how many steps were run
};
```

> **Telemetry mapping:** Karvi's `TelemetryReport` feeds Völva's per-skill telemetry tracking:
> - `TelemetryReport` returned per execution → Völva calls `recordRun()` with outcome + durationMs
> - Völva updates `skill_instances.run_count`, `success_count`, `last_used_at` from the result
> - Token/cost data stored in `skill_runs` for per-run analysis
> - Karvi does NOT update Völva's telemetry — it only reports. Völva consumes.

### 3.3 SSE Event Types

Progress events streamed via `GET /api/volva/status/:id?stream=true`:

```typescript
type SSEEvent =
  | { event: 'step_started'; data: { stepId: string; type: string } }
  | { event: 'step_completed'; data: StepResult }
  | { event: 'progress'; data: { stepsCompleted: number; stepsTotal: number; currentStep: string } }
  | { event: 'dispatch_completed'; data: SkillDispatchResult }
  | { event: 'build_completed'; data: ForgeBuildResult }
  | { event: 'error'; data: { code: string; message: string } };
```

Format: standard SSE (`event:` + `data:` lines, newline-delimited).

### 3.4 API Response Envelope

All endpoints use this envelope:

```typescript
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

Error codes:
| Code | When |
|------|------|
| `APPROVAL_REQUIRED` | Skill requires human approval before dispatch |
| `APPROVAL_INVALID` | Re-submitted approval token is invalid or expired |
| `INVALID_SKILL` | skillContent is empty or malformed |
| `PERMISSION_DENIED` | Skill permissions exceed Karvi's allowed scope |
| `UNKNOWN_REGIME` | No forge template for the given regime |
| `EMPTY_BUILD` | whatToBuild is empty |
| `NOT_FOUND` | Dispatch/build ID not found |
| `ALREADY_CANCELLED` | Attempting to cancel an already-cancelled dispatch |
| `VALIDATION_ERROR` | Request body failed Zod schema validation |

### 3.5 Approval Flow

When `approval.requireHumanBeforeDispatch === true`:

```text
1. Völva sends SkillDispatchRequest to Karvi
2. Karvi returns { ok: false, error: { code: "APPROVAL_REQUIRED", message: "..." } }
   with a `pendingApprovalId` in the error details
3. Völva presents approval request to user (showing skill name, permissions, side effects)
4. User approves → Völva re-submits the same request with added field:
   `approvalToken: { pendingId: string; approvedBy: string; approvedAt: string }`
5. Karvi validates the token matches the pending request → proceeds with execution
6. If user denies → Völva does not re-submit. Dispatch ends.
```

```typescript
// Added to SkillDispatchRequest when re-submitting after approval
type ApprovalToken = {
  pendingId: string;              // from APPROVAL_REQUIRED error
  approvedBy: string;             // user id or "human"
  approvedAt: string;             // ISO timestamp
};

// Extended SkillDispatchRequest
type SkillDispatchRequest = {
  // ... all existing fields ...
  approvalToken?: ApprovalToken;  // present only on re-submission after approval
};
```

---

## 4. Cross-Reference to Völva Types

| This spec's type | Völva source | Relationship |
|-----------------|-------------|-------------|
| `SkillDispatchRequest.skillContent` | Völva reads `skills/<id>/SKILL.md` and sends as string | Content transfer (Karvi doesn't access Völva's filesystem) |
| `SkillDispatchRequest.environment` | `skill-object-v0.md` environment section | Direct mapping |
| `SkillDispatchRequest.dispatch` | `skill-object-v0.md` dispatch section (merged view) | Völva merges base + Karvi overlay before sending |
| `SkillDispatchRequest.dispatch.targetSelection` | `skill-object-v0.md` dispatch.targetSelection | Direct mapping |
| `SkillDispatchRequest.dispatch.handoff` | `skill-object-v0.md` dispatch.handoff | Direct mapping |
| `SkillDispatchRequest.verification` | `skill-object-v0.md` verification section | Direct mapping |
| `ForgeBuildRequest.regime` | `world-design-v0/shared-types.md` Regime | Same 6-value enum |
| `ForgeBuildRequest.whatToBuild` | `CommitMemo.whatForgeShouldBuild` | Renamed for clarity |
| `ForgeBuildRequest.evidenceUsed` | `CommitMemo.evidenceUsed` | Direct mapping |
| `ForgeBuildRequest.unresolvedRisks` | `CommitMemo.unresolvedRisks` | Direct mapping |
| `EconomicForgeContext` | `EconomicCommitMemo` | Full extraction (all 5 fields) |
| `GovernanceForgeContext` | `GovernanceCommitMemo` | Full extraction (all 6 fields) |
| `TelemetryReport` | `skill-object-v0.md` telemetry section | Karvi produces per-run, Völva consumes for lifecycle tracking |

---

## 5. Völva KarviClient Changes Required

Current `KarviClient` (volva/src/karvi-client/client.ts) needs these additions:

```typescript
// New methods
async dispatchSkill(req: SkillDispatchRequest): Promise<SkillDispatchResult>
async forgeBuild(req: ForgeBuildRequest): Promise<ForgeBuildResult>
async getDispatchStatus(id: string): Promise<DispatchStatus>
async cancelDispatch(id: string): Promise<CancelResult>

// New types in volva/src/karvi-client/schemas.ts
SkillDispatchRequestSchema    // Zod schema for request validation
SkillDispatchResultSchema     // Zod schema for response validation
ForgeBuildRequestSchema
ForgeBuildResultSchema
DispatchStatusSchema
```

These are NOT implemented yet. They will be added when `dispatch.mode: karvi` goes live (v1).
