# Deep Skill Architecture — README

> Status: `working draft`
>
> This spec stack defines the **skill layer** of the Völva / Karvi / Thyra / Edda system:
> what a governable skill object is, how skills are routed, how they evolve, and who owns what.

---

## Files

| File | Core Question |
|------|---------------|
| `skill-object-v0.md` | What is a governable skill object? (schema, 12 sections: 10 required + 2 auto-managed) |
| `container-routing-v0.md` | How does Völva select which container to route a request into? |
| `skill-lifecycle-v0.md` | How does a skill go from ad-hoc pattern to promoted capability? |
| `four-plane-ownership-v0.md` | Which plane (Völva/Karvi/Thyra/Edda) owns which fields? |
| `volva-interaction-model-v0.md` | What does the user see vs what runs behind? |

## Reading Order

1. `volva-interaction-model-v0.md` — start with the user experience (3 interaction layers, 4 postures, Forge sub-phase)
2. `container-routing-v0.md` — how requests find the right container (6 containers, 3 routing axes, posture mapping)
3. `skill-object-v0.md` — what's inside a skill (12 sections, status/stage/maturity distinction)
4. `skill-lifecycle-v0.md` — how skills evolve (8 stages, stage↔status mapping, promotion gates with telemetry)
5. `four-plane-ownership-v0.md` — who owns what (ownership map, overlay merge rules, implementation gap)

## Key Terminology

| Term | Meaning | Defined in |
|------|---------|-----------|
| **Interaction Layer** | UX surface: Conversation / Execution / Control | `volva-interaction-model-v0.md` |
| **Ownership Plane** | System data owner: Völva / Karvi / Thyra / Edda | `four-plane-ownership-v0.md` |
| **Container** | Internal work environment: World / Shape / Skill / Task / Review / Harvest | `container-routing-v0.md` |
| **Posture** | User-facing intent: Open a world / Help me think / Just do it / Capture this method | `volva-interaction-model-v0.md` |
| **Forge** | Build sub-phase within World container (post-commit, pre-settlement) | `volva-interaction-model-v0.md` |
| **Promotion status** | Deployment readiness: draft / sandbox / promoted / core / deprecated / superseded | `skill-object-v0.md` |
| **Lifecycle stage** | Development flow position: capture through govern (8 stages) | `skill-lifecycle-v0.md` |
| **Method maturity** | How proven the approach is: emerging / stable / core | `skill-object-v0.md` |

## Raw Sources

The `raw/` subfolder contains the original GPT discussion transcripts these specs were extracted from. They are kept for reference but are NOT authoritative — the spec files above are.

## Relationship to Other Spec Stacks

- `docs/world-design-v0/` — defines the **pre-world decision pipeline** (intent routing, path check, space building, probe/commit) and the **type definitions** for the canonical cycle (WorldMode, Verdict, PulseFrame, etc.). The behavioral spec for the canonical cycle runtime belongs to Thyra. This stack defines the **skill layer** that sits alongside the decision pipeline.
- `docs/storage/` — defines how decision state is stored, promoted, and tracked across layers. This stack defines **what skills are**; storage defines **where skill state lives**. The `routeDecision` field in storage references Forge sub-phase (see `volva-interaction-model-v0.md` Section 8).
