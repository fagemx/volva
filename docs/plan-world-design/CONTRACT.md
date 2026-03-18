# World Design Pipeline — Architecture Constraints

> These rules cannot be violated during development.
> Any task that violates these rules is considered incomplete.

## Rules

| Rule ID | Description | Verification | Affected Tracks |
|---------|------------|--------------|-----------------|
| TYPE-01 | 不允許 `any`、`as any`、`@ts-ignore` | `bun run build` zero errors | All |
| SCHEMA-01 | 所有 LLM 輸出必須有 Zod schema 驗證 | `grep -r "as any" src/decision/ src/schemas/decision.ts \| wc -l` = 0 | B, D, E |
| LAYER-01 | `decision/` 不得 import `conductor/`、`cards/`、`settlement/` | `grep -r "from.*conductor\|from.*cards\|from.*settlement" src/decision/ --include="*.ts" \| wc -l` = 0 | All |
| LAYER-02 | `decision/` 只透過 `routes/` 與外部模組整合 | Code review | F |
| LLM-01 | LLM 呼叫必須有 Zod schema（CLAUDE.md） | Code review: every `generateStructured` has schema | B, D, E |
| LLM-02 | LLM 呼叫必須 try/catch（CLAUDE.md） | Code review: no uncaught LLM calls | B, D, E |
| COND-02 | 每個 HTTP request 最多 2 次 LLM 呼叫 | Code review: each route handler ≤ 2 LLM calls | F |
| SETTLE-01 | 重要狀態變更需使用者確認（多步 request flow） | Code review: no auto-advance between stages | F |
| ARCH-01 | 不直接碰 Thyra DB（CLAUDE.md） | `grep -r "bun:sqlite.*thyra" src/ \| wc -l` = 0 | All |
| SHARED-01 | 所有跨模組共用型別定義在 `schemas/decision.ts`，不在 `decision/` 內重定義 | Code review | All |
| TEST-01 | 每個 Track 最後一個 Task 包含測試 | `bun test` all pass | All |
| STAGE-01 | DecisionSession stage 變更必須經 session-manager 驗證 | Code review: no direct DB update of `stage` | A, F |

---

## Detailed Rules

### LAYER-01: Decision Module Independence

**Description**: `src/decision/` 是獨立模組。不 import conductor（explore/focus/settle）、cards（CardManager）、或 settlement（builders）。它只 import `schemas/` 和 `llm/`。

**Rationale**: Decision pipeline 和 conductor 是平行系統。在 Shape container 內，route layer 先跑 decision pipeline，再用結果驅動 conductor。如果 decision 直接 import conductor，就失去了平行性。

**Verification**:
```bash
grep -r "from.*conductor\|from.*cards\|from.*settlement" src/decision/ --include="*.ts" | wc -l
# Expected: 0
```

**Consequence of violation**: Decision pipeline 和 conductor 耦合，無法獨立測試和演化。

---

### STAGE-01: Decision Session Stage Integrity

**Description**: `DecisionSession.stage` 只能透過 `session-manager.ts` 的 `advanceStage()` 修改。不允許直接 SQL UPDATE stage。

**Rationale**: Stage transitions 有前置條件（e.g., 必須先有 IntentRoute 才能進 path-check）。直接 UPDATE 會繞過驗證。

**Verification**:
```bash
# Only session-manager should update stage
grep -rn "UPDATE.*decision_sessions.*stage" src/ --include="*.ts" | grep -v session-manager
# Expected: 0
```

**Consequence of violation**: Invalid stage transitions → downstream modules 收到不完整的 input。

---

### SHARED-01: Single Source of Truth for Types

**Description**: `Regime`, `IntentRoute`, `PathCheckResult`, `RealizationCandidate`, `ProbeableForm`, `SignalPacket`, `CommitMemo` 等型別只在 `src/schemas/decision.ts` 定義。`decision/` 內的模組只 import type。

**Rationale**: 對齊 `docs/world-design-v0/shared-types.md` 的 canonical status。防止 inline type 定義 drift。

**Verification**:
```bash
# No type definitions in decision/ that duplicate schemas/decision.ts
grep -c "^export type\|^type " src/decision/*.ts | grep -v ":0"
# Expected: only internal helper types, not shared types
```

**Consequence of violation**: 型別不一致 → pipeline 各 module 的 input/output 不相容。
