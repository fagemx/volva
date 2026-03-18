# economic-regime-v0.md

> 狀態：`working draft`
>
> 所有跨文件共用型別的正式定義見 `./shared-types.md`。
>
> 目的：把 `economic intent` 從一句「我想賺錢」壓成一個可被 router、space builder、probe/commit、forge 接住的 regime。
>
> 這份文件不處理：
> - execution 細節
> - automation 架構
> - growth 長期營運
>
> 它只處理一件事：
>
> > **當使用者真正想要的是「現金流 / 收入 / ROI」，但還沒有 domain、vehicle、buyer、path 時，系統應該怎麼思考。**

---

## 1. 一句話

> **Economic regime 不是在問「怎麼做一個東西」，而是在問「在有限資本與有限時間內，哪條路最可能先產生付費訊號」。**

這句很重要。

因為只要這句沒站穩，系統就會自動滑去：
- 建站
- 做內容
- 做工具
- 做 automation
- 做 SaaS
- 做教學

這些都可能是對的，
但它們都太後面。

---

## 2. Economic intent 的本質

Economic intent 的起點，不是 topic，也不是產品。

它的起點是：

- 我想有第一筆收入
- 我想把 1000 美金變成更大的現金流
- 我想找到能付費的痛點
- 我想知道哪條路值得押

所以它問的不是：

> 什麼值得做？

而是：

> **什麼值得先押，而且押下去最可能先看到真實付費反應？**

這裡有三個關鍵詞：

1. **先押**
2. **真實付費**
3. **反應**

不是漂亮商業模式。
不是理論上可賺。
不是未來規模。
而是**現階段最值得押的現實路徑**。

---

## 3. Economic regime 最容易被做錯的地方

### 錯法 1：把「賺錢」當成 execution 問題
於是直接產出：
- 網站規劃
- 內容日曆
- 自動化 pipeline
- SaaS roadmap

這是最常見的失焦。

---

### 錯法 2：把「賺錢」當成點子生成問題
於是列出：
- affiliate
- faceless content
- 教學內容
- 模板包
- 社群媒體變現
- AI 顧問

這些答案不一定錯，但太容易停在公共共識。

---

### 錯法 3：把「流量」誤認成「經濟」
很多回答其實不是在找收入路徑，
只是在找流量路徑。

但：
- 流量 ≠ buyer
- 內容 ≠ cashflow
- followers ≠ willingness to pay

---

### 錯法 4：太早工程化
這類問題最容易讓 AI 直接跳到第三種：
- pipeline
- 自動化
- 系統設計

但在 economic regime 裡，
真正該先被工程化的不是產品，
而是**決策與試單路徑**。

---

## 4. Economic regime 的真正核心

我會把它收成這四個問題：

### 4.1 誰可能付錢？
不是誰會喜歡，
而是誰有付費權限、付費動機、付費痛感。

### 4.2 付錢是為了什麼？
不是為了技術本身，
而是為了：
- 更快
- 更省
- 更穩
- 更賺
- 更少麻煩
- 更少試錯

### 4.3 哪條路最便宜就能碰到這種付費動機？
不是哪條最完整，
而是哪條最短。

### 4.4 什麼樣的訊號才足夠讓它升格成 build 問題？
這決定 Forge 什麼時候才有資格出場。

---

## 5. Economic regime 的 canonical flow

```text
Money Goal
→ intent-router (判成 economic)
→ path-check (路夠不夠固定？)
→ if unfixed:
    → Edge Extraction
    → Buyer / Pain Mapping
    → Vehicle Generation (space-builder: expand + constrain)
    → Kill Filters (shell)
    → Probe Budget Plan (shell)
    → Paid-Signal Probes (shell)
    → Signal Review (economic evaluator)
    → Commit Memo (shell + economic evaluator)
    → Forge
    → later Thyra
→ if fixed enough:
    → forge-fast-path

edda = decision spine (沿路記 edge profile → buyer hypothesis → vehicle selection → probe results → commit rationale)
```

這條 flow 跟一般產品流程不同。

### 它的重點不是 build
而是：
- edge
- buyer
- vehicle
- paid signal
- commit threshold（由 economic evaluator 判定）

---

## 6. Economic regime 的輸入，不夠只是「我想賺錢」

如果使用者只說：
> 我想賺錢，這裡有 1000 美金

Router 應判成 economic，
但這還不夠。

至少還缺三組東西：

### 6.1 Edge Profile
這個人比平均人更靠近哪裡？

### 6.2 Constraint Envelope
他可投入多少：
- 時間
- 對外接觸
- 技術
- public exposure
- 失敗容忍

### 6.3 Cash Objective
是要：
- 第一筆收入
- 每月 recurring
- 高單價低頻
- 低價高頻
- 幾週內要看到訊號
- 幾個月內可以接受驗證

沒有這三組，space builder 只會長出大眾答案。

---

## 7. Edge Extraction：經濟問題不能跳過這步

Economic regime 的第一步不是市場，
是**你在哪裡不平均**。

我建議 v0 把 edge 分五類。

---

### 7.1 Capability Edge
你會什麼，且明顯比普通人更會？

例如：
- 影片生成
- agent automation
- workflow 設計
- 視覺品味
- prompt 調教
- 設計師工具整合
- pipeline rescue

---

### 7.2 Trust Edge
誰比較可能先相信你？

例如：
- 既有朋友
- 前同事
- 設計師圈
- 工作室
- 某 niche 群組
- 已合作過的人

第一筆錢常常先從 trust 來，不是從最廣市場來。

---

### 7.3 Distribution Edge
你已經有什麼接觸點？

例如：
- X
- Discord
- Telegram
- 工作群
- 熟人介紹
- 已有網站
- 現有專案

注意：distribution edge 不等於要做內容。
它只是你比較容易敲到人的地方。

---

### 7.4 Asset Edge
你已經有什麼可重用東西？

例如：
- 現成 workflow
- 模板
- prompt corpus
- 專案案例
- demo
- 可展示前後對比
- 現成腳本或工具鏈

---

### 7.5 Taste / Proximity Edge
你比較懂誰的痛、比較能理解哪個使用情境？

這一條很常比技術更值錢。

例如：
- 你懂設計師怎麼卡
- 你懂影片生成實際 workflow 哪裡爛
- 你懂 agent 工具在真實場景裡哪裡麻煩
- 你懂「外行以為難、內行知道真正痛」的位置

---

## 8. Buyer / Pain Mapping：economic 不等於找大市場
Economic regime 的 target 不是市場大，而是**買得動**。

所以 buyer / pain mapping 應該回答：

### 8.1 誰現在就有預算或強動機？
不是誰可能 someday 會覺得有趣。

### 8.2 誰今天如果不解決，會痛？
不是誰只是會覺得方便。

### 8.3 哪個痛點最接近你的 edge？
不是哪個痛點最大，而是哪個你最有不對稱。

### 8.4 哪個痛點可以先被半人工解？
如果一定要全自動才能成立，第一輪通常太重。

---

## 9. Vehicle Generation：economic regime 裡最重要的不是 domain，而是 vehicle

這點一定要說清楚。

同一個 domain，例如「影片生成」，可以長出完全不同的 vehicle：

- done-for-you service
- done-with-you install
- workflow audit
- template pack
- recurring operations
- niche production studio
- training / onboarding

所以不要問：
> 我要不要做影片生成？

要問：
> **如果以影片生成為 domain，哪種 vehicle 最可能先產生付費訊號？**

這個差很多。

---

## 10. Economic regime 的 canonical vehicles

v0 先固定 7 種，不然 search space 會太散。

### 10.1 Done-for-you Service
你直接幫客戶把結果做出來。

適合：
- edge 強
- 信任路徑存在
- 買家願意付高單價
- build 還太早

---

### 10.2 Done-with-you Install / Setup
你幫對方把流程裝起來，帶著做一次。

適合：
- workflow / tooling / automation 類 edge
- 客戶有持續需求
- 比純代做更容易 productize

---

### 10.3 Workflow Audit / Optimization
你不是做，而是診斷、調整、提高效率。

適合：
- 有 process insight
- 痛點靠 bottleneck 而不是靠內容本身
- 需要高信任、低交付負擔

---

### 10.4 Productized Service
把某種服務壓成標準套餐。

適合：
- 第一輪試單成功後
- scope 能明確切
- 交付可重複

---

### 10.5 Template / Pack
把你的 know-how 壓成可複製資產。

適合：
- 已有信任或 audience
- 已知有人會照這套做
- 不適合作第一輪主路，除非已有 buyer pull

---

### 10.6 Tool / Internal Tool Externalization
把你自己用的東西變成別人可以買的工具。

適合：
- 你自己已反覆使用
- 有明確重複 bottleneck
- 已看到他人也有同痛點

---

### 10.7 Operator Model / Managed Runtime
你不是賣一次性輸出，而是持續替對方運作某個系統。

適合：
- 問題本質是持續營運
- 買家不想自己學
- 你能控制流程和後果

這一型比較晚，常接到 Thyra 線。

---

## 11. Kill Filters：economic regime 要特別狠
因為 economic 很容易被公共共識拖走。

我會加幾條專屬 filter。

### 11.1 Audience-first but buyer-unclear
如果候選路徑先假設你要有 audience 才能賺，先降權。

### 11.2 Build-first but signal-late
如果必須先 build 很多才能知道有沒有人會買，先降權。

### 11.3 Generic tool fantasy
如果候選看起來像「大家都會想用的 AI 工具」，先大幅降權。

### 11.4 Education trap
如果候選本質是教學內容，但沒有明確 buyer 與 trust edge，先降權。

### 11.5 Narrow pain, broad build
如果實際痛點很窄，卻想先做很大的系統，先降權。

---

## 12. Probe Budget Plan：1000 美金不是拿來買完整產品
這是 economic regime 最關鍵的具體化。

### 原則
> **預算優先買 signal，不是優先買 infrastructure。**

v0 可以這樣分：

### 12.1 Signal Budget — 35%
用來買真實回應
- outreach
- ad tests
- landing page traffic
- niche access
- paid conversations / consult incentives

### 12.2 Setup Budget — 25%
讓 probe 能發生
- 一頁式頁面
- sample demo
- booking form
- simple checkout / CTA
- case presentation

### 12.3 Fulfillment Budget — 20%
如果有人買，能交付第一輪
- 半人工執行
- 幫手
- 零碎工具成本
- 小範圍客製

### 12.4 Reserve Budget — 20%
給：
- 第二候選
- 成功 probe 的加碼
- 一次 pivot

這樣才不會 1000 元一開始就被網站、品牌、工具訂閱吃光。

---

## 13. Economic probe 的標準：一定要碰 buyer，不只是碰市場資訊
這句很重要。

economic probe 至少分三級：

### Level 1 — Interest Signal
例如：
- 點擊
- 回覆
- 願意了解
- 願意留聯絡

這還很弱。

---

### Level 2 — Commitment Signal
例如：
- 願意預約
- 願意談需求
- 願意給資料
- 願意讓你看現有 workflow
- 願意接受試作

這比單純 click 強很多。

---

### Level 3 — Payment Signal
例如：
- 願意付訂金
- 願意做 paid pilot
- 願意先付小額
- 願意簽明確範圍

這才是最硬 signal。

economic regime 最終要看的，不是 interest，
而是**commitment 和 payment**。

---

## 14. Economic probes 的 canonical forms

### 14.1 Direct Offer Probe
直接對可能 buyer 提 offer。

適合：
- 高信任
- 高 edge
- 高客製服務

---

### 14.2 Landing Page + CTA Probe
不是拿來做品牌，
只是看 value proposition 是否能讓人前進一步。

適合：
- 檢查 messaging clarity
- 比較不同 vehicle 的吸引力

---

### 14.3 Concierge Probe
先手工交付，不先 build 系統。

適合：
- 驗證交付本身值不值得被買
- 避免過早工程化

---

### 14.4 Paid Pilot Probe
給明確、有限範圍的試用或試作。

適合：
- B2B / studio / operator 類路徑
- setup / workflow install / optimization 類服務

---

### 14.5 Problem Interview with Price Friction
不是一般訪談，
是有價格/預算摩擦的對話。

適合：
- 還不清楚 buyer 是否真的願意付
- 想驗證痛點是否值得被買

---

## 15. Signal Review：economic regime 只看三類 signal

### 15.1 Buyer Signal
有人願不願意靠近你？

### 15.2 Payment Signal
有人願不願意掏錢？

### 15.3 Delivery Fit Signal
你能不能在不崩潰的情況下交付第一輪？

這三者缺一個，都不該太快 commit。

---

## 16. Economic Commit 的門檻

一條 candidate 進 Forge 前，至少應達成：

### 16.1 Buyer has shape
不是抽象「市場」，而是：
- 某類人
- 某種情境
- 某個痛點
- 某個購買語境

### 16.2 Payment-adjacent signal exists
至少要有：
- 明確談價
- 願意試單
- 願意預約
- 願意付訂

如果只有「有興趣」，不夠。

### 16.3 Manual delivery looks possible
至少第一輪不是完全空想。

### 16.4 Build would unlock the next bottleneck
只有當 build 真的是下一步必要條件，才進 Forge。

不是因為「做系統比較帥」。

---

## 17. Commit memo 在 economic regime 長什麼樣

```ts
// 正式定義見 ./shared-types.md §5.6
type EconomicCommitMemo = CommitMemo & {
buyerHypothesis: string;
painHypothesis: string;
paymentEvidence: string[];
whyThisVehicleNow: string[];
nextSignalAfterBuild: string[];
};
```

這裡的 `whatForgeMustNotBuild`（繼承自 CommitMemo）特別重要。
因為 economic regime 最容易一 commit 就 build 過頭。

---

## 18. Forge 在 economic regime 裡應該接什麼？
不是所有被選中的 economic path 都該進同一種 Forge。

### 如果 commit 的是 service / setup 類
Forge 應 build：
- offer clarity
- intake / booking / scope flow
- delivery support tools
- proof / case structure
- minimum ops layer

### 如果 commit 的是 pack / template 類
Forge 應 build：
- packaging
- delivery mechanism
- example library
- onboarding path

### 如果 commit 的是 tool 類
Forge 才開始真的要做：
- narrow feature core
- setup path
- usage proof
- first loop

重點是：Forge build 的東西應該被 commit memo 反向限制。

---

## 19. Thyra 在 economic regime 什麼時候才出場？
只有當 selected path 已經變成：

- 持續運作的 service
- operator model
- managed runtime
- recurring system
- 某種 world-like operation

也就是：
- 不再只是賣一次
- 開始有 state
- 開始有 repeated changes
- 開始有 governance pressure

這時 economic path 才會接到 Thyra。

所以：
> economic → forge → thyra
不是必然連續，
而是當某條路變成 live operating substrate 時才成立。

---

## 20. Concrete example：用影片生成賺錢
輸入：
> 我想用影片生成賺錢

economic regime 下，不應直接做影片生成 pipeline。
應先這樣長：

### Space Builder 候選
- 影片生成 × workflow install service
- 影片生成 × done-for-you clip production
- 影片生成 × template pack for small studios
- 影片生成 × training / onboarding

### Kill Filters
先砍：
- generic faceless content channel
- broad education site
- wide audience community-first route

### Probe
保留兩條：
1. workflow install service
2. done-for-you clip production

#### Probe 1
對小工作室 / 設計師圈做 direct offer：
- 幫你把一條影片生成流程裝起來
- 一週內能穩定產 3 條內容

#### Probe 2
做一個 sample deliverable：
- 先接一個小型試單 / demo clip

### Signal Review
如果 workflow install 收到：
- 願意談流程
- 願意給現有卡點
- 願意談價

而 done-for-you 只有興趣沒有價格承諾，
那 commit 的應該是 setup service，不是完整內容工作室。

### Forge 才接
- intake
- scope
- install checklist
- support workflow
- case showcase

這樣就不會太早進第三種。

---

## 21. Concrete example：Tamp + 1000 美金
如果以你目前已知的 edge 來看，economic regime 的 candidate 很可能不是：

- generic AI 賺錢站
- public AI 教學內容 farm
- broad video generation community

而是更像：

- AI workflow install / optimization for designers or studios
- agent/tool setup as productized service
- specialized visual pipeline onboarding
- narrow pack/workflow asset once service is proven

也就是從：
- trust edge
- tooling edge
- workflow edge
- design-adjacent edge

壓出來的路。

這就比大眾答案強很多。

---

## 22. 最後一句

> **Economic regime 的重點不是「替使用者想賺錢方法」，**
> **而是把有限資本轉成最有鑑別力的付費訊號。**
>
> 只有當某條路真的收到足夠硬的 signal，
> 它才配進 Forge。
>
> 否則，太早 build 幾乎都會回到普通答案。

---

接下來：把 economic evaluator 的接口釘死在 `probe-commit-evaluators.md`。