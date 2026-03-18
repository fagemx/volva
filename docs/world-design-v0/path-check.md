# path-check.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：定義在 `intent-router` 之後，系統如何判斷：
>
> > **這個需求的 realization path 到底已經固定到什麼程度？**
>
> 也就是說：
> - 哪些情況還需要進 `space-builder`
> - 哪些情況其實可以直接 fast-path 到 `forge`
> - 哪些情況表面看起來很清楚，其實還差最後幾個關鍵未定元素
>
> 這份文件存在的理由很簡單：
>
> **不要把所有問題都丟去 build，也不要把已經很清楚的問題重新拉回探索。**

---

## 1. 一句話

> **Path Check 是在問：這題缺的是「搜索空間」，還是只缺「工程實作」？**

如果缺的是前者，就進：
- `space-builder`
- `probe-commit`

如果缺的是後者，就直接：
- `forge`

所以它不是在判斷「這題難不難」，
而是在判斷：

> **這題的 realization path 是否已經足夠固定。**

---

## 2. 它在整體架構中的位置

```text
terminal intent
→ intent-router
→ path-check
→ if unfixed: space-builder → probe-commit
→ if fixed enough: forge
→ later thyra
↘ edda as decision spine
```

---

## 3. 為什麼需要這層

如果沒有 `path-check`，系統會犯兩種相反的錯：

### 錯 A：太早 build
使用者只是說：
- 我想賺錢
- 我想開一個地方
- 我想用影片生成做點事

系統就直接開始規劃：
- 架構
- pipeline
- 網站
- 自動化
- 發布

這是最常見的錯。

---

### 錯 B：明明已經很清楚，卻還在發散
使用者其實已經說清楚：
- domain
- vehicle
- 交付形式
- 操作方式
- 甚至 bottleneck

但系統還拉回：
- 機會探索
- 多路比較
- realization space generation

這會浪費時間，也會讓回答變鬆。

---

## 4. 核心定義

### 4.1 Realization Path
從 terminal intent 到可 build form 中間那條路，至少包含：

- domain
- vehicle / world form
- target user / audience / participant
- core mechanism
- success condition
- first build target

---

### 4.2 Fixed enough
不是說所有細節都清楚。
而是說：

> **已經清楚到，不需要再生成 search space 才能開始 build。**

這個門檻很重要。

因為很多時候：
- strategy 還沒完整
- growth 還沒想清楚
- pricing 還沒定
- UI 還沒畫

但 realization path 已經夠固定了。
這種情況就應該直接進 Forge。

---

### 4.3 Unfixed path
不是單純模糊，
而是：

> **關鍵承載元素還沒決定，所以現在 build 任何東西都太早。**

這時就該回到：
- `space-builder`
- `probe-commit`

---

## 5. Path Check 回答的不是「有沒有目標」
而是這五個東西固定了沒：

### 1. Domain 是否已固定
是在哪個現實領域落地？

例如：
- 影片生成
- agent workflow
- night market
- 設計師 automation
- 學習 path

---

### 2. Form 是否已固定
承載形式是什麼？

例如：
- service
- workflow pack
- world
- learning path
- pipeline
- productized install
- operator model

這個如果沒定，通常不能進 Forge。

---

### 3. Buyer / User / Participant 是否已固定
這個東西是給誰的？

例如：
- 小工作室
- 設計師
- 使用者自己
- 市場參與者
- 一個 live world 裡的居民/操作員

---

### 4. Core Loop 是否已固定
最小閉環是什麼？

例如：
- 影片生成流程安裝 → 交付 → 客戶驗收
- world observe → propose → judge → apply
- practice → feedback → redo
- content generate → publish → measure

如果這個都不清楚，通常還太早。

---

### 5. Build Target 是否已固定
Forge 到底要蓋什麼？

如果現在還說不出：
- 第一個要 build 的東西是什麼
那就還沒到 Forge。

---

## 6. v0 的判斷原則

### 原則 1：不是資訊越多就代表 path fixed
有時候你知道很多背景，
但關鍵 realization 還沒決定。

### 原則 2：不是有 domain 就代表 path fixed
例如：
- 「我想用影片生成賺錢」
只固定了 domain，沒固定 vehicle。

### 原則 3：不是有工具/技術棧就代表 path fixed
例如：
- 「我想做一個用 Seedance / FFmpeg / 即夢的系統」
可能只是 tooling clarity，不是 realization clarity。

### 原則 4：world / vehicle / service / path 四者不能混
不同 regime 下，固定的關鍵元素不一樣。

---

## 7. Path Check 的輸出

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

type FixedElement = {
kind: "intent" | "domain" | "form" | "buyer" | "loop" | "build_target";
value: string;
};

type UnresolvedElement = {
kind: "domain" | "form" | "buyer" | "loop" | "build_target" | "signal";
reason: string;
severity: "blocking" | "important" | "nice_to_have";
};
```

---

## 8. 三種 route，不要只做兩種

我不建議只分：
- space-builder
- forge

v0 應該有第三種：

# `space-builder-then-forge`

因為有些問題不是完全不清楚，
而是只差最後一層 vehicle/world selection。

這種情況不該被丟回 full exploration，
但也不該直接 build。

---

## 9. Route 定義

### 9.1 `space-builder`
適用情況：
- domain 未定
- form 未定
- buyer/world participant 未定
- core loop 未定
- build target 未定

這就是典型第一種。

---

### 9.2 `space-builder-then-forge`
適用情況：
- intent 已清楚
- domain 大致清楚
- 但 form / world form / vehicle 仍未決
- 或者 build target 還依賴一個最後的 selection/probe

這類問題其實很多。

例如：
- 我想用影片生成賺錢
→ domain 清楚，vehicle 不清楚

- 我想做一個會自己運作的地方
→ governance intent 清楚，world form 未定

---

### 9.3 `forge-fast-path`
適用情況：
- domain 已定
- form 已定
- target user/participant 已定
- core loop 已定
- 第一個 build target 已定

這種才應該直進 Forge。

---

## 10. Certainty 不是分數，而是結構狀態

我不建議 path certainty 先做成太多數值模型。
v0 先當成結構狀態。

### Low certainty
至少有兩個以上 blocking unresolved elements。

### Medium certainty
主要 domain/intention 已定，但 form / build target 還差一個關鍵未決。

### High certainty
只剩 implementation 細節，realization 已經夠固定。

---

## 11. Blocking unresolved elements 是什麼

以下幾種 unresolved element，一旦存在，通常不能 direct forge：

### A. Form unresolved
不知道這東西到底是：
- service
- pack
- tool
- world
- path
- operator model

這是最大的 blocker 之一。

---

### B. Buyer unresolved
如果是 economic 類，連誰會買都沒定，不能進 Forge。

---

### C. World form unresolved
如果是 governance 類，連 market / commons / town / night engine 都還沒定，不能進 Forge。

---

### D. Core loop unresolved
如果說不出最小閉環，不能進 Forge。

---

### E. Build target unresolved
如果說不出：
> 第一個要 build 的東西到底是什麼
那就不能進 Forge。

---

## 12. 不同 regime，Path Check 看的東西不同

這裡一定要 regime-aware。

---

### 12.1 Economic
核心看：
- domain 有沒有定
- vehicle 有沒有定
- buyer 有沒有 shape
- signal 是否已足夠授權 build

如果只有「賺錢 + 某個 domain」，通常還是 medium 或 low。

---

### 12.2 Capability
核心看：
- 能力目標有沒有清楚
- path / practice loop 有沒有定
- success criteria 是否清楚

如果只是「我想學會 X」，通常還不能直進 Forge。

---

### 12.3 Leverage
核心看：
- bottleneck 是否確認
- automation target 是否清楚
- baseline 是否已知

很多 leverage 問題其實很快就能 fast-path。

---

### 12.4 Expression
核心看：
- 媒介 / format 是否清楚
- 作品 loop 是否清楚
- build 是否會真的承載表達，而不是稀釋它

---

### 12.5 Governance
核心看：
- world form 是否已定
- minimum world 是否已有 shape
- core cycle 是否清楚
- first closure 是否已知怎麼證明

很多 governance 問題其實只適合：
- `space-builder-then-forge`

不是直接 Forge。

---

### 12.6 Identity
核心看：
- path 是否可 staged probe
- commit 是否可逆
- build 是否真的必要，還是先做人生 probe 更合理

identity 類最不適合太早 direct forge。

---

## 13. Canonical examples

---

### Example A
輸入：
> 我想賺錢，這裡有 1000 美金

#### intent-router
economic

#### path-check
- intent: fixed
- domain: unresolved
- form: unresolved
- buyer: unresolved
- loop: unresolved
- build target: unresolved

#### 結果
```json
{
"certainty": "low",
"route": "space-builder",
"whyNotReady": [
"No economic vehicle selected",
"No buyer shape",
"No build target"
]
}
```

這種如果直接 Forge，就是災難。

---

### Example B
輸入：
> 我想用影片生成賺錢

#### intent-router
economic

#### path-check
- intent: fixed
- domain: fixed (`video generation`)
- form: unresolved
- buyer: unresolved
- loop: partially known
- build target: unresolved

#### 結果
```json
{
"certainty": "medium",
"route": "space-builder-then-forge",
"whyNotReady": [
"Vehicle unresolved",
"Buyer unresolved"
]
}
```

這就是典型「已經比第一種多一層，但還不能直接 build」。

---

### Example C
輸入：
> 我是影片生成專家，幫我規劃一條影片生成自動化 pipeline，從概念到發布

#### intent-router
這可能是 leverage / expression / economic 的混合，但不重要
因為 path-check 會直接看出 high certainty

#### path-check
- domain: fixed
- form: fixed (`automation pipeline`)
- buyer/user: fixed（自己 / 已知 operator）
- loop: fixed（concept → produce → publish）
- build target: fixed

#### 結果
```json
{
"certainty": "high",
"route": "forge-fast-path",
"whyReady": [
"Build target explicit",
"Loop explicit",
"Form explicit"
]
}
```

這種就不要再拉回 space-builder。

---

### Example D
輸入：
> 我想開一個會自己運作的地方，讓 AI 經營它

#### intent-router
governance

#### path-check
- intent: fixed
- world form: unresolved
- core cycle: unresolved
- build target: partially unresolved
- first closure: unresolved

#### 結果
```json
{
"certainty": "medium",
"route": "space-builder-then-forge",
"whyNotReady": [
"World form unresolved",
"Minimum closure not yet defined"
]
}
```

---

### Example E
輸入：
> 做 Midnight Market，兩個 zone、三個 chiefs、跑 observe→judge→apply→outcome 閉環，給我工程規劃

#### intent-router
governance

#### path-check
- intent: fixed
- world form: fixed (`market/night engine`)
- cycle: fixed
- build target: fixed
- minimum closure: fixed

#### 結果
```json
{
"certainty": "high",
"route": "forge-fast-path"
}
```

這種就應該直接 Forge。

---

## 14. Path Check 的內部判斷順序

我會建議固定這個順序，不要亂跳：

```text
1. 確認 terminal intent
2. 看 domain 是否已固定
3. 看 form/world form 是否已固定
4. 看 buyer/user/participant 是否已固定
5. 看 core loop 是否已固定
6. 看 build target 是否已固定
7. 輸出 route
```

為什麼 build target 放最後？
因為很多人會直接丟一個 build target 名詞，
但前面其實沒定。
例如：
- 「幫我做一個網站」
- 「幫我做一個 AI 系統」

那不代表 path fixed。

---

## 15. Path Check 不是永遠一次性
有些任務會反覆過這一層。

例如：

```text
economic intent
→ path-check = medium
→ space-builder
→ probe-commit
→ candidate selected
→ path-check again
→ now high
→ forge
```

也就是 path certainty 是可更新的。
不是一開始判完就永遠固定。

---

## 16. 與 Edda 的關係

Edda 應記錄：

- 為什麼某次 path-check 判 low/medium/high
- 哪些 unresolved element 最常阻塞
- 哪些表面上 high certainty 的案子後來其實爆掉
- 哪些 medium certainty 經過一次 probe 就足夠進 Forge

這些都是超值 precedent。

因為 path-check 做久了，系統會慢慢知道：
- 哪些表面清楚其實是假清楚
- 哪些看似模糊其實只差最後一刀

---

## 17. 最小模組切法

我會把它切成三個小服務，不要做成黑盒。

### `path-analyzer`
抽 fixed vs unresolved elements

### `certainty-classifier`
把結果壓成 low / medium / high

### `route-decider`
輸出：
- space-builder
- space-builder-then-forge
- forge-fast-path

這樣比較好 debug，也不會又變成一個會說很多話的 planner。

---

## 18. 最後一句

> **Intent Router 回答的是「你現在到底想改變什麼現實」。**
>
> **Path Check 回答的是「你距離 build 還差一個世界，還是只差一個工程」。**
>
> 沒有這層，系統不是太早 build，就是太晚 build。
>
> 有了這層，Forge 才不會被拿去處理其實還沒定形的問題。

---

如果你要，我下一步最值得做的是：

1. `probe-commit-evaluators.md`
2. `regime-comparison-matrix.md`

我會建議先做 **2**，因為現在 router / path-check / economic / governance 都有了，最容易受益的是把各 regime 的差別壓成一張可對照的骨架表。