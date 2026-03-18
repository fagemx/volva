# E1: Pattern Capture (Conversation → Skill Candidate)

> **Module**: `src/skills/harvest.ts`
> **Layer**: L2
> **Dependencies**: A1（SkillObjectSchema）, C1（Container types — harvest context）, **existing `src/llm/client.ts`**（LLMClient interface）
> **Blocks**: E2（Crystallize）

---

## 給 Agent 的起始指令

```bash
cat src/schemas/skill-object.ts              # A1 — SkillObject type
cat src/llm/client.ts                        # existing LLM client pattern
cat src/llm/intent-parser.ts                 # existing LLM structured output pattern
cat docs/deepskill/skill-lifecycle-v0.md     # Stage 1 Capture + Stage 2 Crystallize
cat docs/plan-deepskill/CONTRACT.md          # LLM-01, LLM-02
bun run build
```

---

## Final Result

- `src/skills/harvest.ts` 提供 `capturePattern(llm, conversationHistory, context)`
- 用 LLM 從 conversation history 提取：purpose, triggers, boundaries, method outline
- 回傳 `SkillCandidate`（不是完整 SkillObject — 只有 captured 的核心欄位）
- LLM 呼叫必須 try/catch + Zod schema 驗證（CONTRACT LLM-01 + LLM-02）

> **COND-02 compliance:** Harvest 的 LLM call（capturePattern）**不在 handleTurn() 內呼叫**。
> Harvest 是一個 **independent request**，由 route layer 觸發（`POST /api/skills/harvest`），
> 不與 parseIntent + generateReply 共用同一輪。流程：
>
> 1. 使用者在正常對話中完成工作 → handleTurn() 照常（2 LLM calls）
> 2. Container routing 偵測到 harvest posture → 回覆建議使用者 harvest
> 3. 使用者確認 → **新的 request** 呼叫 `POST /api/skills/harvest`
> 4. Harvest route 呼叫 `capturePattern()`（1 LLM call）→ 回傳 SkillCandidate
> 5. 使用者 review candidate → **新的 request** 呼叫 `POST /api/skills/crystallize`
>
> 這也滿足 SETTLE-01 的精神：使用者在 step 3 確認要 harvest，在 step 5 確認 candidate 內容。

---

## 實作

### Step 1: SkillCandidate schema

```typescript
import { z } from 'zod';

export const SkillCandidateSchema = z.object({
  name: z.string(),
  summary: z.string(),
  problemShapes: z.array(z.string()),
  desiredOutcomes: z.array(z.string()),
  nonGoals: z.array(z.string()),
  triggerWhen: z.array(z.string()),
  doNotTriggerWhen: z.array(z.string()),
  methodOutline: z.array(z.string()),       // high-level steps observed
  observedGotchas: z.array(z.string()),     // issues noticed during work
});

export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;
```

### Step 2: capturePattern with LLM

```typescript
import type { LLMClient } from '../llm/client';

const CAPTURE_SYSTEM_PROMPT = `You are analyzing a completed conversation to extract a reusable work pattern.
Extract: name, summary, problem shapes, outcomes, non-goals, trigger conditions, anti-triggers, method outline, and gotchas.
Be specific — these will become the seed for a governed skill object.`;

export async function capturePattern(
  llm: LLMClient,
  conversationHistory: Array<{ role: string; content: string }>,
  context: string,
): Promise<{ ok: true; data: SkillCandidate } | { ok: false; error: string }> {
  try {
    const result = await llm.generateStructured({
      system: CAPTURE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Context: ${context}\n\nConversation:\n${formatHistory(conversationHistory)}` }],
      schema: SkillCandidateSchema,
      schemaDescription: 'Skill candidate extracted from conversation pattern',
    });
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

---

## 驗收

```bash
bun run build
bun test src/skills/harvest.test.ts
# Test cases (LLM mocked):
# - valid conversation → SkillCandidate with all fields
# - LLM returns invalid schema → ok: false with error
# - LLM throws → ok: false with error message (no crash)
# - SkillCandidateSchema validates correctly
```

## Git Commit

```
feat(skills): add pattern capture for harvest flow

capturePattern() uses LLM to extract skill candidate from
conversation history. Returns SkillCandidate with purpose,
triggers, method outline. LLM call wrapped in try/catch with
Zod validation (CONTRACT LLM-01 + LLM-02).
```
