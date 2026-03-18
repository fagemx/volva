# F1: Container Router ↔ Conductor Bridge

> **Module**: `src/routes/container-bridge.ts` ← 放在 routes/ (assembly layer) 而非 containers/
> **Layer**: L3
> **Dependencies**: C2（Container Router）, D1（Lifecycle）, 現有 `src/conductor/turn-handler.ts`
> **Blocks**: F2（Routes）, F3（E2E Tests）

> **Layer placement rationale:** Bridge 需要同時 import `containers/` 和 `conductor/`。
> 按 CLAUDE.md ARCH-02，`containers/` 不得 import `conductor/`。
> `routes/` 是 assembly layer，可以 import 所有下層模組。所以 bridge 放在 `routes/`。

---

## 給 Agent 的起始指令

```bash
cat src/conductor/turn-handler.ts            # 現有 turn handling
cat src/conductor/state-machine.ts           # 現有 phase transitions
cat src/conductor/rhythm.ts                  # 現有 strategy picker
cat src/containers/router.ts                 # C2 output
cat src/containers/types.ts                  # C1 output
cat src/skills/lifecycle.ts                  # D1 output
cat src/db.ts                                # existing conversation modes
cat docs/plan-deepskill/CONTRACT.md          # COND-02, LAYER-01
bun run build
```

---

## Final Result

- `src/routes/container-bridge.ts` 提供 `resolveContainer()` + `containerToConversationMode()`
- Container selection 在 turn-handler 之前執行（在 route layer）
- Container context 影響 conductor 的 strategy 選擇
- **現有 conductor 邏輯不被破壞（additive, opt-in）**
- 正確處理 `world_management` mode（bypass container routing）
- 定義清楚的 coexistence 策略

---

## 實作

### Step 0: Coexistence 策略（現有 conversations 遷移）

> **Critical design decision:** Container routing 是 **additive, opt-in**。
>
> - 現有 API（`POST /api/conversations/:id/turn`）**完全不改**。既有對話繼續用現有 conductor。
> - 新 API（`POST /api/containers/turn`）經過 container routing 再進入 conductor。
> - 既有 conversation 不需要 retroactive container assignment。
> - 兩個 API 共用同一個 conductor / state-machine / rhythm。差異只是 route layer 多一步 container selection。
> - 未來可透過 feature flag 讓舊 API 也走 container routing，但 v0 不做。

### Step 1: resolveContainer

```typescript
// src/routes/container-bridge.ts
import type { ContainerSelection, RoutingContext, Container } from '../containers/types';
import type { SkillLookup } from '../skills/types';       // interface from types file, not registry.ts
import { selectContainer, getConfidenceBehavior, detectSecondary } from '../containers/router';

export interface ContainerContext {
  container: Container;
  selection: ContainerSelection;
  skillId?: string;          // if Skill container was selected
  worldId?: string;          // if inside a World
  isSpawnedChild?: boolean;  // if this is a World-spawned child
}

export function resolveContainer(
  ctx: RoutingContext,
  skillLookup: SkillLookup,
): ContainerContext {
  const selection = selectContainer(ctx, skillLookup);
  const behavior = getConfidenceBehavior(selection);

  // If low confidence, force Shape
  const container = behavior.askClarification ? 'shape' : selection.primary;

  return {
    container,
    selection,
    skillId: container === 'skill' ? parseSkillIdFromRationale(selection.rationale) : undefined,
    worldId: ctx.hasActiveWorld ? 'current' : undefined,
  };
}

/** Extract skill id from rationale string like "Matched skill: deploy-service (...)" */
function parseSkillIdFromRationale(rationale: string): string | undefined {
  const match = /Matched skill: (\S+)/.exec(rationale);
  return match?.[1];
}
```

### Step 2: Mode passthrough（不是硬 mapping）

```typescript
import type { ConversationMode } from '../schemas/conversation';

/**
 * Map container to conversation mode.
 *
 * Key design: if the container doesn't map to a specific mode,
 * return undefined → caller keeps the EXISTING conversation mode.
 * This ensures existing conversations are not disrupted.
 */
export function containerToConversationMode(
  container: Container,
  currentMode?: string,
): string {
  switch (container) {
    case 'world':  return currentMode ?? 'world_design';
    case 'task':   return 'task';
    case 'shape':  return currentMode ?? 'world_design';  // Shape uses current mode
    case 'skill':  return currentMode ?? 'task';           // Skill defaults to task-like execution
    case 'review': return currentMode ?? 'world_design';   // Review is a posture, not a mode
    case 'harvest': return currentMode ?? 'world_design';  // Harvest is a flow, not a mode
  }
}

/**
 * Check if container routing should be bypassed.
 * world_management has its own handler and should not go through container routing.
 */
export function shouldBypassContainerRouting(conversationMode: string): boolean {
  return conversationMode === 'world_management';
}
```

---

## 驗收

```bash
bun run build
bun test src/routes/container-bridge.test.ts

# LAYER-01 check: bridge is in routes/, not containers/
ls src/routes/container-bridge.ts
# Expected: exists

ls src/containers/bridge.ts
# Expected: NOT exists

# Test cases:
# - resolveContainer with skill match → container: 'skill', skillId set
# - resolveContainer with low confidence → container: 'shape' (forced)
# - resolveContainer with world context → worldId set
# - containerToConversationMode('world', undefined) → 'world_design'
# - containerToConversationMode('shape', 'workflow_design') → 'workflow_design' (passthrough)
# - containerToConversationMode('task', anything) → 'task'
# - shouldBypassContainerRouting('world_management') → true
# - shouldBypassContainerRouting('world_design') → false
```

## Git Commit

```
feat(routes): add container-bridge for conductor integration

resolveContainer() executes container selection at the route layer.
containerToConversationMode() maps to existing modes with passthrough.
Placed in routes/ (assembly layer) to respect ARCH-02.
world_management mode bypassed from container routing.
```
