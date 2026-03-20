# Forge Pipeline Protocol — How Karvi Builds From CommitMemo

> Status: `working draft`
>
> Purpose: Define how Karvi receives a CommitMemo from Völva's decision pipeline and translates it into a multi-step build pipeline.
>
> Shared types: see `./shared-types.md`

---

## 1. One-Liner

> **A ForgeBuildRequest carries a committed decision (CommitMemo) and asks Karvi to build the deliverables — not the user's original words, but the decision pipeline's structured output.**

---

## 2. What It's NOT

### Not a skill dispatch
Skill dispatch executes a known, reusable skill. Forge builds are one-off: they translate a specific CommitMemo into project-specific deliverables. No SKILL.md is loaded.

### Not a raw task
Karvi's existing task dispatch (`POST /api/tasks`) takes human-written instructions. Forge builds take structured `whatForgeShouldBuild` / `whatForgeMustNotBuild` arrays — the decision pipeline already did the thinking.

### Not a Thyra world instantiation
Governance regime forge builds produce village pack payloads, but Karvi doesn't send them to Thyra. Karvi builds the artifacts; Völva sends them to Thyra via settlement.

---

## 3. Core Definition

### What Karvi receives

> Canonical definition: see `./shared-types.md` §2.2

Key additions over the earlier draft:
- `verdict: 'commit'` — explicit confirmation this is a committed decision
- `evidenceUsed` + `unresolvedRisks` — from CommitMemo base fields
- `EconomicForgeContext` now carries `paymentEvidence`, `whyThisVehicleNow`, `nextSignalAfterBuild`
- `GovernanceForgeContext` now carries `stateDensityAssessment`, `governancePressureAssessment`, `thyraHandoffRequirements`, and `worldForm` is typed as `WorldForm` enum (not `string`)

### What Karvi returns

> Canonical definition: see `./shared-types.md` §2.3

Key points:
- `steps: StepResult[]` — each step includes `artifacts: string[]` (from shared StepResult §3.1)
- `telemetry: TelemetryReport` — all fields required (runtime, model, stepsExecuted)
```

---

## 4. Canonical Flow

```text
Völva                                   Karvi
─────                                   ─────
Decision Pipeline
  → CommitMemo (verdict: commit)
  → translateToSettlement()
  → ForgeBuildRequest assembled
        │
        ├──→ POST /api/volva/forge-build
        │         │
        │         ├── Validate ForgeBuildRequest (Zod)
        │         ├── Select pipeline template by regime:
        │         │     economic → 'forge-economic' template
        │         │     governance → 'forge-governance' template
        │         ├── Inject whatToBuild into step instructions
        │         ├── Inject whatNotToBuild as constraints
        │         ├── Create worktree
        │         └── Execute pipeline
        │              │
        │              ├── step 1: plan (agent reads CommitMemo context)
        │              ├── step 2: implement (agent builds deliverables)
        │              └── step 3: review (agent checks against whatNotToBuild)
        │              │
        │   ◄──── SSE progress events ────┤
        │   ◄──── ForgeBuildResult ───────┘
        │
  → Return artifacts to user
  → If governance: send village pack to Thyra via settlement
```

### Pipeline Templates (Karvi-side)

```javascript
// New built-in templates for forge builds
const FORGE_TEMPLATES = {
  'forge-economic': {
    steps: [
      { type: 'plan', instruction: 'Read CommitMemo context. Plan deliverables from whatToBuild list.' },
      { type: 'implement', instruction: 'Build each item in whatToBuild. Respect whatNotToBuild constraints.' },
      { type: 'review', instruction: 'Verify deliverables match CommitMemo. Check no whatNotToBuild violations.' },
    ],
  },
  'forge-governance': {
    steps: [
      { type: 'plan', instruction: 'Read CommitMemo + minimumWorldShape. Design village pack structure.' },
      { type: 'implement', instruction: 'Generate village YAML, constitution draft, chief config.' },
      { type: 'review', instruction: 'Validate village pack against firstCycleDesign requirements.' },
    ],
  },
};
```

---

## 5. Canonical Examples

### Example A: Economic Regime — Build Service Intake

```json
// POST /api/volva/forge-build
{
  "sessionId": "ds_abc123",
  "candidateId": "cand_xyz789",
  "regime": "economic",
  "whatToBuild": [
    "Landing page with service description",
    "Intake form for client requests",
    "Install checklist for first delivery"
  ],
  "whatNotToBuild": [
    "Full SaaS platform",
    "Payment processing integration",
    "Client dashboard"
  ],
  "rationale": ["Buyer signal confirmed: 3/10 studios responded, 1 willing to pay"],
  "regimeContext": {
    "kind": "economic",
    "buyerHypothesis": "Video production studios need workflow installation help",
    "painHypothesis": "Studios waste 4+ hours/project on manual AI pipeline setup",
    "vehicleType": "productized_service"
  },
  "context": {
    "workingDir": "/repos/workflow-install-service",
    "targetRepo": "org/workflow-install-service"
  }
}
```

### Example B: Governance Regime — Build Village Pack

```json
{
  "sessionId": "ds_def456",
  "candidateId": "cand_gov001",
  "regime": "governance",
  "whatToBuild": [
    "Village YAML with market world form",
    "Constitution with stall capacity rules",
    "Chief config for market operator"
  ],
  "whatNotToBuild": [
    "Full multi-zone market",
    "Payment system",
    "Real-time pricing engine"
  ],
  "rationale": ["World density assessment: high. Governance pressure: medium."],
  "regimeContext": {
    "kind": "governance",
    "worldForm": "market",
    "minimumWorldShape": ["3 stalls", "1 spotlight zone", "entry throttle"],
    "firstCycleDesign": ["observe traffic", "propose stall adjustment", "judge by capacity rule"]
  },
  "context": {
    "targetRepo": "org/midnight-market"
  }
}
```

---

## 6. Boundaries / Out of Scope

- **Pipeline template design** — Karvi decides its internal step structure. This spec defines what goes IN, not how Karvi internally processes it.
- **Thyra settlement** — Völva sends forge output to Thyra. Karvi just builds artifacts.
- **Probe execution** — Probes (from plan-world-design Track E) are NOT forge builds. Probes are external actions (DM people, test landing pages). Karvi doesn't run probes.
- **Budget enforcement** — Karvi reports cost. Völva/Thyra enforce budgets.

---

## Closing Line

> **Forge doesn't build what the user asked for. It builds what the decision pipeline committed to. The CommitMemo is the contract between thinking and building.**
