# W1：從零建客服 Village

## 場景

使用者想建一個自動化客服系統。他不懂工程語言，只知道自己想要什麼、怕什麼。

## 覆蓋目標

- Mode A: World Design Chat
- Conductor 全流程：EXPLORE → FOCUS → SETTLE
- WorldCard 完整 lifecycle
- Settlement → Village Pack
- Thyra API 呼叫

---

## 逐輪對話

### Turn 1

**Phase**: EXPLORE

**User**: 我想做一個自動化客服

**Intent parsing**:
```json
{
  "type": "new_intent",
  "domain": "customer_service",
  "specificity": "low",
  "signals": ["automation", "customer_service"]
}
```

**Card update**: 初始化 WorldCard
```yaml
goal: "自動化客服系統"
confirmed:
  hard_rules: []
  soft_rules: []
  must_have: []
  success_criteria: []
pending:
  - question: "客服需要處理哪些類型的問題？"
    context: "使用者只說了自動化客服，需要了解範圍"
chief_draft: null
budget_draft: null
current_proposal: null
version: 1
```

**Strategy**: mirror + probe

**Assistant**: 好的，自動化客服。你的客戶主要會問什麼類型的問題？例如產品諮詢、訂單查詢、故障排查？

---

### Turn 2

**Phase**: EXPLORE

**User**: 主要是產品介紹、庫存查詢，有時候會有退款問題

**Intent parsing**:
```json
{
  "type": "add_info",
  "capabilities": ["product_intro", "inventory_query", "refund_handling"],
  "signals": ["退款" → potential sensitive area]
}
```

**Card update**:
```yaml
goal: "自動化客服系統"
confirmed:
  hard_rules: []
  soft_rules: []
  must_have:
    - "產品介紹"
    - "庫存查詢"
    - "退款問題處理"
  success_criteria: []
pending:
  - question: "退款問題是全自動處理還是要人工？"
    context: "退款是高風險操作，需確認邊界"
chief_draft: null
budget_draft: null
current_proposal: null
version: 2
```

**Strategy**: mirror + probe（focused on risk area）

**Assistant**: 產品介紹、庫存查詢、退款問題，了解。退款這塊你希望 AI 全自動處理，還是要轉人工確認？

---

### Turn 3

**Phase**: EXPLORE → **FOCUS**（觸發條件：使用者表達出具體邊界）

**User**: 退款一定要轉人工，不能讓 AI 亂承諾

**Intent parsing**:
```json
{
  "type": "set_boundary",
  "enforcement": "hard",
  "rule": "退款必須轉人工",
  "emotion": "fear/caution"
}
```

**Card update**:
```yaml
goal: "自動化客服系統"
confirmed:
  hard_rules:
    - "退款問題必須轉人工處理，AI 不可自行承諾或處理退款"
  soft_rules: []
  must_have:
    - "產品介紹"
    - "庫存查詢"
    - "退款問題處理（轉人工）"
  success_criteria: []
pending:
  - question: "除了退款，還有什麼情況需要轉人工？"
    context: "確認轉人工邊界的完整性"
chief_draft: null
budget_draft: null
current_proposal: null
version: 3
```

**Phase transition**: EXPLORE → FOCUS
- 理由：出現第一條 hard_rule + must_have 累積 3 項

**Strategy**: mirror（確認聽懂了）+ propose（給 baseline）

**Assistant**: 收到，退款一定轉人工，AI 絕對不能自己做退款決定。

除了退款之外，還有什麼情況你覺得應該轉人工？例如客戶很生氣、或問題太複雜的時候？

---

### Turn 4

**Phase**: FOCUS

**User**: 客戶情緒激動的時候也要轉，然後技術問題太複雜的也要

**Intent parsing**:
```json
{
  "type": "add_boundaries",
  "rules": [
    { "description": "客戶情緒激動時轉人工", "enforcement": "hard" },
    { "description": "複雜技術問題轉人工", "enforcement": "soft" }
  ]
}
```

**Card update**:
```yaml
goal: "自動化客服系統"
confirmed:
  hard_rules:
    - "退款問題必須轉人工處理，AI 不可自行承諾或處理退款"
    - "客戶情緒激動時必須轉人工"
  soft_rules:
    - "複雜技術問題建議轉人工"
  must_have:
    - "產品介紹"
    - "庫存查詢"
    - "退款問題處理（轉人工）"
    - "情緒偵測"
  success_criteria: []
pending:
  - question: "庫存資料的即時性要求？"
    context: "庫存查詢需要 API，延遲影響體驗"
chief_draft: null
budget_draft: null
current_proposal: "先上線三個能力：產品介紹（FAQ）、庫存查詢（API）、基礎排查（決策樹）"
version: 4
```

**Strategy**: propose

**Assistant**: 好，所以規則是：退款和情緒激動一定轉人工，複雜技術問題盡量轉。

我先假設一個 v0 方案：
- 產品介紹：用 FAQ + 產品資料
- 庫存查詢：接庫存 API
- 基礎排查：簡單決策樹

不符合規則的都轉人工。這樣可以嗎？

---

### Turn 5

**Phase**: FOCUS

**User**: 可以，但庫存資料不要太舊，延遲最多 5 分鐘

**Intent parsing**:
```json
{
  "type": "confirm_with_constraint",
  "confirmed": "v0 方案",
  "constraint": { "inventory_delay_max": "5 minutes" }
}
```

**Card update**:
```yaml
goal: "自動化客服系統"
confirmed:
  hard_rules:
    - "退款問題必須轉人工處理，AI 不可自行承諾或處理退款"
    - "客戶情緒激動時必須轉人工"
  soft_rules:
    - "複雜技術問題建議轉人工"
    - "庫存資料延遲不超過 5 分鐘"
  must_have:
    - "產品介紹（FAQ + 產品資料）"
    - "庫存查詢（API，≤5min 延遲）"
    - "基礎排查（決策樹）"
    - "情緒偵測"
    - "不符規則 → 轉人工"
  success_criteria: []
pending:
  - question: "客服的語氣風格？"
    context: "使用者說過不要太機器人，需具體化"
chief_draft: null
budget_draft: null
current_proposal: null
version: 5
```

**Strategy**: confirm + probe（風格）

**Assistant**: 確認：庫存最多 5 分鐘延遲。v0 方案沒問題。

客服的說話風格你有什麼偏好嗎？例如很正式、還是比較親切隨性？

---

### Turn 6

**Phase**: FOCUS

**User**: 親切一點，但不要太隨便，專業但有溫度

**Intent parsing**:
```json
{
  "type": "style_preference",
  "style": "warm_professional",
  "signals": ["親切", "不要太隨便", "專業", "有溫度"]
}
```

**Card update**:
```yaml
goal: "自動化客服系統"
confirmed:
  hard_rules:
    - "退款問題必須轉人工處理，AI 不可自行承諾或處理退款"
    - "客戶情緒激動時必須轉人工"
  soft_rules:
    - "複雜技術問題建議轉人工"
    - "庫存資料延遲不超過 5 分鐘"
  must_have:
    - "產品介紹（FAQ + 產品資料）"
    - "庫存查詢（API，≤5min 延遲）"
    - "基礎排查（決策樹）"
    - "情緒偵測"
    - "不符規則 → 轉人工"
  success_criteria:
    - "客戶滿意度 > 80%"
chief_draft:
  name: "客服助手"
  role: "customer_support"
  style: "專業但有溫度，親切不隨便"
budget_draft: null
current_proposal: null
pending: []
version: 6
```

**Phase transition check**: pending 清空 → 準備進入 SETTLE

**Strategy**: confirm + settle signal

**Assistant**: 專業有溫度，了解。

到目前為止確認了：
- 三個核心能力：產品介紹、庫存查詢、基礎排查
- 兩條硬規則：退款和情緒激動必轉人工
- 風格：專業有溫度

看起來基本規則都定了。要我幫你生成這個客服 village 的設定嗎？

---

### Turn 7

**Phase**: FOCUS → **SETTLE**

**User**: 好，生成吧

**Intent parsing**:
```json
{
  "type": "settle_signal",
  "confirmed": true
}
```

**Phase transition**: FOCUS → SETTLE

**Settlement Router 判斷**:
- 包含 hard_rules + soft_rules + chief_draft → VILLAGE_PACK
- 分流目標：Village Pack

**Card final snapshot**: version 6（無變更）

**Village Pack 生成**:
```yaml
village:
  name: "自動客服 Village"
  target_repo: "customer-service"

constitution:
  rules:
    - description: "退款問題必須轉人工處理，AI 不可自行承諾或處理退款"
      enforcement: hard
      scope: ["refund"]
    - description: "客戶情緒激動時必須轉人工"
      enforcement: hard
      scope: ["*"]
    - description: "複雜技術問題建議轉人工"
      enforcement: soft
      scope: ["tech_support"]
    - description: "庫存資料延遲不超過 5 分鐘"
      enforcement: soft
      scope: ["inventory"]
  allowed_permissions:
    - dispatch_task
    - propose_law
  budget_limits:
    max_cost_per_action: 5
    max_cost_per_day: 200
    max_cost_per_loop: 50

chief:
  name: "客服助手"
  role: "customer_support"
  personality: "專業但有溫度，親切不隨便"
  permissions:
    - dispatch_task
    - propose_law

skills:
  - name: "product_faq"
    type: "retrieval"
    description: "產品介紹與 FAQ 查詢"
  - name: "inventory_check"
    type: "api_call"
    description: "庫存即時查詢（≤5min 延遲）"
  - name: "basic_troubleshoot"
    type: "decision_tree"
    description: "基礎故障排查"
  - name: "escalate_human"
    type: "handoff"
    description: "轉人工處理"

laws: []
```

**Thyra API 呼叫**:
```
POST http://localhost:3462/api/villages
  → village created

POST http://localhost:3462/api/villages/:id/constitutions
  → constitution created

POST http://localhost:3462/api/villages/:id/chiefs
  → chief created

POST http://localhost:3462/api/skills
  → 4 skills created
```

或使用 Village Pack compiler:
```
volva → 生成 YAML → thyra pack apply customer-service-village.yaml
```

**Strategy**: settle（展示結果）

**Assistant**: 已生成客服 village 設定。包含：

**規則**：
- 退款必轉人工（硬規則）
- 情緒激動必轉人工（硬規則）
- 複雜技術問題建議轉人工（軟規則）

**角色**：客服助手 — 專業有溫度

**能力**：產品介紹、庫存查詢、基礎排查、轉人工

要套用到系統嗎？

---

### Turn 8

**Phase**: SETTLE

**User**: 套用

**Settlement execution**:
- Völva 呼叫 Thyra API 或 Village Pack compiler
- 記錄 settlement 結果

**Card**: archived, 標記為 settled

**Assistant**: 已套用。客服 Village 已建立在 Thyra 上。

你可以之後隨時回來調整規則。還有其他想法嗎？

---

## 萃取紀錄

### 從這個 walkthrough 學到什麼

1. **WorldCard schema** 需要 `chief_draft` 和 `budget_draft` 欄位
2. **EXPLORE → FOCUS** 的觸發條件：出現 hard_rule + must_have ≥ 3
3. **FOCUS → SETTLE** 的觸發條件：pending 清空 + 使用者明確同意
4. **Settlement Router**：有 hard_rules + chief_draft → VILLAGE_PACK
5. **LLM prompt** 需要區分：情緒信號（怕、不要）vs 功能信號（需要、想要）
6. **Village Pack 生成**：短卡到 YAML 的映射規則需要明確定義
7. **Thyra API 呼叫順序**：village → constitution → chief → skills
8. **Budget**：使用者沒提到預算 → 用系統預設值，不強問
