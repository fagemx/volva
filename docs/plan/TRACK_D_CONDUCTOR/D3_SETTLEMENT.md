# D3: Settlement Router + Village Pack Builder

> **Layer**: L2
> **Dependencies**: D1（State Machine）, C1（Card Schemas）
> **Blocks**: E2（CLI + Routes — 沉澱後呼叫 Thyra）
> **Output**: `src/settlement/router.ts`, `src/settlement/village-pack-builder.ts`, `src/schemas/settlement.ts`

---

## Bootstrap Instructions

```bash
cat docs/VOLVA/02_INTERACTION_MODEL.md       # Settlement Router 規則
cat docs/VOLVA/walkthroughs/W1_NEW_VILLAGE.md  # Village Pack 生成範例
cat docs/plan/CONTRACT.md                    # SETTLE-01
cat src/schemas/card.ts                      # C1 產出
bun run build
```

---

## Implementation

### src/schemas/settlement.ts

```typescript
import { z } from 'zod';

export const SettlementTarget = z.enum(['village_pack', 'workflow', 'task']);
export type SettlementTarget = z.infer<typeof SettlementTarget>;

export const SettlementStatus = z.enum(['draft', 'confirmed', 'applied', 'failed']);

export const SettlementSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  card_id: z.string(),
  target: SettlementTarget,
  payload: z.string(),        // YAML string or task JSON
  status: SettlementStatus,
  thyra_response: z.string().nullable(),
  created_at: z.string(),
});
```

### src/settlement/router.ts — classifySettlement()

分流規則（從 02_INTERACTION_MODEL.md 萃取）：
- WorldCard 有 hard_rules 或 chief_draft → `village_pack`
- WorkflowCard 有 steps → `workflow`
- TaskCard → `task`
- 都不符合 → null（留在短卡）

### src/settlement/village-pack-builder.ts — buildVillagePack()

WorldCard → Village Pack YAML string（參考 W1 Turn 7 的完整 YAML 範例）。

映射規則：
- `card.goal` → `village.name`
- `card.confirmed.hard_rules` → constitution rules (enforcement: hard)
- `card.confirmed.soft_rules` → constitution rules (enforcement: soft)
- `card.chief_draft` → chief section
- `card.confirmed.must_have` → skills array

使用 `js-yaml` 的 `dump()` 產出 YAML。

### Tests

- classifySettlement: WorldCard with hard_rules → village_pack
- classifySettlement: empty card → null
- buildVillagePack: produces valid YAML string
- buildVillagePack: includes constitution rules from card

## Acceptance Criteria

```bash
bun run build
bun test src/settlement/
```

## Git Commit

```
feat(settlement): add router + village pack builder from WorldCard
```
