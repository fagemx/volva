# Deep Skill Architecture — Architecture Constraints

> These rules cannot be violated during development.
> Any task that violates these rules is considered incomplete.

## Rules

| Rule ID | Description | Verification | Affected Tracks |
|---------|------------|--------------|-----------------|
| TYPE-01 | 不允許 `any`、`as any`、`@ts-ignore` | `bun run build` zero errors | All |
| SCHEMA-01 | 所有 skill object 欄位必須有 Zod schema 驗證 | `grep -r "as any\|: any" src/skills/ src/containers/ src/schemas/skill-object.ts` = 0 | A, B, D, E |
| LAYER-01 | `skills/` 不得 import `containers/` 或 `conductor/`；`containers/` 不得 import `conductor/` | `grep -r "from.*conductor\|from.*containers" src/skills/ --include="*.ts" \| wc -l` = 0 | All |
| LAYER-02 | `containers/` 不得 import `skills/registry.ts` 或 `skills/lifecycle.ts` 直接，只透過注入 | Code review: router 接收 registry interface，不直接 import | C, F |
| OWNER-01 | Overlay merge 必須 reject 越權欄位（Karvi overlay 只能碰 dispatch.*） | Unit test: merge with out-of-scope field → throws | A |
| LLM-01 | LLM 呼叫必須有 Zod schema 驗證回傳（CONTRACT from CLAUDE.md） | Code review: every `generateStructured` has schema param | E |
| LLM-02 | LLM 呼叫必須 try/catch（CONTRACT from CLAUDE.md） | Code review: no uncaught LLM calls | E |
| COND-02 | 每輪最多 2 次 LLM 呼叫（CONTRACT from CLAUDE.md） | Code review: handleTurn has max 2 LLM calls | F |
| CARD-01 | Card 更新必須遞增 version（CONTRACT from CLAUDE.md） | Existing test coverage | All |
| SETTLE-01 | Harvest 產出的 skill candidate 必須經使用者確認才能 crystallize | Code review: harvest route 需要 2-step flow | E, F |
| ARCH-01 | 不直接碰 Thyra DB — 只透過 ThyraClient HTTP wrapper | `grep -r "bun:sqlite.*thyra\|thyra.*Database" src/ \| wc -l` = 0 | All |
| TEST-01 | 每個 Track 最後一個 Task 包含測試，覆蓋正常 + 錯誤路徑 | `bun test` all pass | All |

---

## Detailed Rules

### TYPE-01: Strict Type Checking

**Description**: 不允許 `any`、`as any`、`@ts-ignore`。用 Zod 做 runtime validation，TypeScript 做 compile-time safety。DB 查詢結果用 `Record<string, unknown>` + 明確 cast。

**Rationale**: Skill object 有 12 個 section，型別錯誤會在 overlay merge 和 trigger matching 時產生難以追蹤的 bug。

**Verification**:
```bash
bun run build
bun run lint
```

**Consequence of violation**: Runtime type mismatch 導致 skill 無法正確 parse、merge、或 match。

---

### SCHEMA-01: Skill Object 必須完整 Zod 驗證

**Description**: `skill-object-v0.md` 定義的 12 個 section 必須全部有對應的 Zod schema。YAML parse 後的結果必須經過 `.safeParse()` 驗證。

**Rationale**: Skill object 是聯邦化的（4 個 plane 各寫各的 slice），如果沒有嚴格 schema 驗證，overlay merge 時會吃到非法欄位。

**Verification**:
```bash
# 確認所有 section 都有 schema
grep -c "Schema" src/schemas/skill-object.ts
# Expected: >= 12 (identity, purpose, routing, contract, package, environment, dispatch, verification, memory, governance, telemetry, lifecycle)
```

**Consequence of violation**: 非法 skill object 進入系統，routing/execution/telemetry 全部不可信。

---

### LAYER-01: Module Layer Boundaries

**Description**: 遵循 CLAUDE.md 的 Layer Dependency 規則。`skills/` 是獨立模組（不 import `containers/` 或 `conductor/`）。`containers/` 是中間層（不 import `conductor/`）。只有 `routes/` 和 `bridge.ts` 可以組裝所有模組。

**Rationale**: 與 CLAUDE.md ARCH-02 一致。下層不得 import 上層。

**Verification**:
```bash
# skills/ 不應 import containers/ 或 conductor/
grep -r "from.*containers\|from.*conductor" src/skills/ --include="*.ts" | wc -l
# Expected: 0

# containers/ 不應 import conductor/
grep -r "from.*conductor" src/containers/ --include="*.ts" | wc -l
# Expected: 0
```

**Consequence of violation**: Circular dependency，模組無法獨立測試。

---

### OWNER-01: Overlay Scope Enforcement

**Description**: `overlay-merge.ts` 合併 dispatch.yaml 時，只允許覆寫 `dispatch.*` 欄位。合併 runtime.yaml 時，只允許覆寫 `environment.*`、`verification.*`、`governance.mutability.*`。任何越權欄位必須 reject 並 throw。

**Rationale**: 防止 ownership drift — 如果 Karvi 的 overlay 可以改 `routing.triggerWhen`，就違反了 four-plane-ownership 的 cardinal rules。

**Verification**:
```bash
bun test src/skills/overlay-merge.test.ts
# Must include: "rejects dispatch overlay with routing field" test case
```

**Consequence of violation**: Ownership boundary 被破壞，skill definition 的 single source of truth 不成立。

---

### LAYER-02: Container Router 依賴注入

**Description**: `containers/router.ts` 不直接 import `skills/registry.ts`。而是接收一個 `SkillLookup` interface（`(context: string) => SkillMatch[]`）。這讓 router 可以獨立測試。

**Rationale**: Container router 是 L1，skill registry 是 L0。Router 依賴 registry 的能力，但不應該依賴其實作。

**Verification**:
```bash
grep -r "from.*registry\|from.*trigger-matcher" src/containers/ --include="*.ts" | wc -l
# Expected: 0
```

**Consequence of violation**: Router 和 registry 耦合，無法獨立測試 routing 邏輯。
