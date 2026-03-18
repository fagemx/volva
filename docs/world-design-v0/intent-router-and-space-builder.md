# intent-router-and-space-builder.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：把「第一種問題」從模糊直覺，壓成一個真的可實作的前置層。
>
> 這份文件處理的不是：
> - build
> - automation
> - release
> - governance
>
> 而是更前面的事：
>
> > **當使用者只有終局意圖，還沒有 domain、vehicle、world、pipeline 時，系統怎麼決定接下來該在哪個 search space 裡思考。**

---

## 1. 一句話

> **Intent Router 決定你現在在問哪種終局意圖。**
>
> **Space Builder 決定這種意圖應該先長出哪些可承載它的 realization space。**

這兩者合起來，才是 Forge 前面的東西。
沒有這層，AI 會把很多第一種問題誤當成第三種 execution 問題。

---

## 2. 這份文件要解的錯誤

現在最常見的錯誤是：

### 錯誤 1：把終局意圖直接翻成 build task
例如：
- 「我想賺錢」 → 直接開始規劃網站 / SEO / 社群
- 「我想用影片生成賺錢」 → 直接開始做影片生成 pipeline
- 「我想開一個地方」 → 直接開始設計 world schema

這都太早。

---

### 錯誤 2：把 domain 當答案
例如：
- 「影片生成」
- 「AI agent」
- 「教學內容」
- 「社群媒體」

這些只是 domain 標籤，不是 realization。

---

### 錯誤 3：把 brainstorming 當 decision
列 20 個點子不等於有做決策。
真正需要的是：

- route 到正確 regime
- 長出正確 search space
- 砍掉錯的 space
- 再進 probe / commit

---

## 3. 核心定義

### 3.1 Terminal Intent
使用者真正想改變的終局狀態。

不是 topic。
不是工具。
不是手段。
而是：

- 錢變多
- 能力變強
- 作品變成形
- 時間節省
- 世界活起來
- 生活角色改變

---

### 3.2 Unfixed Realization Path
使用者還不知道這個意圖應該：

- 落在哪個 domain
- 用哪種 vehicle
- 長成哪種 world / system / service / path
- 值不值得工程化

這就是第一種問題的核心狀態。

---

### 3.3 Realization Space
某種 terminal intent 在當前人與條件下，可能成立的承載空間。

它可能是：

- domain
- vehicle
- medium
- world form
- learning path
- service form
- operator model
- platform form

注意：

> realization space 不是答案，
> 它是「哪些空間值得進一步 probe」的集合。

---

## 4. 整體位置

整條大鏈應該是：

```text
intent-router
→ path-check
→ space-builder
→ probe-commit
→ forge
→ thyra

edda = decision spine across all layers
```

注意：Edda 不是 pipeline 的最後一格。
它是側邊一條神經 / 脊椎，從 intent classification 到 thyra precedents 一路旁邊跟著記。

### 各層作用

#### 1. Intent Router
回答：**你現在到底想改變哪一種現實？**

輸出：regime, confidence, missing fields, follow-up questions

#### 2. Path Check
回答：**realization path 到底多固定？**

不是問你想什麼，而是問：
- 你是不是其實已經知道 domain / vehicle / path？
- 這題還需不需要生成 search space？
- 還是其實該直接進 Forge？

這層把兩個維度拆開了：
- **what do you want**（由 intent-router 回答）
- **how fixed is the path**（由 path-check 回答）

這樣 router 才不會因為 execution/build 類意圖而越來越髒。

輸出：

```ts
// 正式定義見 ./shared-types.md §3.1
type PathCheckResult = {
  certainty: "low" | "medium" | "high";
  route: "space-builder" | "forge-fast-path" | "space-builder-then-forge";
  fixedElements: FixedElement[];
  unresolvedElements: UnresolvedElement[];
  whyNotReady?: string[];
  whyReady?: string[];
  recommendedNextStep: string;
};
```

#### 3. Space Builder
回答：**對這種 regime，在這個人、這些約束下，應該先在哪些 realization spaces 裡思考？**

內部分兩步：
- **expand**：長出 realization families
- **constrain**：根據 edge、constraints、reversibility、search friction、regime-specific impossibilities，先砍掉一批根本不值得看的空間

輸出不是點子，是：realization candidates, why these spaces, probe readiness hints

#### 4. Probe / Commit
回答：**哪些 candidate 值得被現實測一下？哪些值得押？哪些應該砍？**

架構分兩部分：
- **共通 shell**：kill filters, probe packaging, signal packet, commit memo
- **regime-specific evaluator**：signal interpretation, commit threshold, what counts as disconfirming evidence

每個 regime 問的完全不同，不能被 selection 這個詞偷偷平均化。

#### 5. Forge
回答：**既然這條路被 commit 了，應該 build 什麼，不應該 build 什麼？**

注意：Forge 不是從使用者原話直接接任務，而是從 `commit memo` 接任務。
這會極大降低過早工程化。

#### 6. Thyra
回答：**當這個 realization 已經 live，它要怎麼被治理、承受後果、調整自己？**

#### 7. Edda (Decision Spine)
回答：**整條 decision path 發生了什麼、哪些判斷有效、哪些選擇被證明錯？**

Edda 沿路記錄：
- intent classification
- path certainty
- generated spaces
- pruned spaces
- probe designs
- signal packets
- commit memos
- forge decisions
- thyra precedents

這是系統學習的必要條件。

---

## 5. Intent Router：六種 regime

v0 先只做六類，不要再多。

---

### 5.1 Economic Intent
#### 使用者語氣
- 我想賺錢
- 我想增加收入
- 我想把 AI 支出變投資
- 我有 1000 美金，幫我想最值得押的方向

#### 核心變量
- 收入
- first dollar
- payback period
- willingness to pay
- ROI

#### 常見誤判
- 太早進 build mode
- 太早進 content mode
- 太早預設 SaaS / SEO / 社群

---

### 5.2 Capability Intent
#### 使用者語氣
- 我想學會某項能力
- 我想把某工具用熟
- 我想變成影片生成高手
- 我想真的會，不是只知道概念

#### 核心變量
- 能力增長
- 熟練度
- 可重現性
- 速度
- 品質門檻

#### 常見誤判
- 被誤導成課程推薦
- 被誤導成工具比較
- 被誤導成 execution pipeline

---

### 5.3 Leverage Intent
#### 使用者語氣
- 我想省時間
- 我想提高產能
- 我想把重複工作交出去
- 我想把這件事變得可複製

#### 核心變量
- throughput
- time saved
- repeatability
- error reduction
- cognitive load

#### 常見誤判
- 一開始就做全自動化
- 自動化不重要的步驟
- 把效率問題誤當商業機會問題

---

### 5.4 Expression Intent
#### 使用者語氣
- 我想做出作品
- 我想把這種感覺做出來
- 我想建立一個風格
- 我想把某個世界/敘事真的弄出來

#### 核心變量
- 美學一致性
- 完成度
- 作品密度
- recognizability
- resonance

#### 常見誤判
- 被導成社群經營
- 被導成內容行銷
- 被導成工具化生產，而不是承載表達

---

### 5.5 Governance / World Intent
#### 使用者語氣
- 我想開一個地方
- 我想做一個會自己運作的系統
- 我想讓 AI 經營某個場域
- 我想做的是世界，不是工具

#### 核心變量
- world vitality
- continuity
- governance density
- participation
- outcome-bearing operation

#### 常見誤判
- 被導成 app / dashboard
- 被導成 multi-agent chat
- 被導成流程編排工具

---

### 5.6 Identity / Life-Design Intent
#### 使用者語氣
- 我想轉職
- 我想成為某種人
- 我想換一種工作/生活方式
- 我想從現在這種模式轉出去

#### 核心變量
- path viability
- reversibility
- identity fit
- stability
- long-term sustainability

#### 常見誤判
- 直接列清單
- 直接做 roadmap
- 直接做職缺比對
- 沒有 staged probes

---

## 6. Router 輸出不是答案，是 `regime + confidence + missing fields`

Router 最重要的不是分類準確率，
而是給後面 Space Builder 一個正確起點。

### Output v0
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

---

### 例子 A
輸入：
> 我想賺錢，給你 1000 美金

輸出：
```json
{
"primaryRegime": "economic",
"confidence": 0.93,
"signals": ["money outcome", "explicit capital budget", "no domain specified"],
"keyUnknowns": ["edge profile", "time horizon", "risk tolerance"],
"suggestedFollowups": [
"你已經比普通人更熟什麼？",
"你要第一筆收入還是 recurring？",
"你能不能做對外接觸？"
]
}
```

---

### 例子 B
輸入：
> 我想用影片生成賺錢

輸出：
```json
{
"primaryRegime": "economic",
"confidence": 0.84,
"signals": ["money outcome", "domain bounded by video generation"],
"keyUnknowns": ["vehicle shape", "edge profile", "buyer target"],
"suggestedFollowups": [
"你在影片生成裡最強的是哪一段？",
"你想賣服務、產品包，還是工具？"
]
}
```

---

### 例子 C
輸入：
> 我想把影片生成 workflow 跑熟

輸出：
```json
{
"primaryRegime": "capability",
"confidence": 0.89,
"signals": ["skill acquisition", "workflow mastery"],
"keyUnknowns": ["current level", "target quality bar"],
"suggestedFollowups": [
"你現在卡在哪一段？",
"你想做到什麼作品等級？"
]
}
```

---

## 7. Space Builder：expand + constrain，不是純生成器

這是整份文件最重要的地方。

Space Builder 不是給三個答案讓人選。
如果它只是 build space，很快又會滑回 brainstorm machine。

所以它的定義是：

# `space-builder = expand + constrain`

### expand
長出 realization families。
根據人、資產、條件、痛點、可驗證性長。

### constrain
根據以下維度先砍掉一批根本不值得看的空間：
- edge（這個人的不對稱在哪）
- constraints（時間、錢、風險）
- reversibility（走錯能不能回來）
- search friction（探索成本多高）
- regime-specific impossibilities（在這個 regime 裡根本不成立的路）

不要太早拆成兩個模組，但要在 spec 裡明說它內部分兩步。

---

## 8. Space Builder 的四個輸入

無論哪個 regime，Space Builder 至少看這四類：

### 8.1 Person Asymmetry
這個人比平均人多了什麼？

- 技術
- 品味
- 現成作品
- workflow 經驗
- domain knowledge
- connections
- credibility
- local context

---

### 8.2 Constraint Envelope
這個人的約束條件是什麼？

- 錢多少
- 時間多少
- 能不能對外
- 能不能長期做
- 能不能承受風險
- 可不可以 public

---

### 8.3 Search Friction
某條路的探索成本多高？

- 需要多久才有訊號？
- 要不要先 build 很多？
- acquisition friction 高不高？
- 可不可以 cheap probe？

---

### 8.4 Carrying Form
這個意圖比較適合被什麼形式承載？

- path
- practice loop
- service
- workflow
- world
- content form
- tool
- community structure

這一欄很重要。
因為不同 regime 的 realization，不一定是商業 vehicle。

---

## 9. Space Builder 的輸出不是 idea list，而是 `realization candidates`

```ts
// 正式定義見 ./shared-types.md §4.1
type RealizationCandidate = {
  id: string;
  regime: Regime;

  form: RealizationForm;
  domain?: string;
  vehicle?: string;
  worldForm?: WorldForm;

  description: string;
  whyThisCandidate: string[];
  assumptions: string[];

  probeReadinessHints?: string[];
  timeToSignal: "short" | "medium" | "long";
  notes: string[];
};
```

重點是：
- candidate 要有 form
- 要有產生原因（`whyThisCandidate`）與假設（`assumptions`）
- 要有 probe readiness hints
- 不含數值分數（v0 用結構化 verdict，不用 0-100 分數）

不是純文字點子。

---

## 10. 不同 regime，Space Builder 長出的東西不同

---

### 10.1 Economic regime 的 space builder
問的是：

> 哪些 domain × vehicle 組合值得 probe？

它長出的東西可能是：

- 影片生成 × done-for-you service
- 影片生成 × workflow install
- 影片生成 × template pack
- AI 工具配置 × setup service
- agent workflow × niche consulting
- design automation × productized ops

這裡 vehicle 很重要。

不是只有 domain。
也不是只有產品類型。

---

### 10.2 Capability regime 的 space builder
問的是：

> 哪種 path / practice structure 最能承載這個能力養成？

它長出的東西可能是：

- 12-day practice loop
- one-project curriculum
- compare-and-rebuild workflow
- daily output ladder
- mentorless apprenticeship system

這裡不是 opportunity，
而是 learning carrier。

---

### 10.3 Leverage regime 的 space builder
問的是：

> 哪個 bottleneck 值得被變成 automation target / operator pattern？

它長出的東西可能是：

- prompt-to-storyboard bottleneck
- FFmpeg postprocess chain
- dispatch/review loop
- repetitive project bootstrap
- cross-tool copy/paste reduction path

這裡 form 常是：
- workflow
- automation target
- operator model

---

### 10.4 Expression regime 的 space builder
問的是：

> 哪個媒介 / format / production loop 最能承載這個表達意圖？

它長出的東西可能是：

- short video essay
- serialized visual micro-drama
- storyboard-first world
- interactive role/world format
- image-sequence narrative pipeline

這裡的 candidate 不應被 economic logic 主導。

---

### 10.5 Governance regime 的 space builder
問的是：

> 哪種 world form 最值得作為第一個被治理的地方？

它長出的東西可能是：

- market
- creator commons
- town
- port
- night engine
- managed content field

這裡很接近 Thyra，但還沒進 Thyra。
因為這時只是 realization candidates，不是 live world。

---

### 10.6 Identity regime 的 space builder
問的是：

> 哪些 path 值得被 staged probe，而不是一次性 commit？

它長出的東西可能是：

- 兼職顧問路徑
- 服務→產品過渡路徑
- domain apprenticeship path
- public-building path
- operator transition path

這裡的 candidate 通常是 staged path，不是單一 project。

---

## 11. `Opportunity Selection` 在這裡到底站哪裡？

這次要講死。

### 它不是 Layer 1
不是 Intent Router。

### 它也不是 Layer 2 的總稱
不是所有 realization space 都叫 opportunity。

### 它是：
> **probe-commit 層在 economic regime 下的一種特化形式。**

也就是 economic regime 的 regime-specific evaluator 做的事。

```text
economic regime
→ path-check
→ build realization candidates (expand + constrain)
→ opportunity selection / capital allocation / probe commit (economic evaluator)
→ forge
```

這樣才準。

---

## 12. `Space Builder` 為什麼不能直接接 Forge？

因為 candidate 還不是 selected path。

中間一定要有：

- filter
- kill
- probe
- compare
- commit

也就是：

```text
intent-router
→ path-check
→ space-builder (expand + constrain)
→ probe-commit (shell + regime evaluator)
→ forge
```

否則 AI 還是會太早工程化。

注意 `path-check` 可能直接跳到 forge-fast-path，
如果 realization path 已經足夠固定的話。

---

## 13. 最容易犯的錯：把 `Space Builder` 做成高級 brainstormer

這一點要特別防。

錯的結果會變成：

- 列很多很會說的可能性
- 每個都像可行
- 但沒有 search geometry
- 沒有 kill logic
- 沒有 candidate structure
- 沒有 handoff 給 probe/commit

這樣只是一個文筆好的靈感機。

---

## 14. 所以 Space Builder 至少要有三個硬輸出

### 14.1 Candidate Map
長出了哪些 realization candidates

### 14.2 Search Geometry
這些 candidate 為什麼在這個人/條件下被長出來

### 14.3 Probe Readiness
哪些 candidate 值得進下一輪 probe/filter/commit

沒有第三個，Builder 就只是 list generator。

---

## 15. Probe Readiness 是什麼？

不是「我喜歡這個點子」。
而是：

> **這個 candidate 是否已經有足夠形狀，可以被設計成現實 probe。**

例如 economic candidate：
- buyer 假說夠不夠清楚？
- value proposition 夠不夠清楚？
- 可不可以在 1000 美金內買到訊號？

例如 capability candidate：
- 能不能設計出 14 天內可驗的 skill loop？

例如 governance candidate：
- 有沒有足夠 state/change density 可以做 minimum world？

---

## 16. 與 ARC / Forge / Thyra / Edda 的邊界

---

### ARC
不是入口。
是某些 regime 在 `space-builder` 或 `probe-commit` 階段，
當需要高成本深研究時調用的器官。

> ARC = deep exploration organ

不是總路由器。

---

### Forge 接手條件
Forge 就是 commit 後的 build organ。

當 candidate 已經：
- 被選中
- 有明確 realization form
- 值得 build

Forge 從 `commit memo` 接任務，不從使用者原話接任務。

Forge 處理：
- build
- implementation path
- release structure
- automation / packaging

---

### Thyra 接手條件
Thyra 就是 live realization 的 governance organ。
不是 build organ，也不是 search organ。

當 selected realization 已經：
- 不再只是 spec
- 而是開始 live
- 有 state
- 有 change
- 有後果
- 需要治理

Thyra 處理：
- operation
- cycle
- judgment
- pulse
- outcome
- precedent-fed governance

---

### Edda = Decision Spine
Edda 不是 pipeline 最後一格。
它是一路旁邊跟著記的 decision spine。

Edda 記錄（across all layers）：
- intent classification
- path certainty
- generated spaces
- pruned spaces
- probe designs
- signal packets
- commit memos
- forge decisions
- thyra precedents

這樣整條 decision spine 才完整。

---

## 17. v0 最小模組圖

```text
intent-router
→ path-check
→ space-builder (expand + constrain)
→ probe-commit (shell + regime evaluators)
→ forge
→ thyra

edda = decision spine across all layers
```

```text
terminal intent
→ intent-router
→ path-check
→ if unfixed: space-builder → probe-commit
→ if fixed enough: forge (fast-path)
```

這是最小但夠清楚的骨架。

### COND-02 Compliance Note

CLAUDE.md 限制每輪 `handleTurn()` 最多 2 次 LLM 呼叫（parseIntent + generateReply）。
world-design-v0 pipeline 的 LLM 呼叫分佈在 **多個獨立 request** 而非單一 turn：

| Step | LLM calls | Triggered by |
|------|-----------|-------------|
| intent-router | 1 call | `POST /api/containers/turn` (replaces parseIntent) |
| generateReply | 1 call | same request (total: 2, COND-02 compliant) |
| path-check | 0 calls | pure function based on intent-route output |
| space-builder | 1 call | separate request: `POST /api/decision/space-build` |
| probe design | 0 calls | pure function (shell structures probe from candidate) |
| probe execution | varies | external actions, not LLM calls |
| evaluator | 1 call | separate request: `POST /api/decision/evaluate` |
| forge | 1 call | separate request: `POST /api/decision/forge` |

每個 request 最多 2 次 LLM 呼叫。Pipeline 跨多個 request 執行，由使用者在每個階段確認後推進。

---

## 18. 兩個 canonical examples

---

### Example A — Economic
輸入：
> 我想賺錢，這裡有 1000 美金

#### Router
判成 `economic`

#### Space Builder 長出：
- 影片生成 × workflow install service
- 設計 workflow × done-for-you automation
- agent setup × consulting package
- visual pipeline × template pack

#### Probe Readiness
挑出：
- 2 條最短能買到付費訊號的路

#### 再交給
`probe-commit`

不是直接交給 Forge。

---

### Example B — Governance
輸入：
> 我想開一個會自己運作的地方，讓 AI 管它

#### Router
判成 `governance`

#### Space Builder 長出：
- market
- creator commons
- night engine
- town
- port

#### Probe Readiness
判定：
- `night market / market` 有最高密度、最可做 minimum world

#### 再交給
不是直接 Thyra，
而是先進：
- world-form probe / minimum-world selection

之後才進 Forge / Thyra。

---

## 19. 分析母題

> **Terminal Intent under Unfixed Realization Path**

這是分析語言，不一定是工程語言。但它精確描述了這整份文件要解的問題。

收成一句：

> **第一種問題的核心，不是 selection。**
> **而是先根據 terminal intent 與 path certainty，生成並約束可承載它的 realization space，再用 regime-specific probes 決定是否 commit。**

這句比單講 `opportunity selection` 穩，也比單講 `space builder` 完整。

如果成立，很多東西就自然對齊了：

- 為什麼不能太早 build
- 為什麼 `opportunity selection` 不夠通用
- 為什麼要先 route intent，再 check path certainty
- 為什麼 domain / vehicle / world 不是輸入，而是中間生成物
- 為什麼 probe-commit 需要 regime-specific evaluator，不能被平均化

---

## 20. 最後一句

> **Intent Router 決定你現在是在問哪一種世界問題。**
>
> **Path Check 決定這條路到底固不固定。**
>
> **Space Builder 在不固定時，先 expand 再 constrain，長出值得看的承載空間。**
>
> **Probe / Commit 用 regime-specific evaluator 決定哪條有資格被工程化。**
>
> 沒有這些層，AI 會太快變成工具人；
> 有了這些層，Forge 才不會太早出場，Thyra 也不會被迫接一個還沒被選中的世界。

---

## 21. 接下來不是再改命名，而是把模組接口釘死

現在最危險的不是概念錯，而是一直在「更準的名字」裡打轉。
概念已經夠準了。接下來該做的是三個 spec：

1. **`intent-router.md`** — 把 6 個 terminal intent families, signals, missing fields, follow-up questions 寫死
2. **`path-check.md`** — 把 fixed vs unfixed, forge fast-path 條件, unresolved element 判準寫死
3. **`probe-commit-evaluators.md`** — 把 economic / governance / capability / expression / identity 的 commit semantics 寫死

這三份一出來，前置層就不是理論了。