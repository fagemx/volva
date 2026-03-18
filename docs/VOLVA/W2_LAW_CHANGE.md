# W2：調整運行中的 Midnight Market

## 場景

Midnight Market 已運行 3 天。營運者發現 Economy Chief 每天降價 2-3 次，造成價格不穩定。想限制降價頻率。

## 覆蓋目標

- world_management mode（#69 post-creation conversation）
- 即時調整（不走 settlement）
- Evaluator rule 新增
- Chief 配置修改
- Völva 查 Edda 歷史做建議

---

## 逐輪對話

### Turn 1 — 進入管理模式

```
用戶：「Midnight Market 的 Economy Chief 降價太頻繁了」

Völva：「我看一下 Midnight Market 的狀態...

  📊 過去 3 天 Economy Chief 行為：
  - 降價提案：9 次（平均 3 次/天）
  - 通過：7 次
  - Rollback：1 次（第 2 天降太多被 Safety 回退）

  📜 Edda 先例：
  - 連續降價 3 天，第 2 天出現通膨反彈跡象

  你想怎麼限制？」
```

**Mode**: world_management
**Intent**: query_status → query_history
**Data**: GET world state + Edda queryDecisions

### Turn 2 — 定義限制

```
用戶：「每天最多降一次，而且幅度不超過 10%」

Völva：「好。我加兩條 evaluator rule：

  📊 新規則：
  1. Economy Chief 降價頻率 ≤ 1 次/天
     → 超過 → 需要你確認
  2. 單次降幅 ≤ 10%
     → 超過 → 需要你確認

  這會影響正在運行的世界。確定嗎？」

用戶：「確定」
```

**Intent**: adjust_rule
**Action**: PATCH evaluator rules → 即時生效（不走 settlement）

### Turn 3 — 確認 + 建議

```
Völva：「✅ 已生效。Economy Chief 下一輪 cycle 就會看到新規則。

  💡 建議：根據 Edda 先例，連續降價後通常需要 1-2 天穩定期。
  要不要也暫停 Economy Chief 一天，讓價格自然回穩？」

用戶：「好主意，暫停一天」

Völva：→ POST /api/chiefs/{economy}/pause
  「✅ Economy Chief 已暫停。明天自動恢復。」
```

**Intent**: pause_resume
**Action**: POST chief pause → 即時生效

---

## 覆蓋的系統功能

| 功能 | Turn | 對應 Issue |
|------|------|-----------|
| world_management mode | 1 | V#69 |
| Query world state | 1 | Thyra API |
| Query Edda history | 1 | T#222 |
| Add evaluator rule | 2 | T#215 + V#65 |
| 即時生效（不走 settlement） | 2 | V#69 |
| Pause chief | 3 | Chief CRUD (已有) |
| Edda-based suggestion | 3 | T#222 |
