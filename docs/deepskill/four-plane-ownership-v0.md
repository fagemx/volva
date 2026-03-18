# four-plane-ownership-v0.md

> Status: `working draft`
>
> Purpose: Define which plane (Völva / Karvi / Thyra / Edda) owns which fields of the skill object — preventing multi-truth-source chaos.
>
> Core rule: **Every field has exactly one canonical owner. Others can read, propose, or record — but not overwrite.**

---

## 1. One-Liner

> **A skill is a federated object: Völva defines its meaning, Karvi defines its dispatch, Thyra defines its runtime, Edda defines its history.**

---

## 2. What It's NOT

### Not four copies of the same object
Each plane holds only its slice. Not replicated, not mirrored.

### Not a single repo monolith
Putting everything in one repo mixes meaning, dispatch, and runtime. They'll drift.

### Not optional
Without clear ownership, you get: trigger changed but dispatch doesn't know, permissions changed but skill def didn't reflect, gotcha confirmed but not written back.

---

## 3. Four Planes

| Plane | Owns | Source of truth for |
|-------|------|-------------------|
| **Völva** | Core definition | What this skill IS, when to trigger, what's in the package |
| **Karvi** | Dispatch overlay | How to send to workers, which repo/runtime, retry/timeout |
| **Thyra** | Runtime overlay | Permissions, guardrails, verification, judgment, outcome schema |
| **Edda** | History/precedent | What happened, what worked, what failed, supersession chain |

---

## 4. Ownership Map

### A. Identity / Meaning — **Völva owns**

| Field | Owner | Others |
|-------|-------|--------|
| `id`, `name`, `version` | Völva | all read |
| `summary`, `domain`, `tags` | Völva | all read |
| `owners.human`, `owners.agent` | Völva | Edda records transfers |
| `status`, `maturity`, `riskTier` | Völva | Edda records changes |

### B. Purpose / Routing — **Völva owns**

| Field | Owner | Others |
|-------|-------|--------|
| `purpose.problemShapes` | Völva | Karvi/Thyra read |
| `purpose.desiredOutcomes` | Völva | Thyra reads for verification |
| `purpose.nonGoals`, `notFor` | Völva | all read; Thyra/Karvi may propose additions |
| `routing.triggerWhen` | Völva | all read; Thyra/Karvi may propose |
| `routing.doNotTriggerWhen` | Völva | all read; Edda may surface false-trigger precedent |
| `routing.conflictsWith`, `mayChainTo` | Völva | Karvi may propose |

### C. Contract / Package — **Völva owns**

| Field | Owner | Others |
|-------|-------|--------|
| `contract.inputs`, `outputs` | Völva | Karvi/Thyra read |
| `contract.successCriteria` | Völva | Thyra reads for verification |
| `contract.failureModes` | Völva | Edda may propose new ones from precedent |
| `package.*` (root, refs, scripts, assets) | Völva | all read |
| `gotchas` (current text) | Völva | Edda owns the confirmation history |

### D. Dispatch — **Karvi owns**

| Field | Owner | Others |
|-------|-------|--------|
| `dispatch.mode` | Karvi | all read |
| `dispatch.targetSelection.*` | Karvi | Thyra may constrain |
| `dispatch.workerClass` | Karvi | all read |
| `dispatch.handoff.*` | Karvi | Völva/Thyra may propose |
| `dispatch.executionPolicy.*` | Karvi | all read |
| `dispatch.approval.*` | Karvi | Thyra may require stricter gates |

### E. Runtime / Governance — **Thyra owns**

| Field | Owner | Others |
|-------|-------|--------|
| `environment.toolsRequired/Optional` | Thyra | Völva may propose |
| `environment.permissions` | Thyra | **always Edda-recorded** |
| `environment.externalSideEffects` | Thyra | **always Edda-recorded** |
| `environment.executionMode` | Thyra | all read |
| `verification.smokeChecks`, `assertions` | Thyra | Völva may propose |
| `verification.humanCheckpoints` | Thyra | **always Edda-recorded** |
| `verification.outcomeSignals` | Thyra | Edda reads for precedent |
| `governance.mutability.*` | Thyra | all read |

### F. History / Precedent — **Edda owns**

| Field | Owner | Others |
|-------|-------|--------|
| Promotion history | Edda | all read |
| `supersedes`, `supersededBy` | Edda | Völva mirrors current reference |
| Confirmed gotchas (history/evidence) | Edda | Völva owns current active text |
| Run outcomes | Edda | Thyra provides source events |
| False-trigger records | Edda | Völva reads to update routing |

### G. Telemetry — **split ownership**

| Field | Owner | Others |
|-------|-------|--------|
| `telemetry.track` | Karvi | Völva defines what to track; Karvi collects |
| `telemetry.thresholds` | Karvi | Thyra may enforce additional limits |
| `telemetry.reporting` | Edda | aggregate reporting from run history |

### H. Lifecycle / Memory — **split ownership**

| Field | Owner | Others |
|-------|-------|--------|
| `lifecycle.currentStage` | Völva | Edda records transitions |
| `lifecycle.promotionPath` | Völva | all read |
| `lifecycle.retirementCriteria` | Völva | all read |
| `lifecycle.createdFrom` | Völva | Edda records |
| `lifecycle.lastReviewedAt` | Edda | Völva reads |
| `memory.localMemoryPolicy.*` | Völva | all read |
| `memory.precedentWriteback.*` | Edda | Völva defines initial config; Edda owns runtime behavior |

---

## 5. Three Cardinal Rules

### Rule 1: Völva does not decide dispatch truth
It can say "this skill is probably suited for review workers" — but the actual dispatch config (repo, runtime, retry, timeout) belongs to Karvi.

### Rule 2: Völva does not decide runtime truth
It can say "this skill should be advisory" — but the actual permissions, guardrails, verification, and judgment rules belong to Thyra.

### Rule 3: Edda does not become a config store
Edda records what happened. It does NOT become the current configuration source. Current truth stays in Völva/Karvi/Thyra.

---

## 6. File Layout

```text
Völva repo:
  skills/<skill-id>/
    skill.object.yaml       ← canonical core (sections A-C, plus defaults for D-E)
    SKILL.md
    references/
    scripts/
    assets/

Karvi repo:
  bindings/skills/<skill-id>.dispatch.yaml    ← dispatch overlay (section D only)

Thyra repo:
  bindings/skills/<skill-id>.runtime.yaml     ← runtime overlay (section E only)

Edda:
  events (append-only):
    skill.created
    skill.patched
    skill.gotcha.confirmed
    skill.promoted
    skill.dispatched
    skill.run.succeeded
    skill.run.failed
    skill.rollback
    skill.superseded
```

### 6.1 Overlay Merge Rules

The skill object is federated across repos. When the system needs a complete skill view, overlays are merged:

```text
Merge order:
  1. Base:  skill.object.yaml (Völva canonical — all 12 sections)
  2. Apply: <skill-id>.dispatch.yaml (Karvi overlay — dispatch.* fields only)
  3. Apply: <skill-id>.runtime.yaml (Thyra overlay — environment.* + verification.* + governance.mutability.* fields only)
```

**Merge semantics:**
- **Field-level override:** overlay fields replace base fields at the leaf level (not deep merge)
- **Scope enforcement:** if an overlay contains fields outside its ownership scope, the merge MUST reject with an error. E.g., Karvi's `dispatch.yaml` cannot set `routing.triggerWhen`.
- **Missing overlay:** if a plane has no overlay file, base values are used as-is. This is the normal v0 case — most skills are `dispatch.mode: local` and don't need Karvi/Thyra overlays.
- **Merged view is read-only:** the merged skill object is a computed view for routing/execution. Changes go back to the owning plane's source file.

**Conflict resolution:**
- No cross-plane conflicts are possible if scope enforcement is correct
- Within a plane, the overlay is authoritative (newer file wins)
- If scope enforcement fails (bug), log the violation to Edda as `skill.merge.violation` event

---

## 7. Canonical Example: `arch-spec`

```text
Völva holds:
  id: skill.arch-spec
  purpose: architecture crystallization
  routing: trigger when fuzzy concept needs spec stack
  package: SKILL.md + references/ + examples/

Karvi holds:
  dispatch.mode: hybrid
  workerClass: [review, research]
  runtimeOptions: [codex, opencode]
  timeoutMinutes: 20

Thyra holds:
  executionMode: assistive
  externalSideEffects: false
  smokeChecks: [has-boundaries, has-non-goals]
  humanCheckpoints: [boundary-review, promotion-decision]
  guardrails: [do-not-collapse-into-task-list]

Edda records:
  skill.created (from recurring conversation pattern)
  skill.gotcha.confirmed ("agent tends to default to full stack")
  skill.run.succeeded (world-design-v0)
  skill.run.succeeded (storage stack)
```

---

## 8. Implementation Gap (v0)

The ownership model assumes each plane has APIs to read/write its slice. Current implementation status:

| Plane | Current API | Missing for full ownership |
|-------|------------|---------------------------|
| **Völva** | `skill.object.yaml` files in repo, `cards/` + `conductor/` code | Skill registry with trigger matching |
| **Karvi** | `KarviClient`: `registerPipeline`, `listPipelines`, `deletePipeline` (port 3463) | Skill dispatch binding API, worker assignment, approval flow, overlay read/write |
| **Thyra** | `ThyraClient`: `createSkill({name, type, description})`, `getSkills()` (port 3462) | Runtime overlay binding API, permissions enforcement, verification execution. Current `SkillData` is minimal — does not carry environment/verification/governance fields |
| **Edda** | `EddaClient`: `queryDecisions`, `getDecisionOutcomes` (port 3463) | Skill event recording API (the 9 event types listed in Section 6), precedent writeback, false-trigger recording |

> **Port note:** Karvi and Edda both default to `localhost:3463`. This is either intentional (co-located service) or a port conflict bug. Must be resolved before multi-service deployment.

### What this means for v0

- Most skills run `dispatch.mode: local` — Karvi/Thyra overlays are not needed yet
- Edda events are aspirational — v0 can log to local `decision_events` table (see `docs/storage/`)
- Thyra's `SkillData` CRUD works for basic registration but cannot enforce runtime constraints
- The full federated model activates incrementally as plane APIs are extended

---

## 9. Boundaries / Out of Scope

- This spec defines **field ownership**. The field definitions themselves are in `skill-object-v0.md`.
- v0 recommends a **"one main + three side" model**: main file in Völva, minimal overlays in Karvi/Thyra, events in Edda. Don't over-split in v0.

---

## Closing Line

> **Every field has one owner. If two planes both think they own a field, you have a drift bug waiting to happen.**
