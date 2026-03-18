# C2: Sequential Gate Check + Confidence Behavior

> **Module**: `src/containers/router.ts`
> **Layer**: L1
> **Dependencies**: C1（Container types + posture detection）, B2（SkillLookup interface — via injection）
> **Blocks**: C3（Transitions）, E1（Harvest trigger）, F1（Bridge）

---

## 給 Agent 的起始指令

```bash
cat src/containers/types.ts                      # C1 output
cat src/containers/posture.ts                    # C1 output
cat src/skills/registry.ts                       # B1 output — SkillLookup interface ONLY
cat docs/deepskill/container-routing-v0.md       # Section 4: 6-gate protocol + confidence
cat docs/plan-deepskill/CONTRACT.md              # LAYER-02: router 不直接 import registry
bun run build
```

---

## Final Result

- `src/containers/router.ts` 提供 `selectContainer(ctx: RoutingContext, skillLookup: SkillLookup): ContainerSelection`
- 6 gates 按順序執行
- Gate 4 透過 `SkillLookup` interface 查詢（不直接 import registry）
- **Secondary container detection** — 偵測 "do X then capture as skill" 等 tail patterns
- Confidence-based behavior 實作
- 測試覆蓋所有 canonical examples

> **Design note: posture detection 不用 LLM。** Container routing 在 `parseIntent()` 之前執行（route layer）。
> Posture detection 使用 keyword heuristic（C1 posture.ts），不需要 LLM call。
> `intentType` 如果由 caller 提供（如從上一輪結果帶入）則使用，否則用 keyword 推斷。
> 這確保不違反 COND-02（每輪最多 2 次 LLM 呼叫）。

---

## 實作

### Step 1: Import types only (not implementations)

```typescript
import type { Container, ContainerSelection, RoutingContext, Confidence } from './types';
import type { SkillLookup } from '../skills/types';  // interface from types file — CONTRACT LAYER-02
import { detectPosture } from './posture';
```

### Step 2: 6-gate sequential check

```typescript
export function selectContainer(
  ctx: RoutingContext,
  skillLookup: SkillLookup,
): ContainerSelection {
  // Gate 1: Is this clearly a long-term domain / persistent world?
  if (ctx.hasActiveWorld || /long-term|project|workspace|world/i.test(ctx.userMessage)) {
    return { primary: 'world', confidence: 'high', rationale: 'Long-term domain detected' };
  }

  const posture = detectPosture(ctx);

  // Gate 2: Is the path unclear / problem not yet formed?
  if (posture === 'explore') {
    return { primary: 'shape', confidence: 'medium', rationale: 'Path unclear, entering Shape' };
  }

  // Gate 3: Is the primary posture inspect / judge / diagnose?
  if (posture === 'inspect') {
    return { primary: 'review', confidence: 'medium', rationale: 'Investigation posture detected' };
  }

  // Gate 4: Does a mature skill exist for this problem class?
  if (posture === 'act') {
    const matches = skillLookup.findMatching(ctx.userMessage);
    if (matches.length > 0) {
      const best = matches[0];
      return {
        primary: 'skill',
        confidence: best.confidence,
        rationale: `Matched skill: ${best.name} (${best.rationale})`,
      };
    }
  }

  // Gate 5: Is this a bounded one-off job with clear deliverable?
  if (posture === 'act') {
    return { primary: 'task', confidence: 'medium', rationale: 'Bounded work, no matching skill' };
  }

  // Gate 6: After completion — reuse value?
  if (posture === 'harvest') {
    return { primary: 'harvest', confidence: 'medium', rationale: 'User wants to capture pattern' };
  }

  // Default fallback
  return { primary: 'shape', confidence: 'low', rationale: 'Ambiguous request, defaulting to Shape' };
}

/**
 * Detect secondary container from user message tail patterns.
 * E.g., "Deploy checkout-service, then capture the flow as a skill"
 * → primary from gates above, secondary: 'harvest'
 */
function detectSecondary(msg: string, primary: Container): Container | undefined {
  if (primary === 'harvest') return undefined;  // already harvest
  // "then capture|save|skill-ize" tail → harvest
  if (/then\s+(capture|save|make.*reusable|skill)/i.test(msg)) return 'harvest';
  // "then review|investigate" tail → review
  if (/then\s+(review|check|investigate)/i.test(msg) && primary !== 'review') return 'review';
  return undefined;
}

// In selectContainer(), after determining primary, add:
// selection.secondary = detectSecondary(ctx.userMessage, selection.primary);
```

### Step 3: Confidence-based behavior helper

```typescript
export interface ConfidenceBehavior {
  proceed: boolean;
  showRationale: boolean;
  askClarification: boolean;
}

export function getConfidenceBehavior(selection: ContainerSelection): ConfidenceBehavior {
  switch (selection.confidence) {
    case 'high':
      return { proceed: true, showRationale: false, askClarification: false };
    case 'medium':
      return { proceed: true, showRationale: true, askClarification: false };
    case 'low':
      return { proceed: false, showRationale: true, askClarification: true };
  }
}
```

---

## 驗收

```bash
bun run build
bun test src/containers/router.test.ts
# Test cases per canonical examples:
# - "Deploy checkout-service" → skill (if exists) or task
# - "I have a direction but don't know how" → shape
# - "Why did the last deploy fail?" → review
# - "Start a long-term project" → world
# - "Save this as a reusable skill" → harvest
# - Ambiguous message → shape with low confidence
# - confidence low → askClarification: true
# - confidence high → proceed silently

# CONTRACT LAYER-02 check:
grep -r "from.*registry\|from.*trigger-matcher" src/containers/router.ts | grep -v "type "
# Expected: 0 (only type imports allowed)
```

## Git Commit

```
feat(containers): add 6-gate sequential container routing

selectContainer() implements the container-routing-v0.md protocol
with SkillLookup dependency injection (CONTRACT LAYER-02).
Includes confidence-based behavior (high→silent, medium→rationale,
low→clarification).
```
