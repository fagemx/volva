# Völva → Karvi Integration — Overview

> Status: `working draft`
>
> Purpose: Define how Karvi receives and executes work dispatched by Völva — skill execution, forge builds, and the protocol that connects them.
>
> Perspective: Written from Völva's side, for Karvi to implement.

---

## 1. One-Liner

> **Karvi is Völva's execution engine. Völva decides WHAT to build; Karvi decides HOW to build it.**

---

## 2. What This Is NOT

### Not a Karvi internal redesign
This spec defines the **integration surface** — what Karvi must accept from Völva. It does NOT restructure Karvi's kernel, step-worker, or board.json internals.

### Not an ACP spec
ACP (Vision 14) is the transport layer. This spec defines the **payload protocol** on top of whatever transport is used. When ACP arrives, these payloads ride on ACP sessions. Before ACP, they ride on HTTP POST.

### Not Thyra governance
Thyra owns runtime permissions, verification, and judgment for live worlds. This spec covers Völva → Karvi dispatch, not Thyra → Karvi governance.

### Not a universal agent protocol
This is specifically for Völva's two dispatch scenarios: skill execution and forge builds. Other Karvi consumers (OpenClaw, IDE, CLI) use different entry points.

---

## 3. Core Concepts

### Two Dispatch Scenarios

| Scenario | Source | Trigger | Payload | Karvi does |
|----------|--------|---------|---------|-----------|
| **Skill Dispatch** | plan-deepskill | `skill.dispatch.mode: karvi` | `SkillDispatchRequest` | Load skill environment, run agent, collect telemetry |
| **Forge Build** | plan-world-design | Probe-commit → CommitMemo → forge handoff | `ForgeBuildRequest` | Translate CommitMemo to pipeline, run multi-step build |

### Integration Timeline

```text
v0 (now):     Völva executes locally. Karvi not involved.
              Both plans use dispatch.mode: local.

v1 (ACP-ready): Völva dispatches to Karvi via HTTP.
                Karvi adds /api/volva/dispatch-skill and /api/volva/forge-build.

v2 (ACP):     Transport switches to ACP session/prompt.
              Payloads unchanged — only transport changes.
```

---

## 4. Canonical Flow

### Skill Dispatch Flow

```text
Völva                           Karvi
─────                           ─────
Container Router
  → Skill container selected
  → registry.findMatching()
  → skill.dispatch.mode === 'karvi'
  │
  ├── POST /api/volva/dispatch-skill ──→ Validate SkillDispatchRequest
  │                                       │
  │                                       ├── Load skill content (SKILL.md)
  │                                       ├── Apply dispatch overlay (timeout, retry, worker)
  │                                       ├── Build dispatch plan
  │                                       ├── Execute via step-worker
  │                                       │     └── runtime (claude/opencode/codex)
  │                                       │
  │   ◄── SSE progress events ───────────┤
  │                                       │
  │   ◄── Final result + telemetry ──────┘
  │
  ├── Record telemetry (run_count, success_count)
  └── Return result to user
```

### Forge Build Flow

```text
Völva                           Karvi
─────                           ─────
Decision Pipeline
  → probe-commit → verdict: commit
  → buildCommitMemo()
  → translateToSettlement()
  │
  ├── POST /api/volva/forge-build ──→ Validate ForgeBuildRequest
  │                                     │
  │                                     ├── Translate CommitMemo to pipeline steps
  │                                     ├── Create worktree
  │                                     ├── Execute pipeline (multi-step)
  │                                     │     step 1: plan
  │                                     │     step 2: implement
  │                                     │     step 3: review
  │                                     │
  │   ◄── SSE progress events ─────────┤
  │                                     │
  │   ◄── Final result (PR/artifacts)──┘
  │
  └── Return result to user
```

---

## 5. Position in the Overall System

```text
┌─────────┐    dispatch     ┌─────────┐    governance    ┌─────────┐
│  Völva  │ ──────────────→ │  Karvi  │ ←─────────────── │  Thyra  │
│ (brain) │ skill/forge req │ (hands) │ runtime overlay   │ (rules) │
└─────────┘                 └─────────┘                   └─────────┘
     │                           │                             │
     └─── decision events ──→ Edda ←── precedent records ────┘
```

### Adjacent Specs

| Spec | Repo | Relationship |
|------|------|-------------|
| `volva/docs/deepskill/skill-object-v0.md` | Völva | Defines the `dispatch` section that drives Skill Dispatch |
| `volva/docs/deepskill/four-plane-ownership-v0.md` | Völva | Karvi owns `dispatch.*` overlay |
| `volva/docs/world-design-v0/forge-handoff-v0.md` | Völva | Defines CommitMemo that drives Forge Build |
| `volva/docs/plan-deepskill/` | Völva | Engineering plan for skill dispatch (Track F2 routes) |
| `volva/docs/plan-world-design/` | Völva | Engineering plan for forge handoff (Track F2) |
| `karvi/server/docs/vision/14-acp-agent-protocol.md` | Karvi | ACP transport (future carrier for these payloads) |
| `karvi/server/docs/vision/15-layer8-containment-governance.md` | Karvi | Permission/context containers align with skill `environment.permissions` |

---

## 6. Boundaries / Out of Scope

- **Karvi internal pipeline/step-worker changes** — this spec defines what Karvi receives, not how it internally processes it
- **ACP protocol details** — see Vision 14
- **Thyra runtime overlay enforcement** — Thyra-side concern
- **Edda event recording** — Völva-side concern (fires events after receiving Karvi results)
- **Non-Völva dispatch** — CLI dispatch, IDE dispatch, OpenClaw dispatch are separate

---

## Closing Line

> **Völva sends structured intent (skill object or CommitMemo). Karvi translates it into executable work. The protocol between them is the contract that lets the brain trust the hands.**
