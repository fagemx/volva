# W1：從零建 Midnight Market

## 場景

使用者想開一個 AI 自治營運的夜市。他有大方向，但沒有具體規劃。Völva 帶他走完「8 步場館組建」。

## 覆蓋目標

- Conductor 全流程：EXPLORE → FOCUS → SETTLE
- 8 Cards：World + Evaluator + Org + Pipeline + Adapter + Commerce + LLM
- Skill auto-create（需要的 skill 不存在 → 提議建立）
- Settlement → Thyra pack/apply + Karvi pipeline registration
- 完成後世界上線，chiefs 開始自動運行

---

## 逐輪對話

### Turn 1 — 開場

```
用戶：「我想開一個夜市，讓 AI 幫我經營」

Völva：「好，我幫你建。先告訴我幾件事：
  - 這個夜市叫什麼？
  - 大概什麼風格？（創作者市集？美食夜市？復古二手？）
  - 你最在意什麼？（人氣？秩序？世界觀一致？）」
```

**Phase**: EXPLORE
**Card**: WorldCard created (draft)
**Strategy**: probe（挖需求）

### Turn 2 — 定名字和方向

```
用戶：「叫 Midnight Market，創作者市集，有手作、插畫、古著。
  我在意世界觀一致性，不要亂七八糟的東西進來。」

Völva：「Midnight Market，創作者夜市。世界觀一致性是首要。

  我先記下：
  ✅ 名稱：Midnight Market
  ✅ 風格：創作者市集（手作、插畫、古著）
  ✅ 首要：世界觀一致性

  接著幫你定底線規則 — 什麼事情絕對不能發生？」
```

**Phase**: EXPLORE → FOCUS
**Card**: WorldCard updated (name, description, priority)
**Strategy**: mirror（確認理解）→ probe（挖底線）

### Turn 3 — 定 Constitution 規則

```
用戶：「不能通膨失控、不能破壞世界觀、新手不能一來就流失、
  安全最重要 — 有問題的攤位要能立刻處理。」

Völva：「四條底線規則：
  1. 單次價格調整不超過當前值 50%
  2. 所有攤位和活動必須符合創作者夜市風格
  3. 新手引導不可跳過
  4. 危及安全的提案自動拒絕

  預算方面，每個動作上限多少？每天總共多少？」
```

**Phase**: FOCUS
**Card**: WorldCard.constitution updated (rules)
**Strategy**: propose（具體化規則）→ probe（挖預算）

### Turn 4 — 定預算 + Evaluator

```
用戶：「每個動作不超過 $5，每天不超過 $200。
  另外，活動不要太多，每晚最多 3 場。」

Völva：「好。預算和品質標準：

  💰 預算：
  - 單次上限：$5
  - 每日上限：$200

  📊 品質標準（超過就要人工確認）：
  - 活動頻率：每晚 ≤ 3 場
  - 價格波動 > 50% → 需要你確認

  接下來設定誰來管這個夜市 — 你需要幾個管理角色？」
```

**Phase**: FOCUS
**Cards**: WorldCard.budget + EvaluatorCard created
**Strategy**: confirm → probe（進入組織設計）

### Turn 5 — 定 Chiefs 組織

```
用戶：「需要管排位的、管活動的、管安全的、管價格的、還有管世界觀的。」

Völva：「5 個 Chiefs：

  🤵 Market Chief — 攤位排位、補位
  🎩 Event Chief — 活動節奏、檔期
  💰 Economy Chief — 價格、供需、抽成
  👮 Safety Chief — 限流、風險、秩序（優先級最高）
  🎨 Brand Chief — 世界觀一致性

  執行順序：Safety 先 → Economy → Brand → Event → Market

  要調整嗎？還是定這樣？」
```

**Phase**: FOCUS
**Card**: OrgCard created (5 chiefs + priority order)
**Strategy**: propose → confirm

### Turn 6 — 定 Pipelines

```
用戶：「定這樣。他們各自怎麼工作？」

Völva：「我幫每個 Chief 配工作流程：

  👮 Safety Chief:
    掃描違規 → 分類嚴重度 → 嚴重就 rollback → 不嚴重就警告
    （需要新 skill：safety-patrol，我幫你建？）

  💰 Economy Chief:
    讀市場數據 → 分析供需 → 提案調價 → 超過門檻先模擬再執行

  🎩 Event Chief:
    檢查活動數量 → 不足就提案新活動

  🎨 Brand Chief:
    掃描新內容 → 比對世界觀 → 不合就標記

  🤵 Market Chief:
    讀攤位數據 → 排名 → 調整位置

  其中 safety-patrol 和 brand-review 是新 skill，
  我幫你建。看一下內容？」

用戶：「好，建吧」
```

**Phase**: FOCUS
**Cards**: PipelineCard ×5 created + 2 new skills auto-generated
**Strategy**: propose（完整方案）

### Turn 7 — Skill 預覽 + 確認

```
Völva：「兩個新 skill：

  📋 safety-patrol:
    掃描攤位和區域異常
    分類嚴重度（low/medium/high）
    產出處置建議

  📋 brand-review:
    比對內容與世界觀設定
    標記不一致的元素
    產出審核結果

  確認建立？」

用戶：「確認」
```

**Cards**: Skills registered to Thyra
**Strategy**: confirm

### Turn 8 — 定平台 + 商業 + LLM

```
Völva：「最後三件事：

  📡 平台：你的夜市要出現在哪？
  - X（發預告和 spotlight）
  - Discord（即時通知和互動）
  - 自有網頁（主場）

  💳 商品：
  - 攤位租金：主街 $100、側巷 $50
  - 活動門票
  - 熱門攤位漲 20%

  🤖 AI 等級：
  - 💰 經濟（全用快速模型，~$2/晚）
  - ⚖️ 平衡（日常快速 + 重要用強，~$5/晚）← 推薦
  - 🚀 全力（全用強模型，~$15/晚）」

用戶：「X + Discord + 自有頁。攤位定價可以。AI 用平衡。」
```

**Phase**: FOCUS → SETTLE signal
**Cards**: AdapterCard + CommerceCard + LLM preset set
**Strategy**: propose（打包最後設定）

### Turn 9 — Settlement 確認

```
Völva：「全部設定好了。確認一下：

  🏮 Midnight Market — 創作者夜市

  📜 規則：4 條底線
  📊 品質：活動 ≤3/晚、價格波動 < 50%

  👥 Chiefs：5 人
     Safety → Economy → Brand → Event → Market

  ⚙️ Pipelines：5 條（含 branching + gate）
  🔧 Skills：7 個（5 現有 + 2 新建）

  📡 平台：X + Discord + 自有頁
  💳 商品：主街 $100、側巷 $50、熱門 +20%
  🤖 AI：平衡模式（~$5/晚）

  建立嗎？」

用戶：「建立」
```

**Phase**: SETTLE
**Settlement**:
1. POST Thyra /api/villages/pack/apply → 建立世界
2. POST Thyra /api/skills ×2 → 註冊新 skills
3. POST Karvi /api/pipelines ×5 → 註冊 pipelines
4. Adapter + Commerce config 寫入

### Turn 10 — 完成

```
Völva：「✅ Midnight Market 上線了。

  🏮 5 個 Chiefs 已就位
  ⚙️ 第一輪 governance cycle 將在 15 分鐘後開始

  你可以：
  - 打開 dashboard 看世界運行
  - 隨時回來跟我對話調整
  - 今晚就會有第一份 Morning Summary

  祝開張順利。」
```

**Phase**: complete
**Result**: 世界上線，chiefs 自動運行

---

## 覆蓋的系統功能

| 功能 | Turn | 對應 Issue |
|------|------|-----------|
| WorldCard | 1-3 | 已有 |
| Constitution | 3-4 | 已有 |
| EvaluatorCard | 4 | V#65 |
| OrgCard | 5 | V#62 |
| PipelineCard | 6 | V#61 |
| Skill auto-create | 6-7 | V#61 + V#63 |
| AdapterCard | 8 | V#66 |
| CommerceCard | 8 | V#67 |
| LLM preset | 8 | V#68 |
| Settlement | 9-10 | V#46 + V#64 |
