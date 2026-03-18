# volva-interaction-model-v0.md

> Status: `working draft`
>
> Purpose: Define what Völva's user-facing interaction looks like — the **front stage** that hides the complexity of containers, dispatch, and governance.
>
> This file does NOT cover:
> - Internal container routing logic (see `container-routing-v0.md`)
> - Skill object structure (see `skill-object-v0.md`)

---

## 1. One-Liner

> **Völva's front stage is a single continuous agent. The back stage is a routable, dispatchable, governable work system.**

---

## 2. What It's NOT

### Not a multi-agent chat UI
Users don't see 8 agents competing. They see ONE main agent that understands, routes, translates, and reports.

### Not a feature menu
Users don't pick "Village Pack" or "intent-router" or "Skill container." Those are internal. Users pick **postures**.

### Not just a chatbot
The main agent is not only conversational. It's a **steward** that understands work state, selects containers, dispatches to back-stage workers, and brings results back in human language.

---

## 3. Three Interaction Layers

> **Terminology note:** These three "layers" describe the UX surface — what the user sees, what runs behind, and how the user intervenes. They are distinct from the four ownership **planes** (Völva/Karvi/Thyra/Edda) defined in `four-plane-ownership-v0.md`, which describe system-level data ownership.

```text
┌─────────────────────────┐
│   Conversation Layer    │ ← user talks to ONE main agent
│   (front stage)         │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│   Execution Layer       │ ← skills, tasks, workers, dispatch, runtime
│   (back stage)          │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│   Control Layer         │ ← monitor, pause, cancel, approve, reroute
│   (side stage)          │
└─────────────────────────┘
```

### Conversation Layer
What the user interacts with:
- Receive requests
- Understand intent
- Select work posture
- Report milestones
- Translate results to human language

### Execution Layer
What actually does the work:
- Skills, tasks, review workers
- Karvi dispatch
- Thyra runtime constraints
- Edda precedent recording

### Control Layer
How the user (or system) intervenes:
- View progress
- Pause / resume
- Cancel
- Approve next step
- Reroute

Control signals are structured control operations, not free-form chat. However, the user CAN trigger them via natural language to the main agent (e.g., "show me progress", "stop that"). The main agent translates these into structured control signals before forwarding to the Execution Layer.

---

## 4. Four User Postures

Users don't see 6 containers. They see 4 postures:

| Posture | User says | Back-stage container |
|---------|-----------|---------------------|
| **Open a world** | "Start a long-term project" / "Build me a workspace" | World |
| **Help me think** | "I have a direction but don't know how" / "Don't rush to tasks" | Shape / Review |
| **Just do it** | "Deploy this" / "Fix that" / "Run this review" | Skill / Task |
| **Capture this method** | "That workflow was good, save it" / "Make this reusable" | Harvest |

### Mapping to containers and internal posture signals

```text
Open a world    → World container         (via persistence axis, no posture signal)
Help me think   → Shape container         (internal posture: explore)
                  or Review container      (internal posture: inspect — when user wants to investigate)
Just do it      → Skill container          (internal posture: act — if matching skill exists)
                  or Task container        (internal posture: act — if no skill exists)
Capture method  → Harvest container       (internal posture: harvest)
```

> "Open a world" is the only posture that bypasses the internal posture signal. The routing protocol (see `container-routing-v0.md` Section 4) detects it via the persistence axis (Gate 1) before evaluating posture. For "Help me think", the main agent determines whether the user is exploring (→ Shape) or investigating (→ Review) based on conversational context.

---

## 5. Four Interaction Modes

| Mode | What's happening | User experience |
|------|-----------------|-----------------|
| **Chat** | Discussing, exploring, clarifying | Main agent listens, asks, suggests posture |
| **Work** | Container activated, back-stage running | Main agent reports: "Started X, next step Y, need your approval for Z" |
| **Watch** | User wants progress, not conversation | Timeline / board / status view (not chat bubbles) |
| **Control** | User intervenes | Pause, cancel, approve, reroute — structured signals |

---

## 6. Main Agent Is Not an Orchestrator

The main agent is a **steward / editor / liaison**, not a task dispatcher:

| Steward does | Orchestrator does (NOT this) |
|-------------|------------------------------|
| Understands what you're really trying to do | Blindly routes to the right function |
| Maintains conversational continuity | Drops context between dispatch calls |
| Translates back-stage results to human language | Dumps raw logs |
| Helps you switch between explore / execute / harvest | Forces you to pick a mode upfront |
| Knows when to ask vs when to just proceed | Always asks or never asks |

---

## 7. Canonical Examples

### Example A: Explore → Execute → Harvest journey

```text
User: "I want to make money with video generation"

[Chat mode]
Main agent: routes to Shape container (intent = economic, path unclear)
→ path-check: medium certainty
→ space-builder generates candidates

[Work mode]
Main agent: "I've identified 3 candidates. The strongest is workflow-install service."
→ probe-commit: DM 10 studios, landing page test
→ signal: 3 replies, 1 willing to talk pricing

[Chat mode]
Main agent: "Buyer signal exists. Ready to commit to Forge?"
User: "Yes"

[Work mode]
→ Forge builds: intake flow, install checklist, case showcase

[Harvest]
Main agent: "This workflow worked well. Want me to capture it as a reusable skill?"
User: "Yes"
→ Harvest: crystallize into skill.workflow-install-service
```

### Example B: Control intervention

```text
[Work mode — deploy running]
Main agent: "Staging deploy complete. Smoke tests: 18/18 pass. Requesting prod approval."

User: "Wait, I saw latency spike in the dashboard. Hold off."

[Control mode]
→ Pause signal sent to Karvi dispatch
→ Main agent: "Prod rollout paused. Want me to investigate the latency spike?"

User: "Yes"
→ Container transition: Skill (deploy) → Review (investigation)
```

---

## 8. Forge: The Build Sub-Phase

**Forge** is the post-commit build organ in the Völva pipeline. It receives a `CommitMemo` from probe-commit and builds the concrete deliverables.

### Where Forge lives

Forge is **not a standalone container**. It activates as a sub-phase within an existing container context:

| Context | Forge activates when |
|---------|---------------------|
| **World container** (governance regime) | Space-building → commit → Forge builds world instantiation deliverables |
| **Shape container** (any regime) | Intent routing → space-building → probe-commit → Forge builds the committed realization |
| **Task container** (forge-fast-path) | Path already fixed, commit immediate → Forge builds directly |

```text
Common flow (inside Shape or World container):
  space-building → probe-commit → [user commits] → Forge → [deliverables ready] → settlement

Fast-path (inside Task-like flow):
  path-check → forge-fast-path → Forge → settlement
```

### What Forge does
- Receives a `CommitMemo` (from probe-commit layer, see `docs/world-design-v0/shared-types.md` §5.5)
- Builds the concrete deliverables specified in `whatForgeShouldBuild`
- Respects `whatForgeMustNotBuild` constraints
- Operates in **Work mode** — the main agent reports progress, not asks questions
- May dispatch sub-tasks to Karvi workers

### What Forge is NOT
- Not a separate container (it's a sub-phase within Shape, World, or Task)
- Not accessible without a prior commit decision (no `CommitMemo` = no Forge)
- Not a general "build things" mode — it builds what was committed in probe-commit, per the specific regime's evaluator output

### Route decision mapping (from `docs/storage/volva-working-state-schema-v0.md`)

| `routeDecision` | Meaning |
|-----------------|---------|
| `space-builder` | Stay in space-building, path still uncertain |
| `space-builder-then-forge` | Space-building first, then Forge once committed |
| `forge-fast-path` | Path already clear, skip space-building, enter Forge directly |

### Relationship to world-design-v0 pipeline

Forge sits at position 5 in the world-design-v0 pipeline:

```text
intent-router → path-check → space-builder → probe-commit → **Forge** → thyra (if governance)
                                                           → settlement (if non-governance)
```

See `docs/world-design-v0/intent-router-and-space-builder.md` Section 4 for the full pipeline.

---

## 9. Boundaries / Out of Scope

- This spec defines the **user-facing model**. Internal routing logic is in `container-routing-v0.md`.
- This spec does NOT define the Workboard / Control Panel UI. That's a future product spec. Watch mode's "timeline / board / status view" is the conceptual target; actual UI is deferred.
- This spec does NOT define how the main agent selects containers. That's the routing protocol.

### v1 Scope

| Component | v1 status |
|-----------|-----------|
| Main agent (1 steward) | Fully implemented |
| World container | Fully implemented |
| Shape container | Fully implemented |
| Skill container | Fully implemented |
| Task container | Fully implemented |
| Review container | Semi-manual: main agent can switch to review posture, but no dedicated review worker |
| Harvest container | Semi-manual: crystallization triggered by user, Völva assists but no auto-detection |
| Watch mode | Deferred: no dedicated UI, status reported via Chat mode |
| Control mode | Partial: pause/cancel via main agent, no structured control panel |

---

## Closing Line

> **Users should feel like they're working with one intelligent steward. Behind the scenes, that steward is routing to containers, dispatching to workers, enforcing governance, and accumulating precedent — but the user only sees: "I said what I wanted, and it's being handled."**
