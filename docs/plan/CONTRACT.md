# Völva — Architecture Constraints

> These rules cannot be violated during development.
> Any task that violates these rules is considered incomplete.

## Rules

| Rule ID | Description | Verification | Affected Tracks |
|---------|------------|--------------|-----------------|
| TYPE-01 | `strict: true`, 不允許 `any` / `as any` / `@ts-ignore` | `bun run build` (tsc --noEmit) | All |
| ARCH-01 | Völva 永遠透過 Thyra REST API 操作治理層，不直接碰 Thyra DB | Code review: no bun:sqlite import for Thyra data | E |
| ARCH-02 | 下層不得 import 上層。db.ts + schemas/ 是共用基礎 | Code review: import direction | All |
| LLM-01 | LLM 呼叫必須有結構化 output schema（Zod），不接受任意字串 | Code review: every LLM call uses structured output | B |
| LLM-02 | LLM 呼叫失敗不 crash，graceful degradation | Code review: try/catch + fallback | B, D |
| CARD-01 | 短卡每次更新必須遞增 version，保留 diff 記錄 | Test: card version increments on update | C, D |
| CARD-02 | 短卡 schema 用 Zod 定義，所有欄位有明確型別 | `bun run build` zero errors | C |
| COND-01 | Conductor 狀態轉換必須有明確觸發條件，不允許隱式轉換 | Test: each transition has explicit condition check | D |
| COND-02 | 每輪對話最多 2 次 LLM 呼叫（intent parse + response gen） | Code review: handleTurn() call count | D |
| SETTLE-01 | 沉澱到 Village Pack 必須經過使用者明確確認（settle 階段） | Code review: settlement requires user confirmation | D |
| API-01 | 統一回應格式 `{ ok: true, data }` 或 `{ ok: false, error: { code, message } }` | Code review + test | E |
| TEST-01 | 每個 Track 最後一個 Task 包含測試，覆蓋正常路徑 + 錯誤路徑 | `bun test` all pass | All |

---

## Detailed Rules

### TYPE-01: TypeScript 嚴格模式

**Description**: `tsconfig.json` 設定 `strict: true`。不允許 `any`、`as any`、`@ts-ignore`。Zod 做 runtime validation，TypeScript 做 compile-time safety。

**Rationale**: Völva 處理 LLM 的非確定性輸出，型別安全是唯一的防線。

**Verification**:
```bash
bun run build  # tsc --noEmit
grep -r "as any" src/ --include="*.ts" | wc -l  # Expected: 0
grep -r "@ts-ignore" src/ --include="*.ts" | wc -l  # Expected: 0
```

**Consequence of violation**: LLM 回傳非預期格式時 runtime crash，無法提前發現。

---

### LLM-01: LLM 呼叫必須有結構化 output

**Description**: 每次呼叫 Claude API 都必須定義預期的 Zod schema。LLM 回傳的 JSON 必須通過 `.safeParse()` 驗證。不接受任意字串作為業務邏輯的輸入。

**Rationale**: LLM 是非確定性的。沒有 schema 驗證，任何格式變化都會導致下游邏輯崩潰。

**Verification**:
```bash
# 每個 LLM 呼叫點都應有 safeParse
grep -A5 "client.messages.create" src/llm/ --include="*.ts"
# 預期：每個呼叫後都有 schema.safeParse()
```

**Consequence of violation**: LLM 幻覺或格式偏移直接進入業務邏輯，產生不可預測行為。

---

### COND-01: Conductor 狀態轉換必須有明確觸發條件

**Description**: explore → focus、focus → settle、settle → explore 每個轉換都必須有可檢驗的布林條件。不允許「感覺差不多了就轉」。

**Rationale**: 對話節奏的可預測性是 Völva 的核心賣點。如果轉換是隱式的，除錯時無法追蹤為什麼跳了階段。

**Verification**:
```bash
# state-machine.ts 中每個轉換必須有 if 條件
grep -n "EXPLORE.*FOCUS\|FOCUS.*SETTLE\|SETTLE.*EXPLORE" src/conductor/state-machine.ts
# 預期：每個轉換都有明確條件函數
```

**Consequence of violation**: 對話節奏不穩定，使用者體驗不可控。

---

### SETTLE-01: 沉澱需要使用者確認

**Description**: Settlement router 判斷出沉澱目標後，必須先在 SETTLE 階段展示摘要並等待使用者明確確認（例如「好」、「套用」、「生成」），才能呼叫 Thyra API。

**Rationale**: 沉澱到 Village Pack 會真正改變 Thyra 的世界狀態。這是不可逆操作，不能由 AI 自己決定。

**Verification**:
```bash
# settlement 操作前必須檢查 phase === 'settle' 且有 user confirmation
grep -B5 "thyraClient" src/settlement/ --include="*.ts"
```

**Consequence of violation**: AI 未經確認就修改 Village 設定，違反治理原則。

---

### ARCH-02: 層級依賴規則

**Description**: 下層不得 import 上層。

```
db.ts + schemas/ ← 共用基礎，所有模組可 import

llm/ ← cards/（不互相依賴）
conductor/ ← llm/ + cards/（依賴兩者）
settlement/ ← cards/ + conductor/
thyra-client/ ← 獨立，任何模組可呼叫
routes/ → conductor/ + cards/ + settlement/（組裝層）
cli.ts → conductor/ + routes/（入口層）
```

**Rationale**: 防止循環依賴，確保模組可獨立測試。

**Verification**:
```bash
# llm/ 不應 import conductor/ 或 settlement/
grep -r "from.*conductor\|from.*settlement" src/llm/ --include="*.ts" | wc -l  # Expected: 0
# cards/ 不應 import conductor/ 或 settlement/ 或 llm/
grep -r "from.*conductor\|from.*settlement\|from.*llm" src/cards/ --include="*.ts" | wc -l  # Expected: 0
```

**Consequence of violation**: 模組耦合，無法獨立測試或替換。
