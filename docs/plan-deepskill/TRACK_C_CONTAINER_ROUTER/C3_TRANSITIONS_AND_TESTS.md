# C3: Container Transitions + Spawns + Tests

> **Module**: `src/containers/transitions.ts`
> **Layer**: L1
> **Dependencies**: C1（Container types）, C2（Router）
> **Blocks**: F1（Bridge — needs transition logic）

---

## 給 Agent 的起始指令

```bash
cat src/containers/types.ts                      # C1 output
cat src/containers/router.ts                     # C2 output
cat docs/deepskill/container-routing-v0.md       # Section 5: transitions + spawns
bun run build
```

---

## Final Result

- `src/containers/transitions.ts` 提供 `checkContainerTransition()` + `spawnFromWorld()`
- Transition table 完整實作（Shape→Skill, Shape→World, etc.）
- World spawn 語義：child container 在 World context 內執行
- 完整測試覆蓋所有 transition 路徑 + spawn 路徑 + invalid transition rejection

---

## 實作

### Step 1: Transition table

```typescript
import type { Container, ContainerSelection, RoutingContext } from './types';

interface TransitionResult {
  allowed: boolean;
  newContainer: Container;
  reason: string;
}

const VALID_TRANSITIONS: Record<string, Container[]> = {
  shape:  ['skill', 'world', 'task', 'harvest'],
  task:   ['harvest'],
  skill:  ['review', 'harvest'],
  review: ['skill', 'task', 'harvest'],
  // world and harvest have no exit transitions
};

export function checkContainerTransition(
  current: Container,
  proposed: Container,
  reason: string,
): TransitionResult {
  if (current === proposed) {
    return { allowed: true, newContainer: current, reason: 'No transition needed' };
  }
  const valid = VALID_TRANSITIONS[current] ?? [];
  if (valid.includes(proposed)) {
    return { allowed: true, newContainer: proposed, reason };
  }
  return { allowed: false, newContainer: current, reason: `Transition ${current} → ${proposed} not allowed` };
}
```

### Step 2: World spawn

```typescript
export interface SpawnResult {
  parentWorld: string;       // world container id
  childContainer: Container;
  childId: string;
  reason: string;
}

const SPAWNABLE_CONTAINERS: Container[] = ['shape', 'task', 'skill', 'review', 'harvest'];

export function spawnFromWorld(
  worldId: string,
  childContainer: Container,
  reason: string,
): SpawnResult | null {
  if (!SPAWNABLE_CONTAINERS.includes(childContainer)) {
    return null;
  }
  return {
    parentWorld: worldId,
    childContainer,
    childId: `${worldId}:${childContainer}:${Date.now()}`,
    reason,
  };
}
```

### Step 3: Any → Harvest (post-hoc)

```typescript
export function canHarvest(current: Container): boolean {
  // Any container can transition to harvest after completion
  return current !== 'harvest';  // can't harvest from harvest
}
```

---

## 驗收

```bash
bun run build
bun test src/containers/transitions.test.ts

# Full Track C validation:
bun test src/containers/

# Test cases:
# - Shape → Skill: allowed
# - Shape → World: allowed
# - Shape → Task: allowed
# - Task → Harvest: allowed
# - Skill → Review: allowed
# - Review → Skill: allowed
# - Review → Task: allowed
# - World → anything: NOT allowed (must spawn)
# - Harvest → anything: NOT allowed
# - spawnFromWorld(worldId, 'task', reason) → SpawnResult
# - spawnFromWorld(worldId, 'world', reason) → null (can't spawn world)
```

## Git Commit

```
feat(containers): add transition table and World spawn logic

checkContainerTransition() validates against allowed transitions.
spawnFromWorld() creates child containers within World context.
World has no exit transitions — sub-problems use spawn semantics.
```
