# W4：單次任務 — 分析上週客服數據

## 場景

使用者想看上週客服的表現數據。不是在建世界，不是在設計流程，就是一個一次性的任務。

## 覆蓋目標

- Mode C: Task Chat
- 最輕量路徑：不需要 WorldCard 也不需要 WorkflowCard
- TaskCard lifecycle
- Settlement → Task（直接執行）
- 證明不是所有東西都要走重流程

---

## 逐輪對話

### Turn 1

**Phase**: EXPLORE（但會很快結束）

**User**: 幫我看一下上週客服的數據

**Intent parsing**:
```json
{
  "type": "task_request",
  "domain": "analytics",
  "scope": "single",
  "target": "customer_service_metrics",
  "timeframe": "last_week"
}
```

**Mode detection**:
- 沒有 rules / constitution / chief 信號 → 不是 Mode A
- 沒有 steps / trigger / recurring 信號 → 不是 Mode B
- 單次請求 + 明確任務 → Mode C

**Card type**: TaskCard

**Card update**:
```yaml
intent: "查看上週客服表現數據"
inputs:
  village: "customer-service（推測）"
  timeframe: "上週"
constraints: []
success_condition: null
version: 1
```

**Strategy**: mirror + quick clarify

**Assistant**: 上週客服數據，你想看哪些指標？例如回應時間、解決率、轉人工比例？還是全部？

---

### Turn 2

**Phase**: EXPLORE → **FOCUS** → **SETTLE**（快速通過）

**User**: 全部都看一下

**Intent parsing**:
```json
{
  "type": "confirm_scope",
  "scope": "all_metrics",
  "specificity": "medium"
}
```

**Card update**:
```yaml
intent: "查看上週客服全部表現數據"
inputs:
  village: "customer-service"
  timeframe: "上週"
  metrics: "all"
constraints: []
success_condition: "取得並展示上週完整數據"
version: 2
```

**Phase transition**: 直接到 SETTLE
- 理由：任務明確、無待確認事項、不需要更多探索

**Settlement Router 判斷**:
- 只有 intent + inputs → TASK
- 不需要 Village Pack，不需要 Workflow

**Task execution**:
```
Völva → Thyra API:
  GET /api/villages/:id/score
  GET /api/villages/:id/loops?status=completed&since=last_week
  GET /api/audit?village_id=:id&since=last_week
```

**Strategy**: settle（直接給結果）

**Assistant**: 上週客服 village 數據：

| 指標 | 值 |
|------|-----|
| 總處理量 | 342 筆 |
| AI 自動解決 | 278 筆（81%） |
| 轉人工 | 64 筆（19%） |
| 自動退款 | 12 筆 |
| 平均回應時間 | 1.2 秒 |
| 客戶滿意度 | 87% |
| 規則違規 | 0 筆 |

整體表現不錯。自動退款 12 筆超過了每日上限（10 筆），有 2 天觸發了轉人工。要調整什麼嗎？

---

## 完整流程只有 2 輪

這就是最輕量路徑的價值。
不需要 7-8 輪對話。不需要 Village Pack。不需要 Workflow。

---

## 萃取紀錄

### 從這個 walkthrough 學到什麼

1. **Mode C 可以在 1-2 輪結束** — conductor 不需要強制走完 EXPLORE → FOCUS → SETTLE 三階段
2. **TaskCard 是最小單位** — 只需 intent + inputs + success_condition
3. **Settlement 可以是「直接執行 + 回覆結果」** — 不需要生成 YAML 或 card
4. **Thyra API 作為數據源** — Völva 不自己算數據，而是查 Thyra 的 score/audit/loop API
5. **快速通道**：如果 intent 明確 + 無 ambiguity → 跳過 FOCUS 直接 SETTLE
6. **Conductor 需要「快速判斷」能力** — 不是所有對話都需要深度探索
7. **和前一輪對話的串接** — 使用者提到「退款超上限」時，Völva 可以主動問「要調整嗎？」，這時如果使用者說要，就會切換到 Mode A / W2 場景
