# Canonical Cycle — Scope Note

> Status: `scope note`

## What this spec stack defines

`world-design-v0/` defines the **pre-world decision pipeline** — everything that happens before a world is live:

1. **Intent routing** — classify terminal intent into 6 regimes
2. **Path check** — assess realization path certainty
3. **Space building** — expand + constrain realization candidates
4. **Probe-commit** — test candidates and decide commit/hold/discard
5. **Type definitions** — canonical cycle types in `shared-types.md` Section 6

## What this spec stack does NOT define

The **canonical cycle runtime behavior** (how a live world operates) is NOT specified here. Specifically:

| Missing spec | What it should define | Owner |
|-------------|----------------------|-------|
| `canonical-cycle.md` | How cycles run: observe → propose → judge → apply → pulse → outcome → precedent | **Thyra** |
| `judgment-rules.md` | How judgment layers execute (structural, invariants, constitution, contextual) | **Thyra** |
| `pulse-engine.md` | How PulseFrame is generated from world state + metrics | **Thyra** |
| `outcome-engine.md` | How OutcomeReport is generated after change observation window | **Thyra** |
| `precedent-engine.md` | How PrecedentRecord feeds back into future governance decisions | **Thyra** |

## Why types are here but behavior is in Thyra

Per `規劃.md`:
- **Völva** decides "should this become a world, what kind, does it deserve build/governance"
- **Thyra** runs "the world is live, how does it operate and govern itself"

The type definitions (WorldMode, Verdict, JudgmentReport, PulseFrame, etc.) are shared contracts — both Völva and Thyra reference them. They live in `shared-types.md` as the single source of truth.

## Impact on deepskill/ references

`docs/deepskill/README.md` references this spec stack for "world governance runtime." This is corrected — it now says world-design-v0 provides the pre-world pipeline and type definitions, not the runtime behavior.
