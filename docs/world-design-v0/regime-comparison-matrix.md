# regime-comparison-matrix.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：把目前已經拆出的幾個 `intent regimes` 放到同一張骨架表上，避免之後又被「都差不多」的語言拉平。
>
> 這份文件不新增新概念。
> 它只做一件事：
>
> > **把不同 regime 在「想要什麼、怎麼長 space、怎麼 probe、何時 commit、何時進 Forge / Thyra」上的差異釘死。**

---

## 1. 一句話

> **不同 regime 的差別，不是題材不同，而是決策邏輯不同。**

也就是：

- 要改變的現實變量不同
- realization space 的生成方式不同
- probe 的形式不同
- commit 的門檻不同
- Forge 出場時機不同
- Thyra 出場條件也不同

如果不把這些差異明講，系統最後很容易全部退化成：

> 「列一些候選 → 選一個 → build」

那就又回到老路。

---

## 2. 六種 regime 總表

| Regime | 終局在乎什麼 | 第一個核心問題 | realization 常長成什麼 | probe 在測什麼 | 最常犯的錯 |
|---|---|---|---|---|---|
| **Economic** | 收入 / 現金流 / ROI | 誰會付錢、哪條最值得押 | service / vehicle / operator model / productized path | willingness-to-pay / buyer response / first dollar | 太早 build、太早做內容、太早做工具 |
| **Capability** | 能力增長 / 熟練度 | 哪條 path 真的讓人變強 | learning path / practice loop / curriculum / challenge ladder | skill delta / reproducibility / feedback density | 把學習問題做成工具比較或 roadmap |
| **Leverage** | 省時間 / 提升產能 / 降 cognitive load | 哪個 bottleneck 值得被系統化 | workflow / automation target / operator pattern | time saved / failure reduction / repeatability | 自動化噪音、優化不重要步驟 |
| **Expression** | 作品完成 / 美學承載 / resonance | 什麼媒介 / form 最能承載這個味道 | medium / format / production loop / serialized form | medium-fit / coherence / completion-likelihood | 被拉去做內容行銷或效率工具 |
| **Governance** | 世界活性 / continuity / 可治理運行 | 哪個地方值得被開起來治理 | world form / minimum world / managed field | state-change density / closure / consequence richness | 做成 dashboard、agent room、假世界 |
| **Identity** | 角色轉換 / 生活路徑 / 長期適配 | 哪條 path 值得進一步投入人生 | staged path / reversible transition / apprenticeship path | self-fit / reversibility / sustainability | 太早承諾、太早做大規劃 |

---

## 3. 更硬一點：每個 regime 到底在改變哪個現實變量

| Regime | 真正要改的現實變量 |
|---|---|
| Economic | `cashflow`, `payback`, `buyer conversion`, `revenue confidence` |
| Capability | `skill level`, `speed`, `consistency`, `quality floor` |
| Leverage | `hours spent`, `throughput`, `error rate`, `friction` |
| Expression | `completion`, `aesthetic coherence`, `recognizability`, `resonance` |
| Governance | `world vitality`, `stability`, `fairness`, `governability`, `continuity` |
| Identity | `path viability`, `self-fit`, `stability`, `reversibility`, `life coherence` |

這張表很重要，因為它提醒我們：

> **同一句「我想做 X」，不同 regime 下，實際在優化的是完全不同的東西。**

---

## 4. 每個 regime 的 first-kind 問句長什麼樣

這裡講的是最原始輸入，不是已經被 domain 化之後的版本。

| Regime | first-kind 問句範例 |
|---|---|
| Economic | 我想賺錢 / 我有 1000 美金 / 我想先有第一筆收入 |
| Capability | 我想學會影片生成 / 我想真的會用 agent，不是只懂概念 |
| Leverage | 我想省時間 / 我想把這套流程變成可複製 |
| Expression | 我想把這個感覺做成作品 / 我想做出這種世界觀 |
| Governance | 我想開一個會自己運作的地方 / 我想讓 AI 經營一個場域 |
| Identity | 我想轉職 / 我想從現在這種生活模式切到另一種 |

這些都還沒有 domain、vehicle、world、pipeline。
這就是 first-kind 的典型形狀。

---

## 5. `space-builder` 在不同 regime 下到底長什麼

這一張是核心。

| Regime | `space-builder` 生成的不是什麼 | 它真正生成的是什麼 |
|---|---|---|
| Economic | 不是點子清單 | `domain × vehicle` 候選 |
| Capability | 不是課程推薦 | `learning carrier / practice structure` 候選 |
| Leverage | 不是工具大全 | `automation target / operator form` 候選 |
| Expression | 不是內容題材清單 | `medium / format / production form` 候選 |
| Governance | 不是 feature map | `world form / minimum world shape` 候選 |
| Identity | 不是人生建議列表 | `staged path / transition form` 候選 |

所以 `space-builder` 這個名字現在是成立的，
因為不同 regime 長出的 space 的確不同。

---

## 6. `path-check` 在不同 regime 要看什麼

這一張是讓 `path-check.md` 不要又變 generic 的。

| Regime | 哪些東西固定了，才算 path 已相對清楚 |
|---|---|
| Economic | domain、vehicle、buyer、第一個 offer、第一個 build target |
| Capability | target skill、quality bar、practice loop、feedback mechanism |
| Leverage | bottleneck、baseline、automation target、success metric |
| Expression | medium、format、production loop、作品完成條件 |
| Governance | world form、minimum world、canonical cycle、first closure target |
| Identity | path stage、probe step、reversibility、commit threshold |

所以同樣是 `medium certainty`，在不同 regime 下代表的未決點是不一樣的。

---

## 7. `probe` 在不同 regime 到底碰的是什麼現實

這張表很重要，因為很多系統口頭都說 probe，實際上都是在做資料蒐集。

| Regime | Probe 真正碰到的現實 |
|---|---|
| Economic | buyer / payment / commitment |
| Capability | performance / repetition / failure / feedback |
| Leverage | time / manual effort / error / operational friction |
| Expression | audience resonance / form fit / completion reality |
| Governance | state-change closure / world pressure / consequence visibility |
| Identity | lived fit / emotional sustainability / reversibility / life friction |

這說明：

> **probe 不只是小測試，而是 regime-specific contact with reality。**

---

## 8. 各 regime 的 canonical probe forms

| Regime | canonical probe 形式 |
|---|---|
| Economic | direct offer, landing page + CTA, concierge service, paid pilot |
| Capability | challenge loop, before/after task, timed project, repeatability test |
| Leverage | manual vs assisted comparison, bottleneck timing, automation delta test |
| Expression | one-piece production, 3-form comparison, small audience reaction test |
| Governance | minimum state instantiation, one-cycle closure, one-change-one-outcome probe |
| Identity | shadow role test, staged commitment, reversible side path, week-in-the-life probe |

這張表其實直接回答：
為什麼不能把所有 regime 都塞進同一種 selection engine。

---

## 9. Commit 在不同 regime 到底代表什麼

這也是最容易被拉平的地方。

| Regime | commit 真正代表什麼 |
|---|---|
| Economic | 這條路已經有足夠硬的 buyer / payment signal，值得 build offer / system |
| Capability | 這條練法已經證明比其他路更有效，值得 systematize |
| Leverage | 這個 bottleneck 確認存在且值得被工程化 |
| Expression | 這個媒介 / form 已證明能承載表達，值得建立 production system |
| Governance | 這個 world form 已證明能閉環，值得 instantiate 成 live world |
| Identity | 這條 path 值得更深一層承諾，不只是想像中的未來人生 |

所以 commit 不是單一動詞，
它是不同 regime 下不同類型的「升級權」。

---

## 10. 什麼情況會進 Forge

| Regime | 何時才有資格進 Forge |
|---|---|
| Economic | buyer、vehicle、first offer 已成形，build 才是下一個瓶頸 |
| Capability | path 已證明有效，值得被做成 curriculum / tooling / trainer loop |
| Leverage | bottleneck 確認，工程化會顯著放大效果 |
| Expression | 形式已定，build 是在保護 / 放大表達，不是取代表達 |
| Governance | world form 已定，minimum closure 已跑通，build 是 instantiate world |
| Identity | 只有當某條 path 已經值得被制度化支援，否則很多 identity 問題不一定需要 Forge |

這裡可以看出來：

> Forge 並不是任何 regime 的必然下一步。
> 尤其 Identity，有些情況先 probe 一段人生，比先 build 好得多。

---

## 11. 什麼情況會進 Thyra

這一張其實可以幫你把 Thyra 邊界守住。

| Regime | 何時才會接到 Thyra |
|---|---|
| Economic | 當 selected path 變成 recurring operator model / live managed system |
| Capability | 當能力養成系統本身變成需要治理的 live environment |
| Leverage | 當 automation 變成持續運行、需要 policy / review / rollback 的 runtime |
| Expression | 當作品世界或 production field 變成會自己積累 state / change / rules |
| Governance | 幾乎是這個 regime 的自然歸宿，一旦 live world 被 instantiate |
| Identity | 不常直接接 Thyra，除非被實作成可治理的 environment / system |

這張表幫你防止一件事：

> **不要把所有 live system 都叫 Thyra，也不要把所有運行中的東西都拖進 world governance。**

---

## 12. 每個 regime 最常掉進的「假第二種 / 假第三種」

這張我覺得很實用。

| Regime | 假第二種 | 假第三種 |
|---|---|---|
| Economic | 影片生成 / AI agent / 社群媒體這種只有 domain 沒有 vehicle 的答案 | 太早做網站、內容系統、SaaS、automation pipeline |
| Capability | 工具比較、課程推薦、理論地圖 | 太早做學習平台 / 訓練系統 |
| Leverage | 什麼都想自動化 | 太早做全自動 orchestration |
| Expression | 題材堆砌、世界觀堆砌 | 太早做 production machine，反而把味道磨平 |
| Governance | 大世界、大模板、大敘事 | 太早做 dashboard / multi-agent control plane / fake world UI |
| Identity | 人生選項清單、宏大轉型口號 | 太早做完整新生活架構，而沒先做 reversible probes |

---

## 13. 如果只用一句話區分這六個 regime

這一段可以拿來當系統 prompt 級別的記憶。

### Economic
**找到最值得押、最可能最快產生付費訊號的路。**

### Capability
**找到最能讓能力真的長出來的練習承載體。**

### Leverage
**找到最值得被工程化的瓶頸。**

### Expression
**找到最能承載這個味道與作品完成的形式。**

### Governance
**找到第一個值得被開起來、被治理、會產生後果的地方。**

### Identity
**找到值得進一步承諾、且不會過早鎖死人生的 path。**

---

## 14. regime 之間不是互斥，但要有主次

很多真實問題其實是混合的。
例如：

- 用影片生成賺錢
→ `economic` 主、`expression` 次

- 建立一條影片生成 workflow
→ `leverage` 主、`capability` 次

- 開一個 creator market
→ `governance` 主、`economic` 次

- 從接案轉成產品
→ `identity` 主、`economic` 次

所以 router 不一定永遠單選，
但 v0 最好仍先輸出一個主 regime，再附次 regime。

---

## 15. v0 建議的 router 輸出形狀

> 之前版本有 `likelyNextStep` 欄位，已移除。
> 決定下一步是 path-check 的責任，不是 router 的。見 `intent-router.md` §15。
> 正式型別見 `./shared-types.md` §2.1。

```ts
// 正式定義見 ./shared-types.md §2.1
type IntentRoute = {
primaryRegime: Regime;
secondaryRegimes?: Regime[];
confidence: number;
signals: string[];
rationale: string[];
keyUnknowns: string[];
suggestedFollowups: string[];
};
```

這樣比較貼近真實情況，
又不會一開始就搞太複雜。

---

## 16. 最後一句

> **這六個 regime 的差別，不在於用戶表面上提到什麼工具或題材，**
> **而在於：他真正想改變哪種現實、這種現實該被什麼承載、又該用什麼 probe 才能買到真訊號。**
>
> 只要這張矩陣站穩，前置層就不會再被 generic planning 吃掉。

---

如果你要，我下一步最合理的是：

1. `intent-router.md`
2. `probe-commit-evaluators.md`

我會建議先做 **2**，因為 regime matrix 有了，下一步最該釘死的是：
**每個 regime 到底怎麼評 signal、怎麼下 commit。**