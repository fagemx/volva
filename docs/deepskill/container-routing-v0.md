# container-routing-v0.md

> Status: `working draft`
>
> Purpose: Define how Völva selects which **work container** to route a request into — and how containers can transition during a session.
>
> This file does NOT cover:
> - What a skill object looks like internally (see `skill-object-v0.md`)
> - How skills evolve over time (see `skill-lifecycle-v0.md`)
> - The user-facing interaction model (see `volva-interaction-model-v0.md`)

---

## 1. One-Liner

> **Container selection is not a classifier. It's a routing protocol based on work state, capability inventory, risk, and user posture.**

---

## 2. What It's NOT

### Not a text classifier
Classifying "deploy checkout-service" into a label always fails because the same sentence can mean Skill, Task, Review, or Harvest depending on context.

### Not a static menu of 6 options shown to the user
The 6 containers are internal routing targets. Users see 4 postures (see `volva-interaction-model-v0.md`).

### Not a one-shot decision
Many requests are container sequences (Shape → World → Harvest), not single labels. Selection picks a **primary container** and allows transitions.

---

## 3. Six Internal Containers

| Container | Purpose | When |
|-----------|---------|------|
| **World** | Persistent work environment with shared state, roles, history | Long-term domains, ongoing projects |
| **Shape** | Problem not yet formed — route, decompose, find regime, probe path | Fuzzy intent, path unclear |
| **Skill** | Mature reusable method package | Known problem class with existing capability |
| **Task** | One-off bounded work with clear deliverable | Clear scope, not worth skill-izing |
| **Review** | Evidence-first investigation — diagnose, audit, compare | Need to inspect before acting |
| **Harvest** | Extract reusable pattern from completed work | After work is done, method worth capturing |

---

## 4. Routing Protocol

Not a classifier. A **sequential gate check**:

```text
1. Is this clearly a long-term domain / persistent world?
   YES → World

2. Is the path unclear / problem not yet formed?
   YES → Shape

3. Is the primary posture inspect / judge / diagnose?
   YES → Review

4. Does a mature skill exist for this problem class?
   YES → Skill

5. Is this a bounded one-off job with clear deliverable?
   YES → Task

6. After completion: does the work pattern have reuse value?
   YES → Harvest
```

### Three Routing Axes

Each request is evaluated on 3 continuous axes:

| Axis | Low | High |
|------|-----|------|
| **Persistence** | one-off → Task | long-term → World |
| **Path clarity** | fuzzy → Shape | clear → Skill/Task |
| **Method maturity** | ad hoc → Task/Shape | mature → Skill |

### Posture → Container Mapping

Posture is not a continuous axis — it's a categorical signal derived from user intent. The routing protocol uses **internal posture signals** (lowercase), which are derived from the **user-facing postures** defined in `volva-interaction-model-v0.md`.

#### User-facing → Internal posture mapping

| User-facing posture | Internal signal(s) | Notes |
|--------------------|--------------------|-------|
| **Open a world** | _(no posture signal)_ | World is selected via Gate 1 (persistence axis), not posture |
| **Help me think** | `explore` or `inspect` | `explore` when path is unclear; `inspect` when user wants to investigate |
| **Just do it** | `act` | User wants something done |
| **Capture this method** | `harvest` | User wants to extract a reusable pattern |

> "Open a world" bypasses posture entirely — it's detected by the persistence axis (Gate 1) before posture is evaluated. The other three user postures each map to one or two internal signals.

#### Internal posture → Container mapping

| Internal posture | Primary container | When |
|---------|------------------|------|
| **explore** | Shape | User is thinking, not acting |
| **act** | Skill (if exists) / Task (if not) | User wants something done |
| **inspect** | Review | User wants to investigate before acting |
| **harvest** | Harvest | User wants to capture a reusable pattern |

### Primary + Secondary Container

Selection outputs a primary and optional secondary:

```ts
type ContainerSelection = {
  primary: "world" | "shape" | "skill" | "task" | "review" | "harvest";
  secondary?: "world" | "shape" | "skill" | "task" | "review" | "harvest";
  confidence: "low" | "medium" | "high";
  rationale: string;
};
```

Example: "Deploy checkout-service, then capture the flow as a skill"
→ primary: `skill`, secondary: `harvest`

### Confidence-Based Behavior

| Confidence | Behavior |
|-----------|----------|
| **high** | Proceed silently — enter the selected container |
| **medium** | Proceed with rationale shown — tell user which container and why |
| **low** | Fallback to **Shape** + ask user to clarify intent before proceeding |

When confidence is `low`, the system MUST NOT silently enter a non-Shape container. Shape is the safe default for ambiguous requests.

---

## 5. Container Transitions

Containers are not locked for a session. Two kinds of container change are supported:

### Transitions (replace current container)

```text
Shape  → Skill     (path becomes clear, matching skill found)
Shape  → World     (problem requires persistent environment)
Shape  → Task      (problem is bounded and clear, no existing skill)
Task   → Harvest   (one-off work reveals reusable pattern)
Skill  → Review    (skill run hits anomaly, needs investigation)
Review → Skill     (investigation reveals known problem, skill exists)
Review → Task      (investigation reveals bounded fix needed)
Any    → Harvest   (after completion, if method has reuse value)
```

### Spawns (World creates child containers)

World is a long-lived environment. Instead of transitioning away, it **spawns** child containers:

```text
World  → spawn Shape    (new fuzzy sub-problem within the world)
World  → spawn Task     (concrete bounded work item)
World  → spawn Skill    (known capability needed)
World  → spawn Review   (need to investigate something)
World  → spawn Harvest  (completed work worth capturing)
```

Child containers run within the World's context and return results to it. The World itself persists across spawns.

> **Why World has no exit transition:** A World is a persistent environment. You don't "leave" a World — you close it (archive) or it stays active. Sub-problems within a World are handled via spawns, not transitions.

---

## 6. Default Fallbacks

When routing is ambiguous, use these defaults:

| Signal | Default |
|--------|---------|
| Don't know how to handle | **Shape** |
| Know what to deliver | **Task** |
| Matching skill exists | **Skill** |
| Want to build long-term | **World** |
| Need to look before acting | **Review** |
| Just finished, want to capture | **Harvest** |

---

## 7. Integration with World-Design Pipeline (Regime Routing)

Container routing and regime routing are **complementary** — they answer different questions:

| System | Question | Output |
|--------|----------|--------|
| **Container routing** (this doc) | Which work environment should handle this request? | Container + confidence |
| **Regime routing** (`docs/world-design-v0/`) | What kind of terminal intent is this? | Regime + path certainty |

### Where they connect

The **Shape container** is where the world-design-v0 pipeline executes:

```text
Container routing: request → Gate 2 → Shape container
                                        │
Inside Shape:   intent-router → path-check → space-builder → probe-commit → Forge
                                        │
                    (see docs/world-design-v0/intent-router-and-space-builder.md)
```

The **World container** handles the governance regime's post-commit path:

```text
Container routing: request → Gate 1 → World container
                                        │
Inside World:   (if new) space-building → probe-commit → Forge → settlement → Thyra
                (if existing) canonical cycle running
```

### Integration rules

1. **Container routing runs first** — decides Shape/World/Skill/Task/Review/Harvest
2. **Regime routing runs inside Shape** — only when the container is Shape (fuzzy intent)
3. **World container may internally run regime routing** for governance-specific space-building
4. **Skill/Task/Review containers do NOT run regime routing** — they already have clear work types

> This means the world-design-v0 pipeline (intent-router → path-check → space-builder → probe-commit) is **not a replacement** for container routing — it's what happens **inside** the Shape and World containers when the intent is fuzzy.

---

## 8. Canonical Examples

### Example A: "Deploy checkout-service to staging"

Axes:
- Persistence: low
- Path clarity: high
- Method maturity: high (deploy skill exists)
- Posture: act

→ **Skill** (deploy-service skill)

### Example B: "I have a product direction but don't know how to approach it"

Axes:
- Persistence: uncertain
- Path clarity: low
- Method maturity: low
- Posture: explore

→ **Shape** (intent-router → space-builder → probe)

### Example C: "Why did the last deploy fail?"

Axes:
- Persistence: low
- Path clarity: high (know what to investigate)
- Method maturity: medium
- Posture: inspect

→ **Review**

---

## 9. Skill Registry Dependency

Gate 4 of the routing protocol asks: "Does a mature skill exist for this problem class?" This requires a **skill registry** — a searchable index of available skills and their trigger conditions.

### v0 Implementation

v0 uses Thyra's existing `getSkills()` API as the skill registry. The current `SkillData` schema (`{id, name, type?, description?}`) is minimal and does NOT support trigger matching. To fully implement Gate 4, the registry needs:

1. **Trigger matching** — compare request context against `routing.triggerWhen` / `doNotTriggerWhen`
2. **Status filtering** — only return skills with `promotionStatus` ≥ `sandbox`
3. **Priority ordering** — when multiple skills match, select by `routing.priority`

Until Thyra's `SkillData` is extended, Gate 4 falls through to Gate 5 (Task) for most requests. This is acceptable for v0 — skills are rare early on.

### Future

A full skill registry spec (indexing, search, conflict resolution) is out of scope for this doc but will be needed when the skill population grows beyond ~20.

---

## 10. Boundaries / Out of Scope

- This spec defines **internal container routing**. The user-facing language (4 postures) is in `volva-interaction-model-v0.md`.
- This spec does NOT define what happens inside each container — only how the system decides which one to enter.
- Harvest is always **post-hoc** — it never pre-empts other containers.

---

## Closing Line

> **Container selection is not "what kind of request is this?" — it's "given this work state, capability inventory, and user posture, which container should this request enter first?"**
