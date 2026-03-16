# W4：監控 + 介入 — Operator Dashboard 使用

## 場景

Midnight Market 第 5 晚。營運者打開 operator dashboard，看到世界在運行。中途 Zone B 過熱，需要介入。

## 覆蓋目標

- Operator Dashboard（#233）
- Rive 場景視覺化（#239 + #240）
- Live Timeline（#234）
- Alert system（#236）
- Intervention Panel（#235）
- Morning Summary

---

## 使用流程

### 場景 1 — 打開 Dashboard

```
營運者打開 http://localhost:5173/operator

看到：

┌──────────────────────────────────────────────┐
│  🏮 Midnight Market                 ● Live   │
│                                               │
│  ╔═══════════════════════════════════════╗    │
│  ║                                       ║    │
│  ║    Rive 夜市鳥瞰場景                  ║    │
│  ║                                       ║    │
│  ║    主街攤位在發光（glow 動畫）         ║    │
│  ║    Economy Chief 在主街慢慢走          ║    │
│  ║    Safety Chief 在側巷觀察             ║    │
│  ║    舞台區有活動光暈                    ║    │
│  ║                                       ║    │
│  ╚═══════════════════════════════════════╝    │
│                                               │
│  ── 74.6 ── World Health（在呼吸）           │
│                                               │
│  Chiefs:                                      │
│  🟢 Economy   idle     5 min ago              │
│  🔵 Safety    running  observing Zone B       │
│  🟢 Event     idle     12 min ago             │
│  🟢 Brand     idle     8 min ago              │
│  🟢 Market    idle     3 min ago              │
└──────────────────────────────────────────────┘
```

**感受**：一眼看到世界在動。Chiefs 在場景裡各自活動。數字在呼吸。
```

### 場景 2 — 看 Timeline

```
營運者滑到 timeline：

── 時間軸 ──────────────────────────
21:00  ● 現在
20:45  ▪ Market Chief 重新排位
         → 手作皮革升到主街 #1
         → 古著移到 #3
         → Judge: ✅
20:30  ▪ Economy Chief 降價嘗試
         → 主街租金 -8%
         → Judge: ✅（在 evaluator 門檻內）
         → Health: 74.2 → 74.6 (+0.4)
20:15  ▪ Event Chief 提案限時拍賣
         → Judge: ✅
         → 舞台區活動開始
20:00  ▪ Governance Cycle #32 started
         → 5 chiefs, duration: 6.2s, cost: $0.004

點「Economy Chief 降價嘗試」展開：
  What: 主街租金從 $108 降到 $100（-8%）
  Why: 出租率 72%，目標 80%（goal: 提升出租率）
  Judge: 4 層全通過
  Precedent: 「3 天前降 10% → 出租率 +5%」（Edda）
  Effect: Health +0.4，出租率預計 +2%
  Cost: $0.001（Haiku，1 call）
```

### 場景 3 — Alert 出現

```
21:15 — Rive 場景中 Zone B 開始閃紅

Alert banner 出現：
  ⚠️ Zone B 人流 94%（超過 90% 門檻）— Safety Chief 監控中

Timeline 更新：
  21:15  ⚠️ Safety Chief 偵測 Zone B 過熱
         → severity: medium
         → 提案：Zone B 限流 -30%
         → Judge: ✅
         → Applied

Rive 場景更新：
  Safety Chief 角色走到 Zone B
  Zone B 亮度降低（限流中）
  人流粒子開始從 Zone B 分散
```

### 場景 4 — 營運者介入

```
營運者覺得限流不夠，想要更強的動作。

打開 Intervention Panel：

┌─ Intervention ─────────────────┐
│                                 │
│  🔴 Emergency Stop  [停止所有]  │
│                                 │
│  Chiefs:                        │
│  ├ Economy  🟢 [暫停]          │
│  ├ Safety   🔵 [暫停]          │
│  ├ Event    🟢 [暫停]          │  ← 營運者點這個
│  ├ Brand    🟢 [暫停]          │
│  └ Market   🟢 [暫停]          │
│                                 │
│  Recent Changes:                │
│  ├ 限流 Zone B (21:15) [Rollback]│
│  └ 降價 -8% (20:30) [Rollback] │
└─────────────────────────────────┘

營運者：暫停 Event Chief（減少活動壓力）

確認對話：
  「暫停 Event Chief？目前有 1 個進行中的活動。」
  [確認] [取消]

營運者：[確認]
  → Event Chief 暫停
  → Rive 場景：Event Chief 角色走到休息區，半透明

營運者：Rollback 限時拍賣活動
  確認對話：
  「回退到 20:14 的狀態？這會取消限時拍賣。」
  [確認] [取消]

營運者：[確認]
  → Rollback applied
  → 舞台區活動光暈消失
  → Health: 74.6 → 73.8（活動取消，少了人氣）
  → Timeline: 「營運者手動 rollback 限時拍賣」
```

### 場景 5 — Morning Summary

```
隔天早上，營運者打開 summary page：

┌─ Morning Summary: 第 5 晚 ────────────┐
│                                         │
│  📊 數據                                │
│  - 5 輪 governance cycle                │
│  - 12 proposals，10 applied，1 rejected │
│  - 1 人工介入（rollback 限時拍賣）      │
│  - 成本：$0.023                         │
│                                         │
│  📈 變化                                │
│  - 出租率：72% → 76%（+4%）            │
│  - Zone B 過熱事件 → 限流成功           │
│  - 主街排位變動：手作皮革升 #1          │
│                                         │
│  💡 洞察（Edda 歷史分析）               │
│  - Economy Chief 連續第 4 天降價         │
│    → 歷史先例：連續降價 > 3 天會觸發反彈 │
│    → 建議：明天暫停降價觀察              │
│  - Zone B 過熱是本週第 2 次              │
│    → 可能根因：Event Chief 活動太密集    │
│    → 建議：調整活動頻率 evaluator        │
│                                         │
│  📋 明日待辦                             │
│  - 恢復 Event Chief（已暫停 1 天）       │
│  - 考慮加 evaluator：活動間隔 ≥ 2 小時   │
│  - 觀察降價暫停後的價格走勢              │
└─────────────────────────────────────────┘
```

---

## 覆蓋的系統功能

| 功能 | 場景 | 對應 Issue |
|------|------|-----------|
| Rive 場景 | 1, 3, 4 | T#239 + T#240 |
| World Pulse（呼吸數字） | 1 | T#201 + T#202 |
| Chief status | 1, 4 | T#233 |
| Live Timeline | 2, 3 | T#234 |
| Timeline event detail | 2 | T#234 + T#232 (telemetry) |
| Edda precedent in detail | 2 | T#222 |
| Alert system | 3 | T#236 |
| Intervention panel | 4 | T#235 |
| Pause chief | 4 | Chief CRUD (已有) |
| Rollback | 4 | World routes (#183) |
| Morning Summary | 5 | T#208 |
| Edda insights in summary | 5 | T#224 |
| Goal reference | 2 | T#225 |
