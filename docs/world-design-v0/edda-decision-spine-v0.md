# edda-decision-spine-v0.md

> Status: `working draft`
>
> Purpose: Define what Edda records at each layer of the decision pipeline, and how precedent feeds back.
>
> Edda is the decision spine — it records the full decision path, not just final outcomes.

---

## 1. One-Liner

> **Edda is not the last step. It's a side-channel that records every decision, at every layer, from intent classification to Thyra precedent.**

---

## 2. What Edda Records (per layer)

| Layer | Event types | Key fields |
|-------|------------|------------|
| **intent-router** | `intent.classified` | regime, confidence, signals, keyUnknowns |
| **path-check** | `path.checked` | certainty, route, fixedElements, unresolvedElements |
| **space-builder** | `space.expanded`, `space.pruned` | candidateIds, regime, pruneReason |
| **probe-commit** | `probe.designed`, `probe.completed`, `signal.recorded`, `commit.decided` | candidateId, probeId, signalStrength, verdict |
| **forge** | `forge.started`, `forge.completed` | commitMemoId, deliverables |
| **thyra** | `governance.precedent`, `governance.adjustment` | See shared-types.md §6.10-6.11 |

---

## 3. Edda Record Schema (v0)

```ts
type EddaDecisionEvent = {
  id: string;                    // edda_...
  sessionId: string;             // links to DecisionSession
  layer: "intent-router" | "path-check" | "space-builder" | "probe-commit" | "forge" | "thyra";
  eventType: string;             // from table above
  objectId: string;              // what was affected (candidateId, probeId, etc.)
  payload: Record<string, unknown>;
  createdAt: string;
};
```

---

## 4. Precedent Feedback

Edda's records are not just for audit. They feed back into the system:

### 4.1 Evaluator feedback
When a probe-commit evaluator runs, it can query Edda for:
- Previous signal strengths for similar candidates in the same regime
- Past commit verdicts and their outcomes
- Known failure patterns

### 4.2 Router feedback
When the intent-router classifies a new intent, Edda can surface:
- Previous misclassifications (false regime assignments)
- Common confusion pairs (from `router-test-cases.md`)

### 4.3 Thyra governance feedback
Thyra queries Edda for:
- Precedent records matching current change proposals
- Previous governance adjustments and their effects

---

## 5. Current Implementation Status

| Component | Status |
|-----------|--------|
| `EddaClient` in Volva | Exists — `queryDecisions()`, `getDecisionOutcomes()` |
| Decision event recording | **Not implemented** — EddaClient has no write API for decision events |
| Precedent query interface | **Not implemented** — only generic decision queries exist |
| Feedback into evaluators | **Not implemented** |

### v0 workaround
v0 can log decision events to the local `decision_events` table defined in `docs/storage/volva-working-state-schema-v0.md` Section 6. Edda integration becomes real when EddaClient gains event recording APIs.

---

## 6. Boundaries

- This doc defines **what** Edda records and **how** it feeds back
- The **storage format** for decision events is in `docs/storage/volva-working-state-schema-v0.md`
- The **Edda service API** is out of scope for Volva docs — that belongs to the Edda repo
- The **Thyra precedent types** are in `shared-types.md` Section 6.10
