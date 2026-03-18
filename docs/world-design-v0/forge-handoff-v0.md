# forge-handoff-v0.md

> Status: `working draft`
>
> Purpose: Define what Forge receives, what it produces, and how it differs by regime.
>
> Forge is the post-commit build organ. It sits between probe-commit and settlement/Thyra.

---

## 1. One-Liner

> **Forge builds what was committed. It receives a CommitMemo, not user chat. It produces deliverables, not ideas.**

---

## 2. Input: CommitMemo

Forge's only input is a `CommitMemo` (see `shared-types.md` §5.5):

```ts
type CommitMemo = {
  candidateId: string;
  regime: Regime;
  verdict: "commit";           // Forge only receives committed candidates

  rationale: string[];
  evidenceUsed: string[];
  unresolvedRisks: string[];

  whatForgeShouldBuild: string[];
  whatForgeMustNotBuild: string[];

  recommendedNextStep: string[];
};
```

**Critical constraint:** Forge does NOT read the original user message. It works from the CommitMemo only. This prevents premature engineering from vague user intent.

---

## 3. What Forge Produces (by regime)

| Regime | Forge output | Settlement target |
|--------|-------------|-------------------|
| **economic** | Service intake flow, pricing page, fulfillment checklist, case showcase | Karvi pipeline or standalone |
| **capability** | Practice loop structure, curriculum, progress tracker | Standalone or workflow |
| **leverage** | Automation pipeline, operator model, workflow pack | Karvi pipeline |
| **expression** | Production pipeline, asset templates, style guide | Standalone |
| **governance** | World spec, constitution draft, chief draft, minimum world config | Thyra (village pack) |
| **identity** | Staged path plan, transition milestones, probe schedule | Standalone |

---

## 4. Forge does NOT

- Generate new candidates (that's space-builder)
- Evaluate whether to commit (that's probe-commit)
- Run the live world (that's Thyra)
- Create probes (that's probe-commit shell)

---

## 5. Forge exits to

| If governance regime | → Thyra (via settlement, village pack) |
|---------------------|---------------------------------------|
| If other regimes | → Settlement (via appropriate builder: workflow, task, pipeline, etc.) |
| If deliverable needs dispatch | → Karvi (via pipeline registration) |

---

## 6. Boundaries

- Forge has no spec for its internal build logic yet — it's a **pass-through** in v0 that translates CommitMemo into settlement-ready payloads.
- The detailed "how Forge builds" spec is deferred until the pipeline from intent-router through probe-commit is implemented.
- For v0, Forge can be approximated by the existing settlement builders (`village-pack-builder.ts`, `workflow-spec-builder.ts`, etc.) receiving enriched input from CommitMemo.
