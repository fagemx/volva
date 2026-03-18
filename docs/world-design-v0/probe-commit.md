# probe-commit.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：定義 `intent-router-and-space-builder.md` 之後，系統如何從一組 `realization candidates` 走到：
>
> - 哪些要砍
> - 哪些值得測
> - 錢先花在哪裡
> - 什麼時候才有資格進 Forge
>
> 這份文件處理的不是 build，也不是 operate。
> 它處理的是：
>
> > **在還沒承諾工程化之前，怎麼用最小成本買到足夠真實的訊號。**

---

## 1. 一句話

> **Probe / Commit 層的工作，不是找最好看的答案，而是找最值得押的下一步。**

它的責任只有四個：

1. **砍掉不值得測的 candidates**
2. **把值得測的 candidates 轉成真實 probe**
3. **分配有限資本去買訊號**
4. **根據訊號決定 commit / hold / discard**

這一層如果做不好，前面的 `space-builder` 只會變成高級 brainstorm，
後面的 `forge` 也會太早出場。

---

## 2. 它在整體架構裡的位置

```text
intent-router
→ path-check
→ space-builder (expand + constrain)
→ probe-commit (shell + regime evaluators)
→ forge
→ thyra

edda = decision spine across all layers
```

### 它不是什麼
- 不是 strategy memo
- 不是 launch plan
- 不是 build roadmap
- 不是 market report
- 不是通用打分器（不能把所有 regime 拉平成 selection engine）

### 它是什麼
- 一個 **共通殼 + regime-specific evaluator** 的決策層
- 共通 shell 做流程骨架
- regime-specific evaluator 做判斷內核

---

## 3. 為什麼這層必須獨立

因為現在最常見的死法是：

### 死法 A：space-builder 太會講
長出很多 candidate，看起來都合理。

### 死法 B：系統沒做 probe，直接進 Forge
於是很快得到：
- 網站
- pipeline
- automation
- content calendar
- product structure

但這些都還沒被真實訊號授權。

### 死法 C：probe 做得像研究，不像碰市場
看了很多資料，但沒接觸真實世界。

### 死法 D：commit 沒門檻
只要某條路「聽起來不錯」，就工程化。

所以 Probe / Commit 要獨立，
就是要把這四種死法切開。

---

## 4. 核心定義

### 4.1 Probe
不是分析。
是**最小但會產生外部回應的行動**。

probe 的核心特徵：
- 有成本
- 有對象
- 有風險
- 有可觀察回應
- 會排除一部分幻想

---

### 4.2 Commit
不是「我喜歡這條」。
而是：

> **這條路已經得到足夠真實的訊號，值得進入 build / systemization。**

commit 是一個門檻，不是情緒。

---

### 4.3 Signal
不是任何資料都算 signal。

真正的 signal 至少要改變一個判斷：
- buyer 是否存在
- path 是否值得走
- friction 是否過高
- value 是否清楚
- world / vehicle 是否有足夠密度

---

## 5. Probe / Commit 的架構：共通 shell + regime-specific evaluator

這是這輪最重要的修正之一。

如果不這樣處理，最後很容易又把所有 regime 拉平成「selection engine」。
但不同 regime 問的完全不同。

### 共通 Shell

共通 shell 做流程骨架，所有 regime 共用：

```text
Candidates
→ Kill Filters
→ Probe Packaging
→ Budget Allocation
→ Probe Runs
→ Signal Packet
→ Commit Memo
→ Commit | Hold | Discard
→ Handoff to Forge
```

### Regime-Specific Evaluator

每個 regime 的 evaluator 決定：
- **signal interpretation**：同樣的數據在不同 regime 下意味什麼
- **commit threshold**：什麼門檻才算夠
- **what counts as disconfirming evidence**：什麼結果代表這條該砍

#### Economic Evaluator
看：付費訊號、acquisition friction、payback

#### Capability Evaluator
看：skill delta、feedback density、可重現性

#### Expression Evaluator
看：媒介 fit、味道承載、完成可能性

#### Leverage Evaluator
看：bottleneck confirmation、efficiency delta、repeat frequency

#### Governance Evaluator
看：world density、closure、後果豐富度

#### Identity Evaluator
看：reversibility、sustainability、self-fit

這樣整體才不會被 selection 這個詞偷偷平均化。

---

## 6. 先講最重要的：不是所有 candidate 都值得 probe

很多 candidate 應該在 probe 前就被砍掉。

這一步叫：

# Kill Filters

如果沒有這一層，系統會把資本浪費在「看起來可以，但其實沒必要測」的路上。

---

## 7. Kill Filters v0

這裡要故意 brutal 一點。

### 7.1 Common Bad Bets
如果 candidate 太像公共共識答案，直接降權。

#### 典型例子
- 建站 + SEO 等半年
- 經營社群媒體等演算法給飯吃
- 做 generic template pack 沒有明確 buyer
- 做 everyone-can-use 的 AI 工具
- 做廣義教學內容但沒有特殊分發優勢

這些不是永遠錯，
但對「有限資本下的 probe」來說，通常不值得先測。

---

### 7.2 Signal Too Distant
如果這條路要很久才知道有沒有人會買，先砍。

例如：
- 要先 build 兩個月
- 要先累積 100 支影片
- 要等 SEO ranking
- 要等社群長起來

這類不是不能做，
而是**不配拿第一輪 probe 預算**。

---

### 7.3 Low Asymmetry
如果這條路誰都能做，而且看不出使用者有什麼 edge，先砍。

Probe 的前提不是「理論可行」，
而是「在這個人身上比平均機率更高」。

---

### 7.4 No Clear Buyer / No Clear Judge
如果連這兩件事都說不清，就不要測：

1. 誰可能付錢 / 誰可能接受這個 path
2. 什麼結果算 signal

沒有 buyer，就沒有 economic probe。
沒有 judge，就沒有有效 probe。

---

### 7.5 Too Heavy Before Contact
如果這條路必須先大建設，才能第一次接觸現實，先砍。

這一條是用來防：
- 太早進 Forge
- 太早 platform 化
- 太早做世界觀工程

---

## 8. Kill 後留下來的 candidate，要被轉成 `probeable form`

Space Builder 給你的只是 candidate。
Probe 層要做的是把它變成：

> **可以被世界回應的一個最小實驗。**

這一步很關鍵。

---

## 9. Probeable Form 的五個欄位

每個 candidate 進 probe 前，至少要被壓成這五個欄位：

### 1. What exactly is being tested?
到底在測什麼，不要模糊。

### 2. Who is the judge?
誰來給反應？市場、使用者、買家、學習成果、世界狀態？

### 3. What counts as signal?
什麼結果算「值得繼續」？

### 4. What is the cheapest believable test?
最便宜但還算真的測試是什麼？

### 5. What would disconfirm it?
什麼結果出現就代表這條應該降級甚至砍掉？

這五個欄位不清，probe 只會變成亂試。

---

## 10. Probe 類型不是只有一種

不同 regime 的 probe 不一樣。
這點要講清楚。

---

### 10.1 Economic probes
核心是測：
- 有沒有人付錢
- 付費動機強不強
- acquisition friction 高不高

常見形式：
- DM offer
- landing page + CTA
- waitlist
- pre-sale
- concierge service
- sample deliverable
- paid pilot
- ad test

---

### 10.2 Capability probes
核心是測：
- 這條 path 會不會真的讓能力上升
- 是否只是看起來在學

常見形式：
- 7-day challenge
- timed project
- before/after quality comparison
- repeated reproduction task
- mentorless completion test

---

### 10.3 Leverage probes
核心是測：
- 這條 automation 真能省下關鍵成本嗎
- 還是只是做了一個炫但不重要的系統

常見形式：
- bottleneck timing
- baseline vs automated run
- manual-assisted vs pipeline comparison
- failure rate delta

---

### 10.4 Expression probes
核心是測：
- 這個媒介 / format 有沒有真的承載那個味道
- 會不會一做就變普通

常見形式：
- single-piece production
- 3-variation aesthetic test
- limited audience resonance test
- comparative form test

---

### 10.5 Governance probes
核心是測：
- 這個 world form / minimum world 有沒有足夠 state/change density
- 它是不是只是看起來像世界

常見形式：
- minimal state instantiation
- one-cycle governance test
- one-change-one-outcome closure
- pulse visibility test

---

## 11. Probe 不是越便宜越好，而是要「最便宜但還能逼出現實」

這句要講死。

因為很多系統會滑向：
- 問一個 LLM
- 寫一份報告
- 看競品
- 猜測

這些都很便宜，
但它們 often 不是 probe。
它們沒有逼到現實。

所以 probe 的原則應該是：

> **Cheapest believable contact with reality**

不是 cheapest possible action。

---

## 12. Budget Allocation：錢不是拿去 build，是拿去買訊號

這是 economic regime 最容易被做錯的地方。

### 錯的花法
- 先做網站
- 先買全套工具
- 先弄品牌
- 先做完整 automation
- 先拍一堆內容

### 對的花法
- 買 buyer signal
- 買 response
- 買 conversion friction data
- 買 willingness-to-pay evidence
- 買「這條值不值得押」的判斷權

---

## 13. Budget Allocation v0

不是每種 regime 都要花錢，
但凡有顯式 budget 時，都應該這樣分 thinking：

### 13.1 Signal Budget
多少預算拿去直接買現實回應？

### 13.2 Setup Budget
多少預算拿去讓 probe 能發生？

### 13.3 Fulfillment Budget
如果 probe 成功，最小交付要靠哪些資源？

### 13.4 Reserve Budget
保留多少預算給：
- 第二候選
- 方向修正
- 加碼已出 signal 的路

---

## 14. Economic regime 的建議分法

如果像你前面那種 case：
> 我想賺錢，給你 1000 美金

v0 我會這樣分：

- **35% Signal Budget**
- **25% Setup Budget**
- **20% Fulfillment Budget**
- **20% Reserve Budget**

### Signal Budget 用在哪
- ad tests
- DM / outreach support
- landing page acquisition
- target user incentives
- niche community entry cost

### Setup Budget 用在哪
- 最小可展示頁
- sample asset
- booking / checkout path
- communication setup

### Fulfillment Budget 用在哪
- 做第一個樣本交付
- 半人工代做
- 小範圍客製化

### Reserve Budget 用在哪
- 對成功 probe 加碼
- 對次佳候選做第二輪 probe

---

## 15. Probe Run 的輸出，不是 raw logs，而是 `signal packet`

這也是很多系統會做歪的地方。

Probe 結束後不能只是留：
- click 數
- 回覆數
- 訪談筆記
- 世界事件流

而是要壓成：

# Signal Packet

```ts
// 正式定義見 ./shared-types.md §5.2
type SignalPacket = {
candidateId: string;
probeId: string;
regime: Regime;

signalType: string; // regime-specific，不做 union enum

strength: "weak" | "moderate" | "strong";
evidence: string[];
negativeEvidence?: string[];
interpretation: string;
nextQuestions: string[];
};
```

這樣後面才有辦法真的 compare。

---

## 16. Signal Review：不是加總，而是回答三個問題

每次 probe review，只回答這三個：

### 1. 這條路有沒有活的跡象？
不是完整證明，只是活的跡象。

### 2. 這個跡象是來自 candidate 本身，還是偶然？
避免被假陽性騙。

### 3. 接下來最值得做的是：
- 加碼
- 換 probe
- hold
- kill

這樣 review 才像決策，不像報告。

---

## 17. Commit 不是感覺，是門檻

這裡一定要講死。

一條 candidate 要進 Forge，至少要滿足三件事：

### 17.1 Shape is stable
它已經不是 vague candidate。
已經有相對穩定的：
- buyer / user / world form
- vehicle / path / mechanism
- expected value

### 17.2 Signal is external
不是內部認為合理，
而是外部世界有回應。

### 17.3 Build is now the bottleneck
也就是：
> 再不 build，就拿不到下一階段訊號。

這一點超重要。

很多人太早進 Forge，
是因為把「build 很想做」誤認成「build 現在必要」。

---

## 18. Commit 的三種結果

不是只有 commit / no commit。

### 18.1 Commit
進 Forge。

### 18.2 Hold
候選不是錯，但現在不值得再投。

### 18.3 Discard
這條應該被砍，至少目前先砍。

---

## 19. Commit Memo v0

每條 candidate 在真正 commit 前，要有一張非常硬的 memo。

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

最後幾欄很重要：

### `whatForgeShouldBuild`
定義 Forge 的 build 邊界。

### `whatForgeMustNotBuild`
防止一進 Forge 就過度工程化。

---

## 20. Forge handoff 不是「把點子丟給 builder」
而是：

> **把一條被世界授權的 realization path，交給 build organ。**

這句要成立，前面 Probe / Commit 才算有完成使命。

---

## 21. 不同 regime，下 Commit 的門檻不一樣

這裡不能偷懶。

---

### 21.1 Economic commit
至少要有：
- 明確 buyer 假說
- 某種 willingness-to-pay signal
- acquisition path 不完全虛構
- build 會顯著提升訊號品質

---

### 21.2 Capability commit
至少要有：
- 某條 path 真的比其他 path 更有效
- 能力增長可觀察
- 值得 systematize / curriculum-ize

---

### 21.3 Leverage commit
至少要有：
- bottleneck 確認存在
- 自動化後有顯著節省
- 不是在優化噪音

---

### 21.4 Expression commit
至少要有：
- 某個媒介 / 形式真的承載住那個味道
- 作品路徑開始穩定
- build 不會毀掉表達本身

---

### 21.5 Governance commit
至少要有：
- 這個 world form 有足夠 state/change 密度
- 至少一個 minimal cycle 能閉
- pulse / outcome / precedent 能成立

這裡就會接到 Thyra 線。

---

## 22. 和 Edda 的關係

Edda 是 decision spine，不是 pipeline 最後一格。

在 probe-commit 這層，Edda 記錄：

- 哪些 candidate 被 kill（以及為什麼）
- probe designs（用了什麼形式、為什麼）
- signal packets（每個 probe 的結果）
- commit memos（決策依據）
- 哪種 probe 最有效
- 哪些 signal 是假陽性
- 哪些 commit 後來證明是錯的

這些記錄同時也回饋給 regime-specific evaluator，
讓它越來越會判斷在這個 regime 下什麼 signal 真的有效。

這層如果沒有記，系統很難越來越會選。

---

## 23. 最小模組切法

如果真要做成系統，架構是 shell + plug-ins：

### 共通 Shell 模組

#### `kill-engine`
做 hard filters（共通 + regime-specific kill rules）

#### `probe-designer`
把 candidate 壓成 probeable form

#### `signal-review`
把 probe outputs 壓成 signal packets

#### `commit-engine`
輸出 commit memo / handoff

### Regime Evaluator Plug-ins

#### `economic-evaluator`
signal interpretation: 付費訊號、acquisition friction、payback
commit threshold: buyer shape + payment-adjacent signal + manual delivery possible

#### `capability-evaluator`
signal interpretation: skill delta、feedback density、可重現性
commit threshold: path effectiveness + observable growth + systematize value

#### `expression-evaluator`
signal interpretation: 媒介 fit、味道承載、完成可能性
commit threshold: medium carries the taste + production path stable + build won't destroy expression

#### `governance-evaluator`
signal interpretation: world density、closure、後果豐富度
commit threshold: minimum world shape + one closure exists + build is bottleneck

#### `identity-evaluator`
signal interpretation: reversibility、sustainability、self-fit
commit threshold: path viability + staged probes done + identity alignment confirmed

這樣比做成一個大 planner 或通用 selection engine 清楚。

---

## 24. 兩個 concrete 例子

---

### Example A — Economic
輸入：
> 我想賺錢，這裡有 1000 美金

#### Space Builder 長出
- 影片生成 × workflow install service
- agent setup × done-for-you service
- template pack × creator niche
- AI tool onboarding × small studio package

#### Probe / Commit
先 kill 掉：
- generic content site
- broad template marketplace

留下：
- workflow install service
- small studio package

設計 probe：
- DM 10 個工作室
- landing page + booking CTA
- sample deliverable

看 signal：
- 有 3 個明確回覆
- 1 個願意談試單
- 2 個問價

這時才可能 commit 到 Forge。

---

### Example B — Governance
輸入：
> 我想開一個會自己運作的地方，讓 AI 管它

#### Space Builder 長出
- market
- creator commons
- town
- night engine
- port

#### Probe / Commit
先 kill 掉：
- town（太鬆）
- port（太大）

留下：
- market
- night engine

設計 probe：
- minimal state model
- one-cycle governance closure
- one-change-one-outcome test
- pulse visibility

signal：
- market/night engine 能跑出最短閉環
- world density 最夠
- pulse/outcome 最可見

這時才 commit 到 Forge / Thyra 線。

---

## 25. 最後一句

> **Space Builder 長出可能性。**
>
> **Probe / Commit 決定哪條可能性有資格被工程化。**
>
> 沒有這一層，Forge 會變成過早建造機；
> 有了這一層，Forge 才是在替世界已經授權的路徑蓋骨架。

---

接下來該做的是把每個 regime evaluator 的接口釘死：
→ `probe-commit-evaluators.md`
