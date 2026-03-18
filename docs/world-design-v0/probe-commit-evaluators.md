# probe-commit-evaluators.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：把 `probe-commit` 從一個容易變成大雜燴的詞，壓成：
>
> - 一個**共通外殼**
> - 多個 **regime-specific evaluators**
>
> 這份文件不新增新的大理論。
> 它只回答一個很實際的問題：
>
> > **同樣叫 probe / commit，economic、capability、expression、governance 這些 regime，到底是用什麼判準在看 signal？**

---

## 1. 一句話

> **`probe-commit` 不是一個通用打分器。**
>
> 它是一個共通 decision shell，裡面依 regime 換不同 evaluator。

如果不這樣定，最後一定會退化成：

- 一張表
- 幾個分數
- 看起來很 rational
- 其實把完全不同的問題拉平

這就是很多系統最後又回到 generic planner 的原因。

---

## 2. 先把邊界講死

### `probe-commit` 共通做的事
不管是哪個 regime，都要做：

1. 接收 candidates
2. 套 kill filters
3. 把 candidate 壓成 probeable form
4. 跑 probe
5. 收 signal packets
6. 產生 decision memo
7. 輸出：
- commit
- hold
- discard

---

### `probe-commit` 不共通的事
不共通的是：

- 什麼算 signal
- signal 多硬才夠
- 什麼算假陽性
- 什麼叫 build 已成瓶頸
- commit 之後應該交給 Forge 蓋什麼

這些都必須 regime-specific。

---

## 3. Canonical Shape

我會正式把它定成兩層：

```text
probe-commit
├─ common shell
│ ├─ kill filters
│ ├─ probe packaging
│ ├─ signal packet normalization
│ ├─ decision memo format
│ └─ commit / hold / discard interface
│
└─ evaluators
├─ economic-evaluator
├─ capability-evaluator
├─ leverage-evaluator
├─ expression-evaluator
├─ governance-evaluator
└─ identity-evaluator
```

---

## 4. Common Shell：哪些東西應該共通

這層不要太聰明，要穩。

---

### 4.1 Candidate Input

> probe-commit 直接使用 `RealizationCandidate` 作為輸入，不再有獨立的 `CandidateInput` 型別。
> 正式定義見 `./shared-types.md` §4.1。

---

### 4.2 Probeable Form

> **Canonical type**: `ProbeableForm` — 正式定義見 `./shared-types.md` §5.1。以下為簡要參考。

這是 shell 必做的轉換。

```ts
// See shared-types.md §5.1 for canonical definition
type ProbeableForm = {
  candidateId: string;
  regime: Regime;
  hypothesis: string;
  testTarget: string;              // 到底在測什麼
  judge: string;                   // 誰/什麼會給回應
  cheapestBelievableProbe: string;
  disconfirmers: string[];         // 什麼結果出現就降級/砍掉
};
```

這一步不應讓 evaluator 自己亂長格式。
所有 regime 都要先進這個骨架。

---

### 4.3 Signal Packet

probe 跑完後，不留 raw logs，先壓成 signal packet。

```ts
// 正式定義見 ./shared-types.md §5.2
type SignalPacket = {
candidateId: string;
probeId: string;
regime: Regime;
signalType: string;
strength: "weak" | "moderate" | "strong";
evidence: string[];
negativeEvidence?: string[];
interpretation: string;
nextQuestions: string[];
};
```

---

### 4.4 Decision Output

> 不再有獨立的 `ProbeDecision` 型別。最終決策輸出統一使用 `CommitMemo`。
> 正式定義見 `./shared-types.md` §5.5。

```ts
// 正式定義見 ./shared-types.md §5.5
type CommitMemo = {
candidateId: string;
regime: Regime;
verdict: "commit" | "hold" | "discard";

rationale: string[];
evidenceUsed: string[];
unresolvedRisks: string[];

whatForgeShouldBuild: string[];
whatForgeMustNotBuild: string[];

recommendedNextStep: string[];
};
```

---

## 5. Evaluator 到底在做什麼

這句最重要：

> **Evaluator 不是把 signal 加總成分數。**
>
> **Evaluator 是在判斷：這個 regime 下，候選路徑是否已經得到足夠現實授權，可以升格到下一層。**

這個「授權」很重要。

- economic 是市場授權
- capability 是能力成長授權
- leverage 是瓶頸存在授權
- expression 是媒介承載授權
- governance 是世界密度與閉環授權
- identity 是人生路徑可承諾授權

不是同一種東西。

---

## 6. Economic Evaluator

### 它問的不是「這點子好不好」
而是：

> **這條路是不是已經收到足夠硬的 buyer / payment-adjacent signal，值得進 Forge？**

---

### 核心輸入
- buyer interest
- buyer commitment
- price conversation
- acquisition friction
- first delivery feasibility

---

### 核心判準

#### A. Buyer shape exists
不是抽象市場，而是：
- 某類人
- 某種情境
- 某個痛點

#### B. Payment-adjacent signal exists
至少有：
- 問價
- 願意談 scope
- 願意試單
- 願意預約
- 願意付小額

#### C. Delivery looks possible
不是光有人想買，還要你能交。

#### D. Build is now the next bottleneck
如果現在最該做的其實還是再碰市場，那不能 commit。

---

### 經典 commit 條件
- 至少一個 buyer 願意進一步談實際交付
- value proposition 沒有一問就碎
- acquisition friction 沒高到不合理
- build 真能提高下一輪 signal 品質

---

### 經典 hold 條件
- 有興趣，但還沒到 payment-adjacent
- buyer 形狀還不穩
- 可能值得第二輪 probe，但不值得 build

---

### 經典 discard 條件
- 大部分 signal 都停留在泛泛有趣
- 一談具體價值就崩
- 必須先 build 很多才能知道會不會賣
- 太像公共共識路徑，沒有 edge

---

## 7. Capability Evaluator

### 它問的不是「這學習法聽起來好不好」
而是：

> **這條 path 有沒有真的讓能力長出來，而不是只是讓人有在學的感覺？**

---

### 核心輸入
- before/after performance
- repeatability
- feedback density
- completion rate
- quality delta

---

### 核心判準

#### A. Skill delta exists
有沒有真的變強？

#### B. Improvement is reproducible
不是一次運氣好。

#### C. Feedback loop is dense enough
如果回饋太稀，這條 path 很容易假熟練。

#### D. Systematizing it would increase learning rate
Forge 出場前，要確定 system 化真的有價值。

---

### commit
- 能力增長明顯
- 可重現
- 練習 loop 已有形狀
- 值得被做成 curriculum / trainer / structured path

### hold
- 有進步，但還不穩
- 需要再跑幾輪才能確認不是錯覺

### discard
- 看起來很認真，但 skill delta 不明顯
- 只是理解更多概念，沒有實際能力增長

---

## 8. Leverage Evaluator

### 它問的不是「這自動化酷不酷」
而是：

> **這個 bottleneck 值不值得被工程化？**

---

### 核心輸入
- baseline time cost
- failure rate
- repeat frequency
- automation delta
- operational pain

---

### 核心判準

#### A. Bottleneck is real
不是主觀煩，而是真的常發生、常卡住。

#### B. Relief is meaningful
不是省 3 秒，是省關鍵成本。

#### C. Automation doesn’t just shift pain elsewhere
常見假改善是前面變快、後面更痛。

#### D. Build would amortize
這件事足夠常發生，值得蓋系統。

---

### commit
- 確認 bottleneck 存在
- automation 帶來明顯節省 / 降錯
- 重複頻率高
- 值得 systematize

### hold
- bottleneck 存在，但 frequency 或 impact 還不夠

### discard
- 自動化的是噪音
- build 複雜度大於節省值

---

## 9. Expression Evaluator

### 它問的不是「這內容題材會不會紅」
而是：

> **這個媒介 / form / production loop，有沒有真的承載住你想要的那個味道？**

---

### 核心輸入
- completion evidence
- coherence across outputs
- felt fit between intent and medium
- audience resonance (small but real)
- production burden

---

### 核心判準

#### A. Medium fit exists
不是因為它方便，而是因為它對味。

#### B. Output coherence exists
不是偶爾一個漂亮片段，而是整體能站住。

#### C. Completion likelihood rises
這條形式是幫你完成，不是讓你更散。

#### D. Building a system won’t flatten the expression
這是 expression evaluator 最特別的地方。

---

### commit
- 這個 form 真的承載住作品
- 重複產出後仍保有味道
- system 化會保護或放大表達

### hold
- 有火花，但還不穩
- 需要再做 2–3 個作品驗證 form

### discard
- form 明顯把原意磨平
- 一 systematize 就變普通

---

## 10. Governance Evaluator

### 它問的不是「這世界聽起來酷不酷」
而是：

> **這個 world form 有沒有足夠 density、closure、outcome richness，值得被 instantiate 成 live world？**

---

### 核心輸入
- state density
- change clarity
- governance pressure
- outcome visibility
- closure test results

---

### 核心判準

#### A. Minimum world has shape
不是純題材，而是真的有 state / change / role / metrics。

#### B. One closure exists
至少能跑：
- observe
- propose
- judge
- apply
- outcome
- precedent

#### C. Consequences are visible
改了之後，世界真的會回應。

#### D. Build will instantiate a world, not a dashboard
這點超重要。

---

### commit
- 最小世界已經成形
- 至少一條 closure 跑通
- pulse / outcome / precedent 都不是假的
- 接下來缺的是 instantiate，不是再幻想

### hold
- world form 很 promising
- 但 closure 還差一個關鍵點，例如 outcome 還不清

### discard
- 本質只是工具穿 world 外衣
- 或只是 aesthetic shell，沒有治理密度

---

## 11. Identity Evaluator

### 它問的不是「這人生選項合理不合理」
而是：

> **這條 path 值不值得更深一層承諾，而不是只停在想像？**

---

### 核心輸入
- lived fit
- reversibility
- energy sustainability
- short-term friction
- longer-term viability

---

### 核心判準

#### A. Path is livable, not just admirable
這條很重要。

#### B. Probe results change self-knowledge
不是聽起來合理，而是走過之後對自己更清楚。

#### C. Commitment level matches evidence
不要用兩週 probe 就做兩年承諾。

#### D. Some uncertainty should remain reversible
identity 類要特別防過早鎖死。

---

### commit
- 這條 path 已有 lived fit
- 值得做下一層 commitment
- 但 commit 常常不是 Forge，而是更深的人生 probe 或制度支援

### hold
- 有吸引力，但還沒有足夠 lived evidence

### discard
- 只是理想自我投射
- 一進去就明顯不 fit

---

## 12. 這六個 evaluator 最大差別是：它們在判不同的「授權」

我把它壓成一張最核心的表：

| Regime | 真正授權 build / next-step 的是什麼 |
|---|---|
| Economic | buyer / payment-adjacent signal |
| Capability | skill growth signal |
| Leverage | bottleneck + efficiency delta signal |
| Expression | medium-fit + completion signal |
| Governance | closure + consequence signal |
| Identity | lived-fit + reversibility signal |

這一張如果忘了，系統又會被 generic scoring 拉平。

---

## 13. Evaluator 不該輸出總分，只該輸出結構化 verdict

我建議 v0 不要做「0–100 commit score」。

因為那很容易讓人誤以為：
- payment signal 72
- aesthetic fit 68
- closure 74

這種數字看似精確，實際上很假。

### v0 應該輸出
- verdict
- rationale
- evidence
- unresolved risks
- next step
- handoff notes

這樣更像 decision，不像 dashboard。

---

## 14. Canonical evaluator interface

```ts
// 正式定義見 ./shared-types.md §5.4
type EvaluatorInput = {
candidate: RealizationCandidate;
probeableForm: ProbeableForm;
signals: SignalPacket[];
context?: Record<string, unknown>;
};

// 正式定義見 ./shared-types.md §5.3
type EvaluatorOutput = {
verdict: "commit" | "hold" | "discard";
rationale: string[];
evidenceUsed: string[];
unresolvedRisks: string[];
recommendedNextStep: string[];
handoffNotes?: string[];
};
```

### 重點
- interface 共通
- internals 不共通

---

## 15. Shell 與 evaluator 的邊界

### Shell 做
- normalize candidate
- run kill filters
- package probes
- collect signal packets
- call evaluator
- format commit memo

### Evaluator 做
- interpret signals
- decide threshold
- declare verdict
- specify what next step means in this regime

這個邊界不清，後面一定會亂。

---

## 16. Same signal, different meaning
這裡很值得講死，因為它可以防很多誤解。

### 例：有人主動回覆
- 在 economic 裡：弱 buyer signal
- 在 expression 裡：可能是 resonance signal
- 在 identity 裡：可能幾乎沒意義
- 在 governance 裡：也不等於 world closure

### 例：build 起來很順
- 在 leverage 裡：不代表值得 build
- 在 economic 裡：更不代表會賣
- 在 governance 裡：不代表 world 有治理密度

所以 evaluator 必須 regime-specific。

---

## 17. Commit 之後給 Forge 的東西也不一樣

### Economic handoff
應交：
- buyer hypothesis
- offer shape
- first build target
- what not to overbuild

### Capability handoff
應交：
- validated practice loop
- quality bar
- feedback structure

### Leverage handoff
應交：
- bottleneck definition
- baseline metrics
- expected efficiency target

### Expression handoff
應交：
- chosen medium/form
- coherence constraints
- what system must not flatten

### Governance handoff
應交：
- selected world form
- minimum world shape
- canonical closure target
- state/change primitives

### Identity handoff
很多時候不一定交 Forge；
可能交給「next staged probe」而不是 build。

---

## 18. Edda 在 evaluator 層的價值

Edda 在這一層不只是記最後 commit 了什麼，
而是要記：

- 哪種 signal 被證明是假陽性
- 哪些 evaluator 過度樂觀
- 哪些 hold 後來應該更早 discard
- 哪些 commit 後來證明是太早 build
- 哪種 probe form 對某 regime 最有鑑別力

這些才是真正會讓系統變強的 decision memory。

---

## 19. v0 最小落地建議

不要六個 evaluator 同時細做。
先做兩個就夠：

### 先做
1. `economic-evaluator`
2. `governance-evaluator`

因為這兩個最能拉開：
- market / payment logic
- world / closure logic

而且也最接近你現在的主線。

其他四個先保留 interface 與最小判準，不急著細化。

---

## 20. 最後一句

> **`probe-commit` 不是在做一般性的“好不好”判斷。**
>
> **它是在問：在這個 regime 裡，這條路有沒有得到足夠現實授權，可以升格到下一層。**
>
> 這個授權，在 economic 是付費訊號，
> 在 governance 是閉環訊號，
> 在 expression 是承載訊號，
> 在 capability 是成長訊號。
>
> 把它們拉平成同一種 selection score，整套前置層就會失真。

---

如果你要，我下一步最合理是：

1. `intent-router.md`
2. `economic-evaluator-v0.md`
3. `governance-evaluator-v0.md`

我會建議先做 **1**，因為 router 還是整個前置層的入口。