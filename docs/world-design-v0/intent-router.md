# intent-router.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：把整個前置層真正的入口固定下來。
>
> 這份文件不處理：
> - realization space generation
> - probing
> - selection / commit
> - build
> - governance runtime
>
> 它只處理最前面那一刀：
>
> > **使用者現在到底在問哪種 terminal intent 問題？**
>
> 如果這一刀切錯，後面：
> - `path-check`
> - `space-builder`
> - `probe-commit`
> - `forge`
> - `thyra`
>
> 全都會被帶歪。

---

## 1. 一句話

> **Intent Router 的工作，不是理解題材，而是理解：使用者到底想改變哪種現實。**

不是看他有沒有提到：
- 影片生成
- AI agent
- workflow
- 社群
- 建站
- world

這些都只是表面材料。

真正要問的是：

> **他想增加的是什麼？減少的是什麼？維持的是什麼？變成的是什麼？**

也就是：
- 收入？
- 能力？
- 時間？
- 作品完成？
- 世界活性？
- 人生路徑？

---

## 2. 它在整體架構中的位置

```text
user input
→ intent-router
→ path-check
→ if unfixed: space-builder → probe-commit
→ if fixed enough: forge
→ later thyra
↘ edda as decision spine
```

Intent Router 是入口。
但它不是「萬能理解器」。
它只決定：

- primary regime
- optional secondary regime
- 目前還缺哪些關鍵資訊

它不應該搶做 path-check、space-builder、selection。

---

## 3. Router 不該做的事

### 不該做 1：直接給方案
一旦 router 開始給：
- business ideas
- build plans
- world forms
- vehicle options

它就越權了。

---

### 不該做 2：把題材當 regime
例如：
- 影片生成 → expression？
- 影片生成 → economic？
- agent → leverage？
- market → governance？

都不一定。

同一個題材，在不同 intent 下是不同 regime。

---

### 不該做 3：把 path certainty 混進 regime
這是上一輪已經修掉的。

`execution/build` 不是 regime。
它是 path-check 之後才會出現的 fast-path 結果。

---

### 不該做 4：把次要動機當主 regime
例如：
- 「我想用影片生成賺錢」
主 regime 是 economic，不是 expression

- 「我想做一個 creator market 順便賺錢」
可能主 regime 是 governance，economic 是 secondary

Router 要能分主次，不要只看字面。

---

## 4. Router 的核心原則

### 原則 1：看終局，不看手段
像：
- 賺錢
- 變強
- 省時間
- 做出作品
- 開一個地方
- 換生活方式

這些才是 regime 線索。

---

### 原則 2：先判 primary regime，再補 secondary
v0 不要一開始就做複雜混合優化。
先找 primary，再附 secondary。

---

### 原則 3：輸出 missing fields，而不是假裝理解完成
Router 最值錢的地方，不是「自信分類」，
而是知道還缺什麼。

---

### 原則 4：confidence 不等於真理
低 confidence 時，應產生 follow-up questions，
而不是硬選一個 regime。

---

## 5. v0 六種 regimes

這裡是目前固定版本。

### 5.1 Economic
想改變的是：
- 收入
- 現金流
- ROI
- 付費訊號

### 5.2 Capability
想改變的是：
- 能力
- 熟練度
- 品質門檻
- 一致性

### 5.3 Leverage
想改變的是：
- 時間成本
- throughput
- friction
- error rate

### 5.4 Expression
想改變的是：
- 作品完成
- 媒介承載
- 美學一致性
- resonance

### 5.5 Governance
想改變的是：
- 世界活性
- 可治理性
- 持續運作
- consequence-bearing operation

### 5.6 Identity
想改變的是：
- 人生路徑
- 角色轉換
- 長期適配
- 可逆承諾

---

## 6. Each regime 的核心問句

這裡不是 examples，而是 router 要抓的「真正問題」。

### Economic
> 怎樣先得到最值得押的付費訊號？

### Capability
> 怎樣真的變強，而不是只是接觸更多資訊？

### Leverage
> 哪個 bottleneck 最值得被系統化？

### Expression
> 哪個媒介 / form 最能承載這個作品意圖？

### Governance
> 哪個地方值得被開起來並被治理？

### Identity
> 哪條人生/角色 path 值得進一步承諾？

這六句比單看關鍵字重要。

---

## 7. 常見語句訊號（signals）

Router 不是 keyword classifier，
但 keyword 還是有幫助。

---

### Economic signals
- 賺錢
- 收入
- ROI
- 副業
- 現金流
- 付費
- 客戶
- 變現
- 1000 美金怎麼花

---

### Capability signals
- 學會
- 練熟
- 變強
- 上手
- 真的會
- 從零到能做
- 練習

---

### Leverage signals
- 省時間
- 自動化
- 提高效率
- 重複工作
- 流程優化
- bottleneck
- throughput

---

### Expression signals
- 作品
- 味道
- 風格
- 表達
- 敘事
- 這種感覺
- 想做出來

---

### Governance signals
- 開一個地方
- 讓它自己運作
- 經營一個場域
- world
- market
- village
- 讓 AI 管

---

### Identity signals
- 轉職
- 換工作方式
- 成為某種人
- 長期想走哪條路
- 生活模式
- 是否適合我

---

## 8. 但 router 不能只靠關鍵字

這點一定要講死。

### 例子 1
> 我想用影片生成賺錢

有：
- 影片生成（expression/capability 類字）
- 賺錢（economic 類字）

主 regime 仍是 `economic`。

---

### 例子 2
> 我想把影片生成 workflow 跑熟

有：
- workflow（leverage 類字）
但終局意圖是：
- 變強
所以主 regime 應是 `capability`。

---

### 例子 3
> 我想做一個 creator market，之後最好也能賺錢

有 economic signal，
但 primary 可能是 `governance`，economic 是 secondary。

所以 router 的判斷核心必須是：
- **什麼是終局**
- **什麼是手段**
- **什麼是附帶願望**

---

## 9. Router 輸出格式

> **Canonical type**: `IntentRoute` — 正式定義見 `./shared-types.md` §2.1。
> 以下為簡要參考，以 shared-types.md 為準。

```ts
type IntentRoute = {
  primaryRegime: Regime;
  secondaryRegimes?: Regime[];
  confidence: number;       // 0-1
  signals: string[];
  rationale: string[];
  keyUnknowns: string[];
  suggestedFollowups: string[];
};
```

這個輸出要夠輕，不要把 path-check 的責任偷帶進來。

---

## 10. `keyUnknowns` 是 router 的真正價值之一

除了 regime，router 最應該產出的就是：

> **現在最缺哪種資訊，才能讓後面路由更準。**

例如：

### economic 常缺
- edge profile
- buyer shape
- time horizon
- risk tolerance

### capability 常缺
- current level
- target quality bar
- available practice time

### governance 常缺
- desired pressure source
- outcome surface
- world requirements

如果 router 不產這些，後面 space-builder 很容易只好亂猜。

---

## 11. `suggestedFollowups` 應該 regime-specific

router 不要問 generic 問題。
要問最能讓 search space 收斂的問題。

---

### Economic followups
- 你比較靠近哪群可能 buyer？
- 你要第一筆收入，還是 recurring？
- 你能不能直接對外接觸潛在客戶？

---

### Capability followups
- 你現在卡在哪一段？
- 你希望作品/表現達到什麼水準？
- 你每週能投入多少有效練習時間？

---

### Leverage followups
- 你現在最常被哪一步卡住？
- 這件事一週重複幾次？
- 你想省的是時間、錯誤，還是腦力負擔？

---

### Expression followups
- 你想保住的是什麼味道？
- 哪個媒介目前最接近那個感覺？
- 你要的是完整作品，還是系列實驗？

---

### Governance followups
- 你想經營的是哪一種地方？
- 這個地方的壓力會從哪裡來？
- 你想看到的結果是秩序、交易、參與，還是活性？

---

### Identity followups
- 你想離開的是什麼？
- 你想靠近的是什麼？
- 你需要可逆的試探，還是已經準備承諾？

---

## 12. Canonical examples

---

### Example A
輸入：
> 我想賺錢，這裡有 1000 美金

#### 輸出
```json
{
"primaryRegime": "economic",
"confidence": 0.95,
"signals": ["money goal", "explicit budget", "no domain fixed"],
"rationale": [
"The user is optimizing for cash outcome, not learning, expression, or governance.",
"Budget is framed as capital, not as tool spend."
],
"keyUnknowns": [
"edge profile",
"buyer proximity",
"time horizon"
],
"suggestedFollowups": [
"你已經比一般人更熟哪一塊？",
"你要第一筆收入，還是穩定 recurring？",
"你能不能直接接觸潛在 buyer？"
]
}
```

---

### Example B
輸入：
> 我想用影片生成賺錢

#### 輸出
```json
{
"primaryRegime": "economic",
"secondaryRegimes": ["expression"],
"confidence": 0.88,
"signals": ["money goal", "domain bounded by video generation"],
"rationale": [
"Video generation is the domain, but money is the terminal intent."
],
"keyUnknowns": [
"vehicle type",
"buyer shape",
"edge within video generation"
],
"suggestedFollowups": [
"你在影片生成裡最強的是哪一段？",
"你比較想賣服務、產品包，還是工具？"
]
}
```

---

### Example C
輸入：
> 我想把影片生成 workflow 跑熟

#### 輸出
```json
{
"primaryRegime": "capability",
"secondaryRegimes": ["leverage"],
"confidence": 0.9,
"signals": ["mastery language", "workflow familiarity goal"],
"rationale": [
"The terminal intent is skill acquisition, not money or automation itself."
],
"keyUnknowns": [
"current level",
"target quality bar",
"practice frequency"
],
"suggestedFollowups": [
"你現在卡在哪一段？",
"你要練到什麼等級才算成功？"
]
}
```

---

### Example D
輸入：
> 我想開一個會自己運作的地方，讓 AI 經營它

#### 輸出
```json
{
"primaryRegime": "governance",
"confidence": 0.93,
"signals": ["world/space language", "self-operating place", "AI as operator"],
"rationale": [
"The terminal intent is to create and govern a consequential operating space."
],
"keyUnknowns": [
"world form",
"pressure source",
"outcome surface"
],
"suggestedFollowups": [
"你想開的是 market、commons，還是別種地方？",
"這個地方的壓力會從哪裡來？",
"你想看到的結果是交易、秩序、還是參與活性？"
]
}
```

---

### Example E
輸入：
> 我想從接案慢慢轉成做自己的產品

#### 輸出
```json
{
"primaryRegime": "identity",
"secondaryRegimes": ["economic"],
"confidence": 0.86,
"signals": ["role transition", "life path change", "economic subtext"],
"rationale": [
"The primary concern is path transition, not immediate execution."
],
"keyUnknowns": [
"reversibility requirement",
"timeline",
"current constraints"
],
"suggestedFollowups": [
"你要的是可逆試探，還是已經準備下較大承諾？",
"你現在不能失去的是什麼？"
]
}
```

---

## 13. Router 的判斷順序

我建議固定成這個順序：

```text
1. 看使用者最終想改變什麼現實
2. 把 domain/tool/topic 當 secondary evidence，不當 primary evidence
3. 判 primary regime
4. 補 secondary regime
5. 提取 key unknowns
6. 生成 regime-specific followups
```

這個順序很重要。
如果先看題材，router 很容易被帶歪。

---

## 14. v0 的低 confidence 處理

不是每次都要硬選。

如果 confidence 太低，router 應該：

### 14.1 先輸出最可能的兩個 regime
例如：
- `economic` vs `identity`
- `expression` vs `capability`

### 14.2 給 discriminating followups
不是問一堆背景，
而是問最能分 regime 的問題。

#### 例如
> 你更在意的是先賺到錢，還是先做出你真的認可的作品？

這種問題就很有區辨力。

---

## 15. Intent Router 和 Path Check 的邊界

這裡要再講一次，避免之後混掉。

### Intent Router 問：
> 你到底在追哪種終局？

### Path Check 問：
> 你距離 build，還缺搜索空間還是只缺工程？

一個是 **what reality are we changing**
一個是 **how fixed is the realization path**

不能混。

---

## 16. 與 Edda 的關係

Edda 應記錄：

- 哪種語句常被判成哪個 regime
- 哪些 router 判斷後來證明是錯的
- 哪些 secondary regime 常一起出現
- 哪些 follow-up 問題最有鑑別力

因為 router 做久了也會長 precedent。
這是 decision spine 的第一節。

---

## 17. 最小模組切法

如果真做成模組，我會切成這三個：

### `signal-extractor`
從輸入中抓：
- goal phrases
- domain hints
- regime hints
- unresolved cues

### `regime-classifier`
輸出：
- primary / secondary regime
- confidence
- rationale

### `unknowns-and-followups`
輸出：
- key unknowns
- next best questions

這樣 router 不會變黑盒。

---

## 18. 最後一句

> **Intent Router 的責任，不是替你想方案。**
>
> **它的責任是先搞清楚：你現在到底在問錢、能力、槓桿、作品、世界，還是人生。**
>
> 只有這一刀切對了，後面 space-builder 才不會長錯空間，probe-commit 才不會拿錯判準，Forge 也才不會太早出場。

---

如果你要，我下一步最合理的是：

1. `frontend-flow-v0.md`
2. `edda-decision-spine.md`
3. `router-test-cases.md`

我會建議先做 **3**，因為 router 這種東西沒有 test cases 很容易看起來對、實際亂飄。