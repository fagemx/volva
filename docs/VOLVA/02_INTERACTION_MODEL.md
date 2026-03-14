# Völva — 互動模型

## 四層互動模型

```
L1  直覺聊天        使用者用生活語言表達
L2  隱性結構化      系統背後映射心智/概念/操作模型
L3  短卡            可對焦、可回看的工作記憶卡
L4  沉澱            穩定的產出物：Village Pack / Workflow / Task
```

L1-L2 對使用者不可見。
L3 對使用者可見但不打斷（side panel）。
L4 只在東西穩定後才出現。

---

## Conductor 狀態機

對話導演管理每段對話的節奏。三個主要階段：

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ EXPLORE  │────→│  FOCUS   │────→│ SETTLE   │
│ 探索      │←────│  對焦    │←────│  沉澱    │
└──────────┘     └──────────┘     └──────────┘
     ↑                                  │
     └──────────────────────────────────┘
                 （繼續聊天）
```

### EXPLORE（探索）

使用者還在表達、還在想。

Conductor 行為：
- 鏡像理解（重述確認）
- 開放式追問（不超過 1 個問題/輪）
- 不做提案
- 背後開始建立短卡草稿

觸發 → FOCUS 條件：
- 短卡累積 3+ 已確認項目
- 使用者表達出具體期望或邊界
- 使用者主動問「怎麼做」

### FOCUS（對焦）

已有初步方向，開始具體化。

Conductor 行為：
- 提出 baseline 方案
- 每輪一個小提案 + 一個可逆確認
- 更新短卡：已確認 / 待確認
- 開始區分「世界級設定」vs「功能級需求」

觸發 → SETTLE 條件：
- 短卡中「待確認」清空
- 使用者明確表示「就這樣」或「可以了」
- 連續 2 輪無新增修改

觸發 → EXPLORE 條件（回退）：
- 使用者提出新的大方向
- 使用者推翻之前的核心假設

### SETTLE（沉澱）

方案穩定，準備產出。

Conductor 行為：
- 展示最終短卡摘要
- 確認沉澱目標（Village Pack / Workflow / Task）
- 生成產出物草稿
- 使用者確認後呼叫 Thyra API

觸發 → EXPLORE 條件（新循環）：
- 沉澱完成，使用者開始聊新話題
- 使用者想修改剛沉澱的內容

---

## 短卡 Schema

短卡是對話過程中持續更新的結構化摘要。
不同類型的對話產生不同類型的短卡。

### WorldCard（世界設定卡）

用於建立或修改 Village。

```typescript
interface WorldCard {
  // 目標
  goal: string | null;

  // 已確認邊界
  confirmed: {
    hard_rules: string[];      // 絕對不能做的事
    soft_rules: string[];      // 最好不要做的事
    must_have: string[];       // 一定要有的能力
    success_criteria: string[];// 什麼叫做成功
  };

  // 待確認
  pending: {
    question: string;
    context: string;
  }[];

  // 角色草稿
  chief_draft: {
    name: string | null;
    role: string | null;
    style: string | null;      // 使用者描述的風格
  } | null;

  // 預算草稿
  budget_draft: {
    per_action: number | null;
    per_day: number | null;
  } | null;

  // 當前提案
  current_proposal: string | null;

  // 版本
  version: number;
}
```

### WorkflowCard（流程卡）

用於設計可重複流程。

```typescript
interface WorkflowCard {
  // 流程名稱與目的
  name: string | null;
  purpose: string | null;

  // 已確認步驟
  steps: {
    order: number;
    description: string;
    skill: string | null;      // 對應的 skill（如果已知）
    conditions: string | null; // 觸發條件
  }[];

  // 邊界
  confirmed: {
    triggers: string[];        // 什麼情況啟動
    exit_conditions: string[]; // 什麼情況結束
    failure_handling: string[];// 失敗怎麼辦
  };

  // 待確認
  pending: {
    question: string;
    context: string;
  }[];

  // 版本
  version: number;
}
```

### TaskCard（任務卡）

用於單次任務。最輕量。

```typescript
interface TaskCard {
  // 任務描述
  intent: string;

  // 輸入
  inputs: Record<string, string>;

  // 約束
  constraints: string[];

  // 成功條件
  success_condition: string | null;

  // 版本
  version: number;
}
```

---

## Settlement Router（沉澱分流器）

分流器根據短卡內容判斷沉澱目標：

### 規則

```
IF 短卡包含 hard_rules / soft_rules / chief_draft / budget_draft
   AND 使用者談論的是世界的根本法（目標、邊界、角色、預算）
→ VILLAGE_PACK

IF 短卡包含 steps / triggers / exit_conditions
   AND 使用者談論的是可重複的做事方法
→ WORKFLOW

IF 短卡只有 intent + inputs + constraints
   AND 使用者談論的是一次性工作
→ TASK

IF 以上都不明確
→ 留在短卡，繼續聊
```

### 判斷問句

系統內部可用一句話做分界：

> **這次對話在改的是「世界根本法」，還是「世界裡的一次行動」？**

- 世界根本法 → Village Pack
- 一次行動的方法 → Workflow
- 一次行動本身 → Task

---

## 對話模式

### Mode A：World Design Chat

目的：建立或修改世界設定。
預期產出：Village Pack。

使用者會說的話：
- 「我想做一個自動化客服」
- 「這個客服不要太機器人」
- 「退款一定轉人工」
- 「最近客服退款太多，要調規則」

### Mode B：Workflow Design Chat

目的：設計可重複流程。
預期產出：Workflow Card → Runtime Contract。

使用者會說的話：
- 「每次發文前要先 AI 審核再人工確認」
- 「客訴進來先分類再派給對的人」
- 「這個流程要加一個 AI 預篩步驟」

### Mode C：Task Chat

目的：完成單次任務。
預期產出：Task Card → 直接執行。

使用者會說的話：
- 「幫我查一下上週客服數據」
- 「幫我生成一版商品文案」
- 「分析一下這個 API 的回應格式」

Conductor 在 EXPLORE 階段判斷 mode，之後短卡 schema 隨之確定。

---

## 每輪對話的處理流程

```
User message
  ↓
1. LLM intent parsing
   → 理解這輪使用者在說什麼
   → 分類：新資訊 / 確認 / 修改 / 提問 / 結束信號
  ↓
2. Card update
   → 根據 intent 更新短卡
   → 記錄 diff（什麼變了）
  ↓
3. Conductor rhythm check
   → 當前階段是否該轉換？
   → 決定這輪的回覆策略：鏡像 / 提案 / 確認 / 沉澱
  ↓
4. Response generation
   → LLM 根據策略生成回覆
   → 回覆包含：理解確認 + 下一步引導
  ↓
5. SSE stream to client
```

---

## Conductor 回覆策略

| 策略 | 說明 | 範例 |
|------|------|------|
| mirror | 重述理解，確認沒聽錯 | 「所以你的意思是退款一律要人工確認，對嗎？」 |
| probe | 輕量追問，挖更多 | 「庫存延遲 5 分鐘可以接受嗎？」 |
| propose | 提出具體小提案 | 「先假設退款轉人工、庫存每 5 分鐘同步，這樣 OK？」 |
| confirm | 確認已收斂的結論 | 「到目前為止確認了這三條規則，要繼續嗎？」 |
| settle | 準備沉澱 | 「看起來基本規則都定了，要生成 Village Pack 嗎？」 |
| redirect | 引導回主題 | 「這個想法很好，不過先把客服規則定完？」 |
