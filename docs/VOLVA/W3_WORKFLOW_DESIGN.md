# W3：組合 Skill + Pipeline 讓 Safety Chief 自動巡邏

## 場景

Midnight Market 營運者想讓 Safety Chief 自動巡邏。目前 Safety Chief 只有 rule-based 邏輯（流量 > 90% → 限流）。想要更完整的巡邏流程：掃描 → 分類 → 根據嚴重度不同處理。

## 覆蓋目標

- PipelineCard 組合（#61）
- Skill 不存在 → auto-create
- Pipeline branching（Karvi #507）
- Pipeline gate（Karvi #508）
- Karvi pipeline registration（V#64）

---

## 逐輪對話

### Turn 1 — 需求

```
用戶：「我想讓 Safety Chief 更聰明。不只是看流量，
  要能掃描各種違規，然後根據嚴重度處理。」

Völva：「好。我幫你設計一條巡邏 pipeline。

  你希望 Safety Chief 能偵測哪些問題？」
```

**Card**: PipelineCard created (draft)
**Strategy**: probe

### Turn 2 — 定義偵測範圍

```
用戶：「流量過熱、攤位違規（賣不符合主題的東西）、
  價格異常（疑似哄抬）、活動安全風險。」

Völva：「四類問題：
  1. 流量過熱（Zone load > 90%）
  2. 攤位違規（不符合世界觀）
  3. 價格異常（短時間大幅波動）
  4. 活動安全風險

  偵測到後怎麼處理？低風險和高風險一樣嗎？」

用戶：「低風險就警告，中等的限流，高風險直接 rollback + 通知我」
```

**Card**: PipelineCard updated (detection scope + severity handling)
**Strategy**: probe → confirm

### Turn 3 — Pipeline 設計

```
Völva：「我幫你組合這條 pipeline：

  ⚙️ safety-patrol pipeline:

  Step 1: 掃描（scan）
    → 用 safety-patrol skill 掃描四類問題

  Step 2: 分類（classify）
    → 判斷嚴重度：low / medium / high

  Step 3: 分支（branch）— 根據嚴重度走不同路
    ├── low → Step 4a: 警告（記錄 + 通知 chief）
    ├── medium → Step 4b: 限流（提案 law + apply）
    └── high → Step 4c: rollback + 通知你

  需要一個 safety-patrol skill，目前沒有。
  我幫你建？」

用戶：「建」
```

**Card**: PipelineCard finalized (5 steps with branching)
**Action**: Skill auto-create triggered

### Turn 4 — Skill 預覽

```
Völva：「📋 safety-patrol skill:

  角色：安全巡邏員
  任務：掃描 Midnight Market 的四類異常
  輸入：market state + zone metrics
  輸出：findings（location, type, severity, evidence）

  掃描邏輯：
  - Zone load > 90% → 流量過熱
  - Stall category 不符合 constitution rules → 攤位違規
  - Price change > 30% in 1 hour → 價格異常
  - Event risk score > 7 → 活動安全風險

  看起來對嗎？」

用戶：「價格那個改成 20%，其他可以」
```

**Strategy**: propose → 用戶修正 → update

### Turn 5 — 確認 + 綁定

```
Völva：「更新了。完整 pipeline：

  ⚙️ safety-patrol:
    scan(safety-patrol) → classify → branch:
      low → warn
      medium → limit(law.propose)
      high → rollback + alert

  🔧 新 skill：safety-patrol（價格異常門檻 20%）

  要綁到 Safety Chief 嗎？」

用戶：「綁」

Völva：
  → POST Thyra /api/skills（safety-patrol skill）
  → POST Karvi /api/pipelines（safety-patrol pipeline with branch）
  → PATCH Thyra /api/chiefs/{safety}（pipelines: ['safety-patrol']）

  「✅ Safety Chief 已綁定 safety-patrol pipeline。
   下一輪 governance cycle 就會用新流程巡邏。」
```

**Settlement**: skill + pipeline + chief binding，全部即時生效

---

## 覆蓋的系統功能

| 功能 | Turn | 對應 Issue |
|------|------|-----------|
| PipelineCard | 1-3 | V#61 |
| Skill auto-create | 3-4 | V#61 + V#63 |
| Pipeline branching | 3 | K#507 |
| Skill customization | 4 | V#61 |
| Karvi pipeline registration | 5 | V#64 |
| Chief pipeline binding | 5 | T#211 |
| 即時生效 | 5 | V#69 |
