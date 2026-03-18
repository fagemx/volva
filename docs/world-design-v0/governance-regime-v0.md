# governance-regime-v0.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：把 `governance intent` 從一句「我想開一個會自己運作的地方」壓成一個可被 router、space builder、probe/commit、forge、thyra 接住的 regime。
>
> 這份文件不處理：
> - 單次任務編排
> - 普通產品 build
> - 一般 growth playbook
>
> 它只處理一件事：
>
> > **當使用者真正想要的不是一個工具，而是一個能持續存在、能承受變更、能產生後果、值得被治理的地方時，系統應該怎麼思考。**

---

## 1. 一句話

> **Governance regime 不是在問「做什麼功能」，而是在問「什麼樣的世界 / 場域 / 運行空間，值得被開起來並長期治理」。**

這句跟 economic regime 的差別很大。

economic 問的是：
- 哪條路先有付費訊號？

governance 問的是：
- 哪個地方一旦被開起來，會持續產生 state / change / pressure / outcomes？

所以 governance 不是 product ideation 的變體。
它是在找：

> **可被制度化的運作空間。**

---

## 2. Governance intent 的本質

Governance intent 的起點，不是功能需求，也不是內容題材。

它的起點通常像這樣：

- 我想開一個地方
- 我想讓 AI 代替我經營某種場域
- 我想做一個不是 task tool，而是會自己運轉的系統
- 我想讓某種 world / village / commons 存在
- 我想讓一個地方不是被動頁面，而是會產生後果的空間

所以它真正問的不是：

> 世界裡要放什麼 feature？

而是：

> **什麼東西有足夠密度，配被做成一個 world？**

---

## 3. Governance regime 最容易被做錯的地方

### 錯法 1：把它做成 multi-agent 工具
於是開始講：
- agent roles
- task dispatch
- memory
- rooms
- threads
- autonomy

這些都可能需要，但它們不是核心。

如果最後做出來只是 agent orchestration，那不是 governance regime 的答案。

---

### 錯法 2：把它做成 dashboard product
畫面上有：
- pulse
- health score
- cards
- activity
- maps

但底層沒有：
- state
- change grammar
- judgment
- rollback
- outcome semantics

這樣只是管理介面，不是世界。

---

### 錯法 3：把它做成 world fantasy
概念很大：
- city
- nation
- port
- civilization
- commons

但沒有最小世界，沒有 change closure，沒有最短 cycle。

這樣會直接飄掉。

---

### 錯法 4：把 world form 當 aesthetic choice
例如只因為某個題材好看，就想先做：

- town
- port
- brand world
- creator island

但沒有先問：
- 它的 state 密度夠不夠？
- change 是不是清楚？
- governance pressure 夠不夠？
- outcome 能不能看見？

這會做成空殼世界。

---

## 4. Governance regime 的真正核心

我會把它收成四個問題：

### 4.1 什麼東西值得被當成「地方」而不是「功能」？
它必須有持續性，不是一次性 workflow。

### 4.2 這個地方有沒有足夠的 state/change 密度？
沒有密度，就不值得治理。

### 4.3 這個地方會不會自己產生壓力與後果？
沒有壓力，就不需要 governance。

### 4.4 這個地方的最小閉環能不能先跑通？
如果連 minimum world 都跑不通，就不該太早擴張。

---

## 5. Governance regime 的 canonical flow

```text
Governance Goal
→ intent-router (判成 governance)
→ path-check (路夠不夠固定？)
→ if unfixed:
    → World-form Extraction
    → Density Mapping
    → Candidate World Forms (space-builder: expand + constrain)
    → Kill Filters (shell)
    → Minimum World Probes (shell)
    → Closure Review (governance evaluator)
    → Commit to World Form (shell + governance evaluator)
    → Forge (instantiate the world)
    → Thyra (operate/govern the live world)
→ if fixed enough:
    → forge-fast-path

edda = decision spine (沿路記 world requirements → density mapping → form selection → probe closures → commit rationale → thyra precedents)
```

這條 flow 的重點不是創意，
而是：

- world form
- density
- closure
- governance worthiness（由 governance evaluator 判定）

---

## 6. Governance regime 的輸入，不夠只是「我想做一個世界」

如果使用者只說：
> 我想做一個讓 AI 自己經營的地方

Router 可以判成 governance，
但這還遠遠不夠。

至少還缺三組東西：

### 6.1 Governance Desire
他到底想讓這地方承載什麼？

例如：
- 交易
- 社群
- 活動
- 生產
- 內容分配
- 協作
- 審查
- 調度

沒有這個，world form 會飄。

---

### 6.2 Pressure Source
這個地方的壓力從哪裡來？

例如：
- 人流
- 供需
- 注意力競爭
- 衝突
- 安全
- 不公平
- 活動節奏
- 配置資源

沒有 pressure，就不需要治理。

---

### 6.3 Outcome Surface
這個地方的後果要怎麼被看見？

例如：
- 留存
- 交易
- complaint
- fairness drift
- congestion
- vitality
- completion
- stability

沒有 outcome surface，就沒辦法閉環。

---

## 7. Governance regime 的第一步不是選模板，而是抽 world requirements

在這個 regime 裡，space builder 不能一開始就給：
- market
- town
- port

那太像設計選項。

真正第一步應該先抽：

> **這個意圖要求世界至少具備哪些條件？**

我會先抽成五種 requirement。

---

### 7.1 State Density
這世界有沒有足夠穩定的 state 可以被觀察？

例如：
- zones
- gates
- stalls
- members
- resources
- queues
- active rules
- active roles

---

### 7.2 Change Clarity
這世界的 change 是不是能被清楚表示？

例如：
- 開 / 關
- 增 / 減
- 重配
- 限流
- 暫停
- 授權
- 調整權重
- rollback

如果 change 語言很模糊，這世界就不適合先做。

---

### 7.3 Governance Pressure
這世界是不是天然需要判斷：
- 現在能不能改
- 該誰改
- 改了會不會有害
- 哪種改變需要 rollback

沒有 governance pressure，Thyra 就會變裝飾。

---

### 7.4 Outcome Visibility
這世界的 change 後果可不可以被看見？

不是 abstract 好壞，
而是：
- congestion 有沒有降
- fairness 有沒有漂
- participation 有沒有掉
- complaint 有沒有升
- vitality 有沒有死

---

### 7.5 Cycleability
這世界能不能形成固定節奏？

例如：
- 每 15 分鐘一輪
- 每日一輪
- 每週一輪

如果無法形成 cadence，
就不適合先進治理 regime。

---

## 8. Space Builder：governance regime 裡，長出的不是 product ideas，而是 `world forms`

這一層要特別小心。

economic regime 長出的是：
- domain × vehicle

governance regime 長出的是：
- **world forms**

也就是：
- 怎樣的地方配被做出來

---

## 9. Governance regime 的 canonical world forms

v0 先固定 6 種，不再往上抽。

### 9.1 Market
由：
- 供給
- 需求
- 價格
- 人流
- 排位
- 活動
所驅動的地方

優點：
- 密度高
- 指標清楚
- 變更明確
- outcome 可見

---

### 9.2 Commons
由：
- 共享資源
- 角色協作
- 規則維持
- 共同品質
所驅動的地方

優點：
- 治理感強
缺點：
- 指標往往比 market 更模糊

---

### 9.3 Town
由：
- 常住角色
- 穩定秩序
- 資源配置
- 成長與穩定平衡
所驅動的地方

優點：
- 很像完整世界
缺點：
- 太容易過大、過鬆

---

### 9.4 Port
由：
- 進出
- 邊界
- 交換
- 身份
- 流通管制
所驅動的地方

優點：
- 很有治理味
缺點：
- 對 v0 通常太抽象太大

---

### 9.5 Night Engine / Event Field
由：
- 檔期
- 場務
- 高峰與降溫
- 即時調節
所驅動的地方

優點：
- cycle 清楚
- pressure 清楚
- outcome 反應快

---

### 9.6 Managed Knowledge Field
由：
- 知識進出
- 任務流
- attention allocation
- curation / review
所驅動的地方

優點：
- 很貼 AI/native
缺點：
- 容易退化成普通工具介面

---

## 10. Governance regime 最重要的不是 world forms 多，而是 world forms 之間可比較

所以每個 candidate world form 都至少要被評估四件事：

### 10.1 Density Score
它有沒有足夠 state/change/pressure？

### 10.2 Closure Score
它能不能跑出最小治理閉環？

### 10.3 Visibility Score
外部人是否一眼能看出它在活？

### 10.4 Expandability Score
如果 v0 成立，之後能不能自然長大？

---

## 11. Governance regime 的 candidate schema

```ts
// 正式定義見 ./shared-types.md §4.2
type GovernanceWorldCandidate = RealizationCandidate & {
worldForm: WorldForm; // 必填（不是 optional）
stateDensity: "low" | "medium" | "high";
changeClarity: "low" | "medium" | "high";
governancePressure: "low" | "medium" | "high";
outcomeVisibility: "low" | "medium" | "high";
cycleability: "low" | "medium" | "high";

likelyMinimumWorldShape: string[];
mainRisks: string[];
};
```

這樣後面才有辦法真比，不會變成空泛偏好。

---

## 12. Kill Filters：governance regime 要特別防止兩種假世界

### 12.1 Fake World
看起來像世界，實際只是 UI / scene / theme。

特徵：
- aesthetic 強
- state 弱
- change 不清
- outcome 不清
- pressure 不夠

這種要砍。

---

### 12.2 Tool-in-World-Clothing
表面上說是 world，實際只是：
- dashboard
- workflow tool
- multi-agent room
- control panel
- admin app

如果它的核心其實還是 task / worker / run，
也要砍。

---

### 12.3 Too Large Before Closure
如果一個 world form 一開始就需要：
- 很多角色
- 很多 state
- 很多 surface
- 很長時間尺度

才能第一次閉環，那 v0 應該砍或降權。

---

### 12.4 No Observable Consequence
如果 change 做了之後很難看出後果，
先砍。

因為 governance regime 的核心不是「能改」，
而是「改了世界會怎樣」。

---

## 13. Minimum World Probe：governance 不是先 build whole world
這裡跟 economic regime 很像，都不能太早進 Forge。

governance probe 的核心不是：
- 問人覺得酷不酷
- 做 landing page
- 做完整場景

而是要測：

> **這個 world form 能不能跑出最小 state-change-judgment-outcome-precedent 閉環。**

---

## 14. Governance probes 的 canonical forms

### 14.1 Minimum State Instantiation
先把最小 state 做出來。

例如：
- 2 zones
- 2 gates
- 3 chiefs
- 5 metrics
- 5 change kinds

這不是完整產品，
只是最小世界骨架。

---

### 14.2 One-Cycle Probe
至少跑一輪：

```text
observe
→ propose
→ judge
→ apply
→ pulse
```

如果這一輪都跑不順，world form 不成立。

---

### 14.3 One-Change-One-Outcome Probe
至少跑一條完整鏈：

```text
proposal
→ judgment
→ applied change
→ outcome window
→ verdict
→ precedent
```

這一條如果跑不出來，就還不配叫 governance world。

---

### 14.4 Pulse Visibility Probe
世界的活性是否可被感知？

不是看 UI 漂不漂亮，
而是：
- pulse 能不能壓出治理狀態
- dominant concern 看不看得見
- latest change impact 能不能被理解

---

## 15. Governance commit 的條件（governance evaluator 判定）

不是 world form 看起來最酷就 commit。
這些門檻由 governance evaluator 決定，不是通用打分器。

至少要滿足三件事：

### 15.1 Minimum world has shape
已經知道這個 form 的最小世界長什麼樣。

### 15.2 One closure exists
至少有一條最小閉環真的能跑。

### 15.3 Build is now the bottleneck
再不進 Forge，就拿不到下一階段的 world signal。

這一條很關鍵。
否則會太早做完整世界工程。

注意 governance evaluator 看的是 **world density / closure / 後果豐富度**，
跟 economic evaluator 看的 **付費訊號 / acquisition friction / payback** 完全不同。
這就是為什麼 probe-commit 不能是通用 selection engine。

---

## 16. Commit 不是直接進 Thyra
這點也要講死。

governance regime 裡，Space Builder / Probe / Commit 完成後，
不是直接「有個世界在活」。

而是：

> **選中一種 world form，然後進 Forge 去 instantiate 它。**

只有當 instantiate 後，這東西開始：
- 有 live state
- 有 repeated changes
- 有 outcomes
- 有 governance pressure

它才真正進 Thyra。

所以：

```text
governance regime
→ world-form commit
→ Forge instantiation
→ Thyra live governance
```

不是直接跳過 Forge。

---

## 17. 最接近 v0 的 candidate：Market / Night Engine
如果依照現在整條線看，governance regime 裡最強的 candidate 很明顯不是：

- town
- port
- giant commons

而是：

- `market`
- `night_engine`

原因不是比較帥，而是：

### 17.1 State 密度高
- stalls
- slots
- gates
- zones
- pricing
- spotlight
- incidents

### 17.2 Change 清楚
- throttle
- reweight
- pause
- reallocate
- reprice

### 17.3 Pressure 清楚
- 過熱
- 不公平
- 空場
- complaint
- 收場節奏

### 17.4 Outcome 可見
- congestion
- fill rate
- conversion
- complaint
- fairness

所以它是最容易先跑出 minimum world 的 form。

---

## 18. Concrete example：我想開一個會自己運作的地方
輸入：
> 我想開一個地方，讓 AI 替我經營它

### Router
判成 `governance`

### Space Builder 長出
- market
- night_engine
- town
- port
- commons

### Kill Filters
砍掉：
- port（太大）
- town（太鬆）
- generic commons（太難看後果）

保留：
- market
- night_engine

### Minimum World Probe
跑：
- 2 zones
- 2 gates
- 3 chiefs
- 1 canonical story
- 1 complete change→outcome closure

### Signal Review
看到：
- market / night_engine 最容易形成 closure
- pulse 可感
- outcome 可判
- precedent 可記

### Commit
才進：
- `midnight-market-canonical-slice`
- Forge instantiate
- 然後進 Thyra

這樣整條才會穩。

---

## 19. Edda 在 governance regime 裡記什麼

Edda 是 decision spine，不是 pipeline 最後一格。
在 governance regime 裡，Edda 沿路記錄：

- intent classification → governance
- path certainty → 通常 low（世界還沒成形）
- generated world forms（哪些被長出來）
- pruned world forms（為什麼 town 被 kill、為什麼 port 對 v0 太大）
- probe designs（用了什麼 minimum world probe）
- signal packets（哪個 probe 最先跑出 closure）
- commit memos（為什麼選 market 而不是其他）
- governance evaluator 的判斷（哪個 world form pulse 最清楚、哪個 change kind 最能作為 canonical story、哪種 closure 是假 closure）

這些都會變成未來 world selection 的 precedent，
也會回饋給 governance evaluator 讓它越來越會判。

---

## 20. 最小模組切法

如果做成系統，我會這樣切：

### `governance-world-evaluator`
評 world form 的 density / closure / pressure / visibility

### `minimum-world-prober`
跑最小 state/change/closure probe

### `closure-review`
審查這是不是一個真的 world，不是假 closure

### `world-commit-engine`
輸出 commit memo，交給 Forge

這樣比把 governance selection 混成大 planner 清楚。

---

## 21. 最後一句

> **Governance regime 的核心不是想像世界，**
> **而是選出第一個值得被治理的世界。**
>
> 它不先問 feature，
> 不先問 UI，
> 不先問多 agent 有多酷。
>
> 它先問：
>
> **哪個地方一旦被開起來，會立刻有 state、change、pressure、outcome，值得我們替它設法律、chief、pulse 和 precedent。**

---

接下來：把 governance evaluator 的接口釘死在 `probe-commit-evaluators.md`。