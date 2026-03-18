那我接下一份最實用的：

# router-test-cases.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：替 `intent-router.md` 建一組不靠感覺的測試案例，避免 router 看起來很合理、實際一丟真句子就亂飄。
>
> 這份文件不新增新概念。
> 它只做一件事：
>
> > **把 regime routing 變成可反覆驗證的判斷集合。**

---

## 1. 一句話

> **Router 沒有 test cases，就只是另一個很會說話的分類器。**

`intent-router` 的價值不是定義 6 個 regime，
而是面對真實輸入時，能不能：

- 抓到 primary regime
- 不被題材/工具字眼帶走
- 把 secondary regime 放對位置
- 提出真的有鑑別力的 follow-ups

所以這份文件要測的不是理論，
而是**抗誤判能力**。

---

## 2. 測試原則

### 原則 1：測真的會混淆的句子
不要只測教科書式輸入。

### 原則 2：測「題材相同，但 regime 不同」
例如都提到「影片生成」，但其實：
- economic
- capability
- leverage
- expression
都可能出現。

### 原則 3：測「同一句裡有主次」
例如：
- 我想做作品，最好也能賺錢
- 我想轉職，但希望不要收入掉太多

### 原則 4：測「表面像 build，實際不是」
這最容易把 router 拉歪。

---

## 3. 驗收格式

每個 test case 都固定這個 shape：

```ts
// 正式定義見 ./shared-types.md §7.2
type RouterTestCase = {
id: string;
input: string;

expectedPrimary: Regime;

expectedSecondary?: Regime[];
shouldAskFollowup: boolean;
expectedUnknowns?: string[];

why: string[];
commonFailureModes: string[];
};
```

重點不是只驗：
- 有沒有分對

而是還要驗：
- 為什麼是這個
- 常會被錯分去哪裡

---

## 4. 測試組 A：Economic vs 其他

---

### A1
**Input**
> 我想賺錢，這裡有 1000 美金

**Expected**
- primary: `economic`
- secondary: none
- shouldAskFollowup: yes

**Expected unknowns**
- edge profile
- buyer proximity
- time horizon

**Why**
- 明確 cash outcome
- 明確 capital framing
- 沒有 domain / vehicle

**Common failure modes**
- 太快跳進 leverage（把 1000 當工具預算）
- 太快跳進 forge（直接開始規劃產品）

---

### A2
**Input**
> 我想用影片生成賺錢

**Expected**
- primary: `economic`
- secondary: `expression`
- shouldAskFollowup: yes

**Expected unknowns**
- vehicle
- buyer
- edge within video generation

**Why**
- 終局是賺錢
- 影片生成只是 domain 限定
- 還沒到 build

**Common failure modes**
- 被分成 expression
- 直接跳成「幫你規劃影片 pipeline」

---

### A3
**Input**
> 我想幫設計師把 AI 工作流裝起來，順便看看能不能賺錢

**Expected**
- primary: `economic`
- secondary: `leverage`
- shouldAskFollowup: yes

**Expected unknowns**
- buyer shape
- offer shape
- payment model

**Why**
- 主要是商業化一個 leverage edge
- leverage 是手段，不是終局

**Common failure modes**
- 被分成 leverage
- 直接 fast-path 到 forge

---

## 5. 測試組 B：Capability vs Leverage

---

### B1
**Input**
> 我想把影片生成 workflow 跑熟

**Expected**
- primary: `capability`
- secondary: `leverage`
- shouldAskFollowup: yes

**Expected unknowns**
- current level
- target quality bar
- practice frequency

**Why**
- 使用者要的是 mastery，不是節省時間本身

**Common failure modes**
- 被分成 leverage
- 被導成工具推薦

---

### B2
**Input**
> 我每天都花很多時間在整理素材，我想把這段流程自動化

**Expected**
- primary: `leverage`
- secondary: none
- shouldAskFollowup: yes

**Expected unknowns**
- bottleneck definition
- frequency
- baseline time cost

**Why**
- 終局是節省時間與降低摩擦
- 不是在追 skill growth

**Common failure modes**
- 被分成 capability
- 直接推薦一堆工具，不先定 bottleneck

---

### B3
**Input**
> 我想學會怎麼設計一條真的有用的自動化流程

**Expected**
- primary: `capability`
- secondary: `leverage`
- shouldAskFollowup: yes

**Why**
- 目標是學會設計，而不是馬上省時間
- leverage 是學習對象，不是最終目的

**Common failure modes**
- 被分成 leverage
- 被直接拖去規劃系統

---

## 6. 測試組 C：Expression vs Economic

---

### C1
**Input**
> 我想做出一種很有味道的古風短片，之後如果能賺錢更好

**Expected**
- primary: `expression`
- secondary: `economic`
- shouldAskFollowup: yes

**Expected unknowns**
- medium/form
- completion scope
- what “有味道” means

**Why**
- 主終局是作品與味道
- 賺錢是 secondary wish

**Common failure modes**
- 被分成 economic
- 太快講變現方法
- 太快規劃社群與商業路徑

---

### C2
**Input**
> 我想靠我的美學和分鏡能力做出可以賣的東西

**Expected**
- primary: `economic`
- secondary: `expression`
- shouldAskFollowup: yes

**Why**
- 這句的最終目標是賣
- 美學能力是 edge，不是終局

**Common failure modes**
- 被分成 expression
- 太快談作品，不談 buyer/vehicle

---

### C3
**Input**
> 我想找到最適合承載這個故事的形式，不一定要影片

**Expected**
- primary: `expression`
- secondary: none
- shouldAskFollowup: yes

**Expected unknowns**
- story properties
- candidate media
- completion constraints

**Why**
- 典型媒介承載問題
- 還沒涉及商業或 build

**Common failure modes**
- 被分成 capability
- 被分成 governance（因為提到 world/story）

---

## 7. 測試組 D：Governance

---

### D1
**Input**
> 我想開一個會自己運作的地方，讓 AI 去經營它

**Expected**
- primary: `governance`
- secondary: none
- shouldAskFollowup: yes

**Expected unknowns**
- world form
- pressure source
- outcome surface

**Why**
- 典型 world/governance intent
- 終局不是功能，不是賺錢，不是學習

**Common failure modes**
- 被分成 leverage（因為有 automation 意味）
- 被分成 economic（因為預設世界要賺錢）
- 被分成 forge-fast-path

---

### D2
**Input**
> 我想做一個 creator market，讓它晚上自己控場，之後再看能不能接商業化

**Expected**
- primary: `governance`
- secondary: `economic`
- shouldAskFollowup: yes

**Expected unknowns**
- market vs night-engine form
- pressure sources
- first closure target

**Why**
- 主要是在造一個地方
- 商業化是次要

**Common failure modes**
- 被分成 economic
- 直接開始講 monetization plan

---

### D3
**Input**
> 我想讓這個系統自己觀察、自己提案、自己改規則

**Expected**
- primary: `governance`
- secondary: `leverage`
- shouldAskFollowup: yes

**Why**
- 這不是單純 automation
- 核心是 change/judgment/governance

**Common failure modes**
- 被分成 leverage
- 被分成 generic agent orchestration

---

## 8. 測試組 E：Identity

---

### E1
**Input**
> 我想慢慢從接案轉成做自己的產品

**Expected**
- primary: `identity`
- secondary: `economic`
- shouldAskFollowup: yes

**Expected unknowns**
- reversibility requirement
- timeline
- current constraints

**Why**
- 主問題是 path transition
- 收入是重要次目標，但不是唯一終局

**Common failure modes**
- 被分成 economic
- 直接給產品點子清單
- 直接進 forge

---

### E2
**Input**
> 我不確定該不該把重心放到 AI 上，我想知道哪條路更像我能長期做的

**Expected**
- primary: `identity`
- secondary: `capability`
- shouldAskFollowup: yes

**Why**
- 主問題是 self-fit / life-path
- AI 是路徑內容，不是終局

**Common failure modes**
- 被分成 capability
- 被分成 economic（因為可能聯想到賺錢）

---

### E3
**Input**
> 我想換一種生活方式，不想再一直靠案子追著跑

**Expected**
- primary: `identity`
- secondary: `economic`
- shouldAskFollowup: yes

**Why**
- 這是在問 path/life structure，不是在問 business model

**Common failure modes**
- 被分成 economic
- 被導成 productivity/leverage

---

## 9. 測試組 F：已經足夠明確、之後應交給 path-check

這組的目的是測 router 不要過度發散。

---

### F1
**Input**
> 做 Midnight Market，兩個 zone、三個 chiefs、跑 observe→judge→apply→outcome，給我工程規劃

**Expected**
- primary: `governance`
- secondary: none
- shouldAskFollowup: no (router 層可不追問，交給 path-check)

**Why**
- terminal intent 明確
- world form 明確
- 這時 router 只需判 governance，不要再生成世界形式

**Common failure modes**
- router 自己開始規劃 world forms
- 被誤分成 leverage 或 forge 類型

---

### F2
**Input**
> 我是影片生成專家，幫我規劃一條從概念到發布的自動化 pipeline

**Expected**
- primary: `leverage` or `capability`?
**v0 建議 primary = `leverage`，secondary = `expression`**

- shouldAskFollowup: no or minimal

**Why**
- 終局是系統化生產
- 作品仍存在，但不是主終局
- router 到這裡就夠，之後交給 path-check 判 fast-path

**Common failure modes**
- 被 router 直接當 forge 處理（router 越權）
- 被分成 expression only

---

## 10. 需要專門測的「混淆對」

這組不是單句，而是 pairs。

---

### Pair 1
- 我想用影片生成賺錢 → `economic`
- 我想用影片生成講出某種味道 → `expression`

### Pair 2
- 我想把這個 workflow 跑熟 → `capability`
- 我想把這個 workflow 自動化 → `leverage`

### Pair 3
- 我想做一個會自己運作的地方 → `governance`
- 我想做一個多 agent 自動化系統 → 通常先偏 `leverage`，除非明確提到 place/world/consequence

### Pair 4
- 我想從接案轉產品 → `identity`
- 我想找一個最快能賺錢的產品方向 → `economic`

這種 pair test 很重要，因為它們最容易被混成同一個 bucket。

---

## 11. Router 的通過標準

這份不是 ML benchmark，但還是要有 pass bar。

### v0 pass bar
- 明確 case：主 regime 正確率應非常高
- 混淆 case：至少 primary/secondary 結構合理
- follow-up questions 應該有區辨力，不能 generic

更白話地說：

> 如果 router 只是「大概分對」，但 follow-up 問得很爛，它還是沒過。

因為 router 的真正價值不只分類，
而是幫後面收斂 search space。

---

## 12. follow-up quality tests

這要另外測。

### 壞 follow-up
- 你可以多講講嗎？
- 你想做哪方面？
- 你的需求是什麼？

這種太 generic，沒鑑別力。

### 好 follow-up
- 你更在意先賺到錢，還是先做出你自己認可的作品？
- 你現在想改變的是收入，還是你一天花掉的時間？
- 你要的是一個工具，還是一個會自己運作的地方？

這種問題才真的能幫後面路由。

---

## 13. 建議的 test file 結構

如果之後真的落成測試，我會切成：

```text
tests/router/
economic.test.ts
capability.test.ts
leverage.test.ts
expression.test.ts
governance.test.ts
identity.test.ts
mixed-signals.test.ts
followup-quality.test.ts
```

不要全部塞一個大檔案，否則很難 debug 哪個 regime 飄了。

---

## 14. 最後一句

> **Intent Router 最怕的不是分錯一兩題，**
> **而是系統性地把不同 regime 全部吸回同一種 planning 語氣。**
>
> `router-test-cases.md` 的存在，就是為了防這件事：
> 讓我們持續檢查，這個入口到底是在分辨「你真正想改變哪種現實」，還是在偷把所有問題都翻成同一種 build 問題。

---

如果你要，我下一步最自然的是：

1. `frontend-flow-v0.md`
2. `edda-decision-spine.md`

我會建議先做 **2**，因為現在其實最值得補的是：
**這整條前置層，到底怎麼被 Edda 貫穿，而不是只在最後記一筆。**