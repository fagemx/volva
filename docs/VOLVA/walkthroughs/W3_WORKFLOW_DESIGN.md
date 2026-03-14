# W3：設計可重複的內容生成流程

## 場景

使用者想建一個「每週自動生成部落格文章」的流程。不是在建世界，而是在設計一套可重複的自動化做事方法。

## 覆蓋目標

- Mode B: Workflow Design Chat
- WorkflowCard lifecycle
- Settlement → Workflow Card（不是 Village Pack）
- 流程步驟 + skill 組合
- Thyra → Karvi dispatch 路徑

---

## 逐輪對話

### Turn 1

**Phase**: EXPLORE

**User**: 我想讓系統每週自動幫我生成一篇部落格文章

**Intent parsing**:
```json
{
  "type": "new_intent",
  "domain": "content_generation",
  "pattern": "recurring",
  "frequency": "weekly",
  "specificity": "low"
}
```

**Mode detection**: 這不是在建世界（沒有 rules/constitution/chief），是在設計流程 → Mode B

**Card type**: WorkflowCard

**Card update**:
```yaml
name: "週報文章生成"
purpose: "每週自動生成一篇部落格文章"
steps: []
confirmed:
  triggers:
    - "每週觸發"
  exit_conditions: []
  failure_handling: []
pending:
  - question: "文章的主題怎麼決定？AI 自選還是你指定？"
    context: "需要確認輸入來源"
version: 1
```

**Strategy**: mirror + probe

**Assistant**: 每週自動出一篇文章，了解。主題方面，你想每週指定題目，還是讓 AI 自己從某個來源找靈感？

---

### Turn 2

**Phase**: EXPLORE

**User**: 從我的產品更新紀錄裡自動找主題，然後生成草稿給我看，我確認後再發布

**Intent parsing**:
```json
{
  "type": "define_flow",
  "steps": [
    { "action": "extract_topics", "source": "product_changelog" },
    { "action": "generate_draft" },
    { "action": "human_review" },
    { "action": "publish" }
  ],
  "requires_human_approval": true
}
```

**Card update**:
```yaml
name: "週報文章生成"
purpose: "每週從產品更新自動生成部落格文章"
steps:
  - order: 1
    description: "從產品更新紀錄提取本週主題"
    skill: null
    conditions: "每週一觸發"
  - order: 2
    description: "根據主題生成文章草稿"
    skill: null
    conditions: null
  - order: 3
    description: "人工審核草稿"
    skill: null
    conditions: "等待人類確認"
  - order: 4
    description: "確認後發布到部落格"
    skill: null
    conditions: "人類批准後"
confirmed:
  triggers:
    - "每週一自動觸發"
  exit_conditions: []
  failure_handling: []
pending:
  - question: "草稿如果不滿意，要修改還是重新生成？"
    context: "需要定義失敗處理路徑"
  - question: "文章風格有偏好嗎？"
    context: "影響生成 prompt"
version: 2
```

**Phase transition**: EXPLORE → FOCUS（流程步驟已浮現）

**Strategy**: propose + probe

**Assistant**: 所以流程是：找主題 → 寫草稿 → 你審核 → 發布。四步。

如果草稿你不滿意，要 AI 重寫一版還是你自己改？

---

### Turn 3

**Phase**: FOCUS

**User**: 重寫，但最多重寫 2 次，再不行就我自己改

**Intent parsing**:
```json
{
  "type": "add_failure_handling",
  "rule": "retry_max_2",
  "fallback": "human_edit"
}
```

**Card update**:
```yaml
name: "週報文章生成"
purpose: "每週從產品更新自動生成部落格文章"
steps:
  - order: 1
    description: "從產品更新紀錄提取本週主題"
    skill: "topic_extractor"
    conditions: "每週一觸發"
  - order: 2
    description: "根據主題生成文章草稿"
    skill: "draft_writer"
    conditions: null
  - order: 3
    description: "人工審核草稿"
    skill: null
    conditions: "等待人類確認"
  - order: 3a
    description: "不滿意 → AI 重寫（最多 2 次）"
    skill: "draft_writer"
    conditions: "人類回饋 + 重試次數 < 2"
  - order: 3b
    description: "重寫仍不滿意 → 人工編輯"
    skill: null
    conditions: "重試次數 ≥ 2"
  - order: 4
    description: "確認後發布到部落格"
    skill: "blog_publisher"
    conditions: "人類批准後"
confirmed:
  triggers:
    - "每週一自動觸發"
  exit_conditions:
    - "文章成功發布"
    - "人工接手編輯"
  failure_handling:
    - "草稿不滿意：AI 重寫最多 2 次"
    - "2 次後仍不滿意：轉人工編輯"
pending:
  - question: "文章風格偏好？"
    context: "影響 draft_writer 的 prompt 設定"
version: 3
```

**Strategy**: confirm + probe（最後一個 pending）

**Assistant**: 好，最多重寫 2 次，還不行就你自己來。

文章風格有偏好嗎？例如技術向、行銷向、還是輕鬆科普？

---

### Turn 4

**Phase**: FOCUS

**User**: 技術向但不要太硬，適合一般開發者看

**Intent parsing**:
```json
{
  "type": "style_preference",
  "style": "technical_accessible",
  "audience": "general_developers"
}
```

**Card update**:
```yaml
# ... 前面不變 ...
confirmed:
  # ... 不變 ...
  failure_handling:
    - "草稿不滿意：AI 重寫最多 2 次"
    - "2 次後仍不滿意：轉人工編輯"
  style: "技術向但平易近人，目標讀者：一般開發者"
pending: []
version: 4
```

**Phase transition check**: pending 清空

**Strategy**: settle signal

**Assistant**: 確認完整流程：

1. 每週一：從產品更新找主題
2. AI 生成文章草稿（技術向、平易近人）
3. 你審核 → 不滿意可重寫最多 2 次
4. 確認後自動發布

要生成這個工作流設定嗎？

---

### Turn 5

**Phase**: FOCUS → **SETTLE**

**User**: 好

**Settlement Router 判斷**:
- 有 steps + triggers + exit_conditions → WORKFLOW
- 沒有 hard_rules / constitution → 不是 Village Pack

**Workflow Card 最終產出**:
```yaml
workflow:
  name: "weekly-blog-generator"
  purpose: "每週從產品更新自動生成部落格文章"
  trigger: "cron: 0 9 * * 1"  # 每週一 9:00

  steps:
    - id: "extract_topics"
      type: "skill_call"
      skill: "topic_extractor"
      input: { source: "product_changelog" }
      output: "topics"

    - id: "generate_draft"
      type: "skill_call"
      skill: "draft_writer"
      input: { topics: "$topics", style: "technical_accessible" }
      output: "draft"

    - id: "human_review"
      type: "human_approval"
      input: { draft: "$draft" }
      output: "review_result"
      timeout: "48h"

    - id: "retry_or_publish"
      type: "branch"
      condition: "$review_result"
      branches:
        approved: "publish"
        rejected:
          - if: "retry_count < 2"
            goto: "generate_draft"
          - else:
            type: "human_handoff"
            message: "2 次重寫仍不滿意，請人工編輯"

    - id: "publish"
      type: "skill_call"
      skill: "blog_publisher"
      input: { content: "$draft" }

  failure_handling:
    max_retries: 2
    fallback: "human_handoff"
```

**Thyra API 呼叫**:
- 這不直接是 Village Pack，而是 Workflow Card
- Völva 可以：
  1. 把 workflow 存在自己的 DB
  2. 透過 Thyra 註冊到某個 village 的 skill registry
  3. 觸發時透過 Thyra → Karvi dispatch

**Assistant**: 已生成「週報文章生成」工作流。要綁定到哪個 village 嗎？還是獨立運行？

---

## 萃取紀錄

### 從這個 walkthrough 學到什麼

1. **Mode detection** 很重要 — 這個對話完全不涉及世界設定，如果走 Village Pack 路徑就錯了
2. **WorkflowCard schema** 和 WorldCard 差異很大：steps 是核心，rules 不存在
3. **Workflow 的沉澱格式**不是 Village Pack YAML，是 Workflow Card YAML
4. **Workflow 和 Village 的關係**是「可選綁定」— 一個 workflow 可以屬於某個 village，也可以獨立
5. **Human-in-the-loop** 是 workflow 的常見模式，需要支援 `human_approval` step type
6. **Retry logic** 需要在 workflow 層面處理，不是 Thyra 治理層的事
7. **Skill** 在這裡是佔位符 — 實際的 topic_extractor、draft_writer 需要在 Karvi 側實作
8. **Völva 需要自己的 workflow 儲存**，不完全依賴 Thyra
