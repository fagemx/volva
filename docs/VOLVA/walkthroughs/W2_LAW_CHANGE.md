# W2：對既有 Village 變更規則

## 場景

使用者的客服 village 已運行一段時間，發現退款轉人工的規則太嚴格，想放寬為「小額退款 AI 可以自動處理」。

## 覆蓋目標

- Mode A: World Design Chat（修改世界根本法）
- Conductor：EXPLORE 較短，快速進入 FOCUS
- WorldCard 增量更新（不是從零開始）
- Settlement → Village Pack（constitution supersede）
- Thyra API：supersede constitution

---

## 逐輪對話

### Turn 1

**Phase**: EXPLORE

**User**: 客服最近退款轉人工太多了，小額的其實可以讓 AI 自己處理

**Intent parsing**:
```json
{
  "type": "modify_rule",
  "target": "existing hard_rule about refund",
  "direction": "relax",
  "condition": "小額",
  "context_village": "customer-service"
}
```

**Card update**: 載入既有 village 狀態 + 標記變更意圖
```yaml
goal: "調整退款規則 — 小額可自動處理"
confirmed:
  hard_rules:
    - "[現有] 客戶情緒激動時必須轉人工"
    - "[變更中] 退款問題必須轉人工 → 使用者想放寬"
  soft_rules:
    - "[現有] 複雜技術問題建議轉人工"
    - "[現有] 庫存資料延遲不超過 5 分鐘"
  must_have: []  # 無新增能力需求
  success_criteria: []
pending:
  - question: "小額的定義是多少？"
    context: "使用者想放寬退款規則，需要明確金額門檻"
chief_draft: null
budget_draft: null
current_proposal: null
version: 1
```

**Strategy**: mirror + probe

**Assistant**: 了解，你覺得小額退款不需要每次都轉人工。「小額」大概是多少以下？例如 100 元、500 元？

---

### Turn 2

**Phase**: EXPLORE → **FOCUS**

**User**: 200 元以下的讓 AI 直接退就好

**Intent parsing**:
```json
{
  "type": "set_threshold",
  "rule": "refund",
  "threshold": 200,
  "currency": "inferred_default",
  "action": "AI 可自動處理"
}
```

**Card update**:
```yaml
goal: "調整退款規則 — ≤200 元可自動處理"
confirmed:
  hard_rules:
    - "[現有] 客戶情緒激動時必須轉人工"
    - "[新] 退款 > 200 元必須轉人工"
  soft_rules:
    - "[現有] 複雜技術問題建議轉人工"
    - "[現有] 庫存資料延遲不超過 5 分鐘"
    - "[新] 退款 ≤ 200 元 AI 可自動處理，但需記錄"
  must_have: []
  success_criteria: []
pending:
  - question: "自動退款需要記錄或通知嗎？"
    context: "放寬規則需要配套的可追蹤性"
chief_draft: null
budget_draft: null
current_proposal: "退款 ≤200 自動處理（含記錄）；>200 轉人工"
version: 2
```

**Phase transition**: EXPLORE → FOCUS（具體邊界出現）

**Strategy**: propose

**Assistant**: 好，200 元以下 AI 自動退。那我建議這樣：

- ≤ 200 元：AI 直接處理，自動記錄到日誌
- \> 200 元：照舊轉人工

自動退款要不要同時通知你？

---

### Turn 3

**Phase**: FOCUS

**User**: 不用通知，記錄就好，但每天不能超過 10 筆自動退款

**Intent parsing**:
```json
{
  "type": "add_constraint",
  "rule": "auto_refund_daily_limit",
  "value": 10,
  "type": "hard"
}
```

**Card update**:
```yaml
goal: "調整退款規則 — ≤200 元可自動處理"
confirmed:
  hard_rules:
    - "[現有] 客戶情緒激動時必須轉人工"
    - "[新] 退款 > 200 元必須轉人工"
    - "[新] 每日自動退款上限 10 筆，超過轉人工"
  soft_rules:
    - "[現有] 複雜技術問題建議轉人工"
    - "[現有] 庫存資料延遲不超過 5 分鐘"
    - "[新] 退款 ≤ 200 元 AI 可自動處理，自動記錄"
  must_have: []
  success_criteria: []
pending: []
chief_draft: null
budget_draft: null
current_proposal: null
version: 3
```

**Phase transition check**: pending 清空

**Strategy**: confirm + settle signal

**Assistant**: 確認規則變更：
1. ≤ 200 元：AI 自動退款，記錄日誌
2. \> 200 元：轉人工
3. 每天最多 10 筆自動退款，超過也轉人工

這會修改你客服 village 的憲法。要套用嗎？

---

### Turn 4

**Phase**: FOCUS → **SETTLE**

**User**: 好

**Settlement Router**: VILLAGE_PACK（修改 constitution）

**Constitution supersede diff**:
```diff
 rules:
-  - description: "退款問題必須轉人工處理，AI 不可自行承諾或處理退款"
-    enforcement: hard
-    scope: ["refund"]
+  - description: "退款 > 200 元必須轉人工處理"
+    enforcement: hard
+    scope: ["refund"]
+  - description: "退款 ≤ 200 元 AI 可自動處理，自動記錄到日誌"
+    enforcement: soft
+    scope: ["refund"]
+  - description: "每日自動退款上限 10 筆，超過自動轉人工"
+    enforcement: hard
+    scope: ["refund"]
```

**Thyra API 呼叫**:
```
POST /api/villages/:id/constitutions/supersede
  → old constitution revoked
  → new constitution created with updated rules
```

注意：THY-01 — Constitution 不可修改，只能 revoke + supersede。

**Assistant**: 已更新客服 village 憲法。舊規則已封存，新規則生效：

- 小額退款（≤200）AI 自動處理 + 記錄
- 大額退款（>200）轉人工
- 每日上限 10 筆自動退款

還有其他要調整的嗎？

---

## 萃取紀錄

### 從這個 walkthrough 學到什麼

1. **修改既有 village 時**，WorldCard 需要載入現有狀態並標記 `[現有]` vs `[新]` vs `[變更中]`
2. **EXPLORE 階段很短** — 使用者已經知道要改什麼，只需確認細節
3. **Constitution supersede** 是特殊操作，Völva 需要：
   - 知道現有 constitution 的 rules
   - 生成 diff（不是全新 Village Pack）
   - 呼叫 supersede API，不是 create
4. **安全提醒**：放寬 hard_rule 時 conductor 應該多確認一次
5. **日限額**這種規則需要 Thyra 的 budget 機制支持，不只是 constitution rule
6. **Thyra API 需求**：需要能查詢現有 constitution 的 API（GET /api/villages/:id/constitutions/active）
