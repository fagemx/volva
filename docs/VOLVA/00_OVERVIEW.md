# Völva — 對話理解與意圖收斂層

## 一句話定位

**Völva 是人類直覺與治理系統之間的翻譯橋樑。**

使用者用生活語言說想要什麼、怕什麼、在意什麼；Völva 聽懂、結構化、引導收斂，最後沉澱成可被 Thyra 治理的世界設定或可被 Karvi 執行的任務。

## 核心隱喻

Völva 是北歐神話中的女先知。連 Odin 都要去請教她。
她不替你決定，而是幫你看清楚你真正要的是什麼。

## 在四 Repo 架構中的位置

```
Völva（理解）→ Thyra（治理）→ Karvi（執行）→ Edda（記憶）
    聽              判              做              記
```

- **Völva**：聽人說話、理解意圖、引導收斂、產出結構化方案
- **Thyra**：接收方案、做治理決策、管理世界 lifecycle
- **Karvi**：執行任務、跑自動化流程
- **Edda**：記錄決策歷史、提供判例查詢

## Völva 的三個核心能力

### 1. Conversation Conductor（對話導演）

不是問問題機器，也不是回覆器。
是一個知道什麼時候該鏡像、什麼時候該提案、什麼時候該停下來等確認的導演。

### 2. Short Card System（短卡系統）

聊天背後持續更新一張結構化摘要：當前方案、已確認邊界、待確認事項。
使用者不需要學工程語言，系統在背後偷偷翻譯。

### 3. Settlement Router（沉澱分流器）

判斷收斂出來的東西該去哪裡：
- 世界級穩定設定 → Village Pack → Thyra
- 流程級需求 → Workflow Card → Karvi
- 單次任務 → Task Card → Karvi
- 還不成熟 → 留在短卡，繼續聊

## 設計哲學

### 不打斷用戶思緒

使用者的直覺不是雜訊，而是尚未被編譯的高價值輸入。
系統應該用生活語言接住使用者，不強迫他學 requirements engineering。

### 先給 baseline，再做修正

不是從空白開始問 100 個問題，而是對一個暫定形狀做修正。
大幅降低認知負擔。

### 背後偷偷結構化

前台保持自然聊天，後台持續更新短卡。
到成熟時才轉 spec / Village Pack。

### Völva 永遠透過 Thyra API 操作治理層

不繞過、不直接碰 DB、不自己實作治理邏輯。

## 不是什麼

- 不是聊天記錄系統（那是 Edda 的事）
- 不是治理引擎（那是 Thyra 的事）
- 不是任務執行器（那是 Karvi 的事）
- 不是 YAML 編輯器（Village Pack 是聊天沉澱的結晶，不是手動編輯的起點）

## 文件索引

| 文件 | 內容 |
|------|------|
| [01_ARCHITECTURE.md](./01_ARCHITECTURE.md) | 技術架構、模組結構、技術棧 |
| [02_INTERACTION_MODEL.md](./02_INTERACTION_MODEL.md) | 四層互動模型、conductor 狀態機、分流規則 |
| [03_PHASES.md](./03_PHASES.md) | 分階段交付計畫 |
| [W1_NEW_VILLAGE.md](./walkthroughs/W1_NEW_VILLAGE.md) | Walkthrough：從零建客服 village |
| [W2_LAW_CHANGE.md](./walkthroughs/W2_LAW_CHANGE.md) | Walkthrough：對既有 village 變更規則 |
| [W3_WORKFLOW_DESIGN.md](./walkthroughs/W3_WORKFLOW_DESIGN.md) | Walkthrough：設計可重複的內容生成流程 |
| [W4_SINGLE_TASK.md](./walkthroughs/W4_SINGLE_TASK.md) | Walkthrough：單次任務 |
