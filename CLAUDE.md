# CLAUDE.md

> Volva 開發規範。所有 AI agent 和開發者必須遵守。
>
> 環境設定、專案定位、行為準則見 `AGENTS.md`。本文件專注於程式碼規範和 CONTRACT 規則。

## Tech Stack

- **Language**: TypeScript 5.x, `strict: true`
- **Runtime**: Bun
- **Web Framework**: Hono
- **Schema / Validation**: Zod 3.x
- **LLM**: Claude API (`@anthropic-ai/sdk`)
- **Database**: SQLite (`bun:sqlite`)
- **Testing**: Vitest
- **YAML**: js-yaml（Village Pack 輸出用）

## Design Principles

### YAGNI

不寫「以後可能會用到」的程式碼。只實作當前 Track 需要的功能。

```typescript
// ❌ 預留未來用不到的彈性
export class CardManager {
  private plugins: Plugin[] = [];
  registerPlugin(p: Plugin) { this.plugins.push(p); }
}

// ✅ 只做需要的
export class CardManager {
  create(conversationId: string, type: CardType, content: AnyCard): CardEnvelope { /* ... */ }
  update(cardId: string, content: AnyCard): { card: CardEnvelope; diff: CardDiff } { /* ... */ }
  getLatest(conversationId: string): CardEnvelope | null { /* ... */ }
}
```

### Strict Type Checking (TYPE-01)

不允許 `any`、`as any`、`@ts-ignore`。用 Zod 做 runtime validation，TypeScript 做 compile-time safety。

```typescript
// ❌
const data = response.json() as any;
doSomething(data.field);

// ✅
const parsed = MySchema.safeParse(await response.json());
if (!parsed.success) { /* handle error */ }
doSomething(parsed.data.field);
```

DB 查詢結果用 `Record<string, unknown>` + 明確 cast：

```typescript
// ❌
const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as any;

// ✅
const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as Record<string, unknown> | null;
```

### No Defensive Programming (except LLM)

一般邏輯不做多餘防禦。但 LLM 呼叫必須 try/catch — LLM 是非確定性的，crash 不可接受。

```typescript
// ❌ 對純函數做不必要的防禦
function checkTransition(currentPhase: Phase, card: WorldCard): TransitionResult {
  if (!currentPhase) throw new Error('currentPhase is required');  // TypeScript 已經保證
  if (!card) throw new Error('card is required');                  // TypeScript 已經保證
}

// ✅ 信任型別系統
function checkTransition(currentPhase: Phase, card: WorldCard): TransitionResult {
  if (currentPhase === 'explore') {
    if (card.confirmed.hard_rules.length > 0 && card.confirmed.must_have.length >= 3) {
      return { newPhase: 'focus', reason: 'hard_rule + must_have >= 3' };
    }
  }
  return { newPhase: currentPhase, reason: null };
}
```

```typescript
// ✅ LLM 呼叫必須 try/catch (CONTRACT LLM-02)
async generateStructured<T extends z.ZodType>(options: LLMStructuredOptions<T>) {
  try {
    const response = await this.client.messages.create({ /* ... */ });
    const validated = options.schema.safeParse(parsed);
    if (!validated.success) return { ok: false, error: validated.error.message };
    return { ok: true, data: validated.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### Zero Lint Tolerance

```bash
bun run build     # tsc --noEmit，零錯誤
bun run lint      # eslint src/，零錯誤
bun test          # 所有測試通過
```

## Volva-Specific Rules

### LLM-01: LLM 呼叫必須有 Zod Schema 驗證

每次 `generateStructured()` 都必須傳入 Zod schema。回傳結果必須經過 `.safeParse()` 驗證。不接受任意字串作為業務邏輯的輸入。

```typescript
// ❌ 直接信任 LLM 輸出
const raw = await llm.generateText({ system: PROMPT, messages });
const intent = JSON.parse(raw);  // 沒有 schema 驗證
processIntent(intent);

// ✅ 用 schema 驗證
const result = await llm.generateStructured({
  system: INTENT_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userMessage }],
  schema: IntentSchema,
  schemaDescription: 'Intent object with type, summary, ...',
});
if (result.ok) processIntent(result.data);
else console.warn('[parseIntent] fallback:', result.error);
```

### COND-02: 每輪最多 2 次 LLM 呼叫

`handleTurn()` 的 LLM 呼叫上限：
1. `parseIntent()` — 理解使用者意圖
2. `generateReply()` — 生成回覆

不可在中間插入額外 LLM 呼叫。

```typescript
// ❌ 3 次 LLM 呼叫
async function handleTurn(/* ... */) {
  const intent = await parseIntent(llm, userMessage, cardSnapshot);   // LLM #1
  const analysis = await analyzeContext(llm, intent);                 // ← VIOLATION: 第 3 次 LLM 呼叫
  const reply = await generateReply(llm, strategy, cardStr, msg);     // LLM #2
}

// ✅ 恰好 2 次
async function handleTurn(/* ... */) {
  const intent = await parseIntent(llm, userMessage, cardSnapshot);   // LLM #1
  const updatedContent = applyIntentToCard(cardContent, intent);      // pure function
  const strategy = pickStrategy(phase, intent.type, hasPending);      // pure function
  const reply = await generateReply(llm, strategy, cardStr, msg);     // LLM #2
}
```

### SETTLE-01: 沉澱需要使用者確認

沉澱到 Village Pack 前必須在 SETTLE 階段等待使用者明確確認。不可由 AI 自動執行。

```typescript
// ❌ 自動沉澱
if (phase === 'settle') {
  const pack = buildVillagePack(card);
  await thyraClient.createVillage(pack);  // 未經確認就呼叫
}

// ✅ 等待確認
if (phase === 'settle') {
  const pack = buildVillagePack(card);
  return { reply: '確認以下設定？\n' + formatSummary(pack), awaitConfirmation: true };
}
```

### ARCH-01: 不直接碰 Thyra DB

Volva 只透過 `thyra-client/` 的 HTTP wrapper 操作 Thyra。不 import `bun:sqlite` 來存取 Thyra 資料。

```typescript
// ❌ 直接碰 Thyra 的 DB
import { Database } from 'bun:sqlite';
const thyraDb = new Database('/path/to/thyra.db');
thyraDb.prepare('SELECT * FROM villages').all();

// ✅ 透過 HTTP client
import { ThyraClient } from '../thyra-client/client';
const thyra = new ThyraClient({ baseUrl: 'http://localhost:3462' });
const village = await thyra.createVillage({ name: 'test', target_repo: 'repo' });
```

### CARD-01: 短卡更新必須遞增 version

每次更新短卡內容，`version` 必須 +1，並保留 diff 記錄。

```typescript
// ❌ 更新但沒有遞增版本
function updateCard(card: WorldCard, changes: Partial<WorldCard>): WorldCard {
  return { ...card, ...changes };
}

// ✅ 遞增版本
function applyIntentToCard(card: WorldCard, intent: Intent): WorldCard {
  const updated = structuredClone(card);
  // ... apply changes ...
  updated.version += 1;
  return updated;
}
```

### COND-01: Conductor 狀態轉換必須有明確觸發條件

每個 phase 轉換都必須有可檢驗的布林條件，不允許隱式轉換。

```typescript
// ❌ 模糊的轉換條件
if (shouldTransition(card)) {
  return { newPhase: 'focus' };
}

// ✅ 明確條件
if (card.confirmed.hard_rules.length > 0 && card.confirmed.must_have.length >= 3) {
  return { newPhase: 'focus', reason: 'hard_rule + must_have >= 3' };
}
```

## Promise Handling

### Floating Promise 禁止

所有 async 呼叫必須 `await` 或明確處理。

```typescript
// ❌ floating promise
saveToDatabase(data);

// ✅
await saveToDatabase(data);
```

### LLM Fire-and-Forget

如果必須在背景執行 LLM 呼叫（極少見），必須用 `void` 標記 + `.catch()`：

```typescript
// ❌
logToAnalytics(data);  // async 但沒 await

// ✅
void logToAnalytics(data).catch((err) => {
  console.error('[analytics] failed:', err);
});
```

### Bridge 呼叫 Graceful Degradation

Thyra API 呼叫可以 graceful degrade — 呼叫失敗不應 crash Volva。

```typescript
// ❌ Thyra 掛了就整個 crash
const village = await thyra.getVillage(id);

// ✅
try {
  const village = await thyra.getVillage(id);
  return { ok: true, data: village };
} catch (error) {
  console.error('[thyra] getVillage failed:', error);
  return { ok: false, error: 'Thyra unavailable' };
}
```

## Testing

### Framework + Config

- Vitest (`vitest run`)
- 測試檔案放在對應模組旁：`foo.ts` → `foo.test.ts`
- 設定：`vitest.config.ts` include `src/**/*.test.ts`

### LLM Mock

LLM 呼叫用 `vi.mock()` — 不能每次測試都真的 call Claude。

```typescript
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

mockCreate.mockResolvedValueOnce({
  content: [{ type: 'text', text: '{"type":"confirm","summary":"OK"}' }],
});
```

### DB Test

用 real SQLite `:memory:` — 不 mock DB。

```typescript
let db: Database;
beforeEach(() => {
  db = createDb(':memory:');
  initSchema(db);
});
```

### 每個 Track 最後一個 Task 包含測試 (TEST-01)

覆蓋正常路徑 + 錯誤路徑。

```typescript
// 正常路徑
it('can insert and query a conversation', () => { /* ... */ });

// 錯誤路徑
it('rejects invalid mode', () => {
  expect(() => { /* ... */ }).toThrow();
});
```

## Layer Dependency

```
db.ts + schemas/       <-- 共用基礎，所有模組可 import
llm/                   <-- 獨立（不 import cards/, conductor/, settlement/）
cards/                 <-- 獨立（不 import llm/, conductor/, settlement/）
conductor/             <-- 依賴 llm/ + cards/
settlement/            <-- 依賴 cards/ + conductor/
thyra-client/          <-- 完全獨立，任何模組可呼叫
routes/                --> 組裝層（import conductor/ + cards/ + settlement/）
cli.ts                 --> 入口層（import conductor/ + routes/）
```

**規則：下層不得 import 上層 (CONTRACT ARCH-02)**

驗證：
```bash
# llm/ 不應 import conductor/ 或 settlement/
grep -r "from.*conductor\|from.*settlement" src/llm/ --include="*.ts" | wc -l  # Expected: 0

# cards/ 不應 import conductor/ 或 settlement/ 或 llm/
grep -r "from.*conductor\|from.*settlement\|from.*llm" src/cards/ --include="*.ts" | wc -l  # Expected: 0
```
