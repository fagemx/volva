# C1: Container Types + Posture Detection

> **Module**: `src/containers/types.ts`, `src/containers/posture.ts`
> **Layer**: L1
> **Dependencies**: A1（SkillObjectSchema — for type references）
> **Blocks**: C2（Gate Check）, C3（Transitions）

---

## 給 Agent 的起始指令

```bash
cat docs/deepskill/container-routing-v0.md       # Section 3-4: containers, axes, posture mapping
cat docs/deepskill/volva-interaction-model-v0.md  # Section 4: user postures → internal signals
cat src/schemas/intent.ts                         # existing IntentType enum
cat src/schemas/conversation.ts                   # existing ConversationMode, ConductorPhase
cat docs/plan-deepskill/CONTRACT.md               # LAYER-01, LAYER-02
bun run build
```

---

## Final Result

- `src/containers/types.ts` — Container, PostureSignal, ContainerSelection, RoutingContext types
- `src/containers/posture.ts` — `detectPosture(intentType, conversationContext): PostureSignal`
- Posture 偵測基於 intent type + conversation history context
- 型別完整，不依賴 `skills/` 或 `conductor/`

---

## 實作

### Step 1: Core types (`types.ts`)

```typescript
export const ContainerEnum = ['world', 'shape', 'skill', 'task', 'review', 'harvest'] as const;
export type Container = typeof ContainerEnum[number];

export type PostureSignal = 'explore' | 'act' | 'inspect' | 'harvest';

export type Confidence = 'low' | 'medium' | 'high';

export interface ContainerSelection {
  primary: Container;
  secondary?: Container;
  confidence: Confidence;
  rationale: string;
}

export interface RoutingContext {
  userMessage: string;
  intentType?: IntentType;     // from previous turn or pre-parsed; undefined = keyword-only detection
  conversationMode?: string;
  hasActiveWorld?: boolean;
  previousContainer?: Container;
}

// Re-export for convenience. IntentType comes from existing src/schemas/intent.ts.
// Posture detection works with OR without intentType — if absent, uses keyword heuristic only.
// This ensures container routing can run BEFORE parseIntent() without violating COND-02.
export type { IntentType } from '../schemas/intent';
```

### Step 2: Posture detection (`posture.ts`)

> **Design note:** `detectPosture()` works in two modes:
> 1. **With intentType** (from previous turn or pre-parsed): uses both intent + keywords
> 2. **Without intentType** (first request, no prior context): uses keywords only
>
> This avoids needing an LLM call for posture detection, respecting COND-02.

```typescript
import type { PostureSignal, RoutingContext } from './types';
```

### Step 2: Posture detection (`posture.ts`)

```typescript
import type { PostureSignal, RoutingContext } from './types';

export function detectPosture(ctx: RoutingContext): PostureSignal {
  const { intentType, userMessage } = ctx;

  // harvest signals
  if (intentType === 'settle_signal' && /capture|save|reusable|skill/i.test(userMessage)) {
    return 'harvest';
  }

  // inspect signals
  if (intentType === 'question' || intentType === 'query_status' || intentType === 'query_history') {
    return 'inspect';
  }
  if (/why.*fail|investigate|diagnose|audit|compare/i.test(userMessage)) {
    return 'inspect';
  }

  // act signals
  if (['confirm', 'settle_signal'].includes(intentType)) {
    return 'act';
  }
  if (/deploy|fix|run|execute|build|create|do it/i.test(userMessage)) {
    return 'act';
  }

  // default: explore
  return 'explore';
}
```

---

## 驗收

```bash
bun run build
bun test src/containers/types.test.ts
bun test src/containers/posture.test.ts
# Test cases:
# - "deploy checkout-service" → act
# - "why did the last deploy fail?" → inspect
# - "I have a direction but don't know how" → explore
# - "save this as a reusable skill" → harvest
# - generic message → explore (default)
```

## Git Commit

```
feat(containers): add container types and posture detection

Define Container, PostureSignal, ContainerSelection types.
detectPosture() maps intent + message context to internal
posture signals per container-routing-v0.md Section 4.
```
