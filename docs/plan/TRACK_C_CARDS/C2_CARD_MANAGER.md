# C2: Card Manager

> **Layer**: L1
> **Dependencies**: C1（Card Schemas）, A2（DB Layer）
> **Blocks**: D2（Turn Handler — 每輪更新短卡）
> **Output**: `src/cards/card-manager.ts` — CardManager class

---

## Bootstrap Instructions

```bash
cat src/schemas/card.ts    # C1 產出
cat src/db.ts              # A2 產出
bun run build
```

---

## Implementation

CardManager 負責短卡的 CRUD + 版本追蹤 + diff 計算。

核心 API：
```typescript
class CardManager {
  constructor(db: Database) {}

  /** 建立新短卡（version = 1） */
  create(conversationId: string, type: CardType, content: WorldCard | WorkflowCard | TaskCard): Card {}

  /** 更新短卡（version + 1，記錄 diff） */
  update(cardId: string, content: Partial<WorldCard>): { card: Card; diff: CardDiff } {}

  /** 查詢最新版本 */
  getLatest(conversationId: string): Card | null {}

  /** 計算兩個版本的 diff */
  diff(oldContent: WorldCard, newContent: WorldCard): CardDiff {}
}
```

CardDiff 結構：
```typescript
interface CardDiff {
  added: string[];    // 新增的欄位/值
  removed: string[];  // 移除的欄位/值
  changed: string[];  // 變更的欄位
}
```

測試：create → version=1、update → version=2、diff 正確識別變更、DB round-trip。

## Acceptance Criteria

```bash
bun run build
bun test src/cards/card-manager.test.ts
```

## Git Commit

```
feat(cards): add CardManager with CRUD, versioning, and diff
```
