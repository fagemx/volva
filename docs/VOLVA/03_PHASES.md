# Völva — 分階段交付計畫

## Phase 0 — 概念驗證（Walkthroughs Only）

**目標**：用具體場景逼出所有 schema 和規則，不寫 code。

### 交付物

- [ ] W1：從零建客服 village（walkthrough）
- [ ] W2：對既有 village 變更規則（walkthrough）
- [ ] W3：設計可重複的內容生成流程（walkthrough）
- [ ] W4：單次任務（walkthrough）

### 從 Walkthroughs 萃取

- [ ] 短卡 schema 定案（WorldCard / WorkflowCard / TaskCard）
- [ ] Conductor 狀態機轉換條件定案
- [ ] Settlement router 分流規則定案
- [ ] Völva → Thyra API 呼叫點列表
- [ ] LLM prompt 策略初版

### 前提

- 不需要改 Thyra 任何 code
- 不需要開發環境
- 純文件產出

### 驗收標準

4 個 walkthrough 覆蓋所有互動模式，每個 walkthrough 包含：
- 逐輪對話（user + assistant）
- 每輪短卡快照
- conductor 階段標註
- 最終沉澱產出物

---

## Phase 1 — 最小可用（後端 + CLI）

**目標**：可以在終端機對話，驗證 conductor + 短卡 + 沉澱流程。

### 交付物

- [ ] 專案骨架（TS + Bun + Hono + Vitest）
- [ ] DB schema（conversations, messages, cards, settlements）
- [ ] Conductor state machine（explore → focus → settle）
- [ ] Card manager（WorldCard CRUD + version tracking）
- [ ] LLM intent parser（Claude API, single scenario: W1）
- [ ] Settlement router（village_pack path only）
- [ ] Thyra client（呼叫 Village Pack apply）
- [ ] CLI 模式對話（stdin/stdout, no UI）
- [ ] 測試：conductor 狀態轉換、card 更新、settlement routing

### 限制

- 只支援 Mode A（World Design Chat）
- 只支援 WorldCard
- 無前端 UI
- 無 SSE streaming（CLI 不需要）

### 前提

- Thyra API 可用（localhost:3462）
- Claude API key 可用

### 驗收標準

在 CLI 模式下完成 W1 場景：
1. 使用者打字描述想要的客服
2. 系統引導對話收斂
3. 短卡逐輪更新
4. 最終產出 Village Pack YAML
5. 呼叫 Thyra API 成功建立 village

---

## Phase 2 — 前端 + 多場景

**目標**：三欄 UI，支援所有互動模式。

### 交付物

- [ ] React + Vite 前端
- [ ] 三欄佈局：聊天 / 短卡 / 沉澱區
- [ ] SSE streaming（LLM 回覆串流）
- [ ] WorkflowCard + TaskCard 支援
- [ ] Mode B + Mode C 支援
- [ ] Settlement: workflow + task paths
- [ ] 多對話管理（切換、歷史）
- [ ] 短卡 diff 可視化

### UI 佈局

```
┌─────────────────┬───────────────┬──────────────────┐
│                 │               │                  │
│    聊天面板      │   短卡面板     │   沉澱區         │
│                 │               │                  │
│  自然對話       │  當前方案      │  Village Pack    │
│  不打斷思路     │  已確認        │  Workflow        │
│                 │  待確認        │  Task            │
│                 │  本輪提案      │                  │
│                 │               │  （穩定後才浮現） │
│                 │               │                  │
└─────────────────┴───────────────┴──────────────────┘
```

### 驗收標準

在瀏覽器中完成 W1-W4 所有場景，UI 流暢。

---

## Phase 3 — 生產化

**目標**：多用戶、持久化、和 Karvi/Edda 間接整合。

### 交付物

- [ ] 身份驗證（session-based 或 OAuth）
- [ ] 多用戶 workspace
- [ ] Workflow Card → Thyra → Karvi dispatch
- [ ] 對話歷史 → Thyra → Edda 記錄
- [ ] Conductor 策略可配置（不同場景不同節奏）
- [ ] Error recovery（LLM 超時、Thyra 斷線）

### 驗收標準

多用戶可同時使用，對話和沉澱結果持久化。

---

## Phase 依賴

```
Phase 0（文件）
  ↓ 產出 schema + 規則
Phase 1（後端 + CLI）
  ↓ 驗證核心邏輯
Phase 2（前端）
  ↓ 完整互動體驗
Phase 3（生產化）
```

Phase 0 → 1 是最重要的跳板。
Phase 0 做不好，Phase 1 會浪費大量時間。

---

## Thyra 側需求

| Phase | Thyra 需要做什麼 |
|-------|----------------|
| Phase 0 | 無 |
| Phase 1 | 確認現有 API 足夠（應該夠了） |
| Phase 2 | 可能需要 SSE event 支援（issue #42） |
| Phase 3 | 可能需要 webhook 回呼 Völva |

---

## 與 Thyra 開發的並行關係

Völva Phase 0 不影響 Thyra。Thyra 可以繼續：
- Batch 3 tests（#104-#109, #34, #36, #37）
- Blog Village stabilization（#82-#84）
- Karvi workers 整合

Phase 1 開始時，Thyra core 應該已經足夠穩定。
