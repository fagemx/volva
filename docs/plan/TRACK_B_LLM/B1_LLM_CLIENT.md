# B1: LLM Client Wrapper

> **Layer**: L1
> **Dependencies**: A1（Project Skeleton）
> **Blocks**: B2（Intent Parser + Response Gen）
> **Output**: `src/llm/client.ts` — LLMClient class

---

## Bootstrap Instructions

```bash
cat docs/plan/CONTRACT.md               # LLM-01, LLM-02
cat docs/VOLVA/01_ARCHITECTURE.md        # LLM 整合章節
bun run build                            # 確認 A1+A2 baseline
```

---

## Final Result

- `src/llm/client.ts`: LLMClient class wrapping Anthropic SDK
- Supports: text response, structured JSON response (with Zod validation)
- Graceful error handling: timeout, API error, invalid response → fallback
- `bun run build` zero errors
- `bun test src/llm/client.test.ts` pass

## Implementation Steps

### Step 1: src/llm/client.ts

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export interface LLMCallOptions {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
}

export interface LLMStructuredOptions<T extends z.ZodType> extends LLMCallOptions {
  schema: T;
  schemaDescription: string;
}

export class LLMClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model = model ?? process.env.VOLVA_MODEL ?? 'claude-sonnet-4-20250514';
  }

  /** 純文字回覆 */
  async generateText(options: LLMCallOptions): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        system: options.system,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 2000,
      });
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    } catch (error) {
      console.error('[LLMClient] generateText failed:', error);
      return '[系統暫時無法回應，請稍後再試]';
    }
  }

  /** 結構化 JSON 回覆，通過 Zod 驗證 */
  async generateStructured<T extends z.ZodType>(
    options: LLMStructuredOptions<T>
  ): Promise<{ ok: true; data: z.infer<T> } | { ok: false; error: string }> {
    try {
      const systemWithSchema = `${options.system}\n\nYou MUST respond with valid JSON matching this description: ${options.schemaDescription}\nRespond ONLY with JSON, no other text.`;

      const response = await this.client.messages.create({
        model: this.model,
        system: systemWithSchema,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 2000,
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock?.text) {
        return { ok: false, error: 'Empty response from LLM' };
      }

      // 嘗試 parse JSON（容忍 markdown code block 包裹）
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      const validated = options.schema.safeParse(parsed);

      if (!validated.success) {
        return { ok: false, error: `Schema validation failed: ${validated.error.message}` };
      }

      return { ok: true, data: validated.data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LLMClient] generateStructured failed:', msg);
      return { ok: false, error: msg };
    }
  }
}
```

### Step 2: src/llm/client.test.ts

用 mock 測試，不需要真正的 API key：

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
// 測試 LLMClient 的 JSON parsing + Zod validation 邏輯
// 實際 API 呼叫用 mock 或 integration test

describe('LLMClient utilities', () => {
  it('strips markdown code block from JSON response', () => {
    const raw = '```json\n{"type":"test"}\n```';
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    expect(JSON.parse(cleaned)).toEqual({ type: 'test' });
  });

  it('Zod safeParse catches invalid schema', () => {
    const schema = z.object({ type: z.string(), value: z.number() });
    const result = schema.safeParse({ type: 'test', value: 'not a number' });
    expect(result.success).toBe(false);
  });

  it('Zod safeParse accepts valid data', () => {
    const schema = z.object({ type: z.string(), value: z.number() });
    const result = schema.safeParse({ type: 'test', value: 42 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe(42);
  });
});
```

## Acceptance Criteria

```bash
# 1. Build
bun run build

# 2. Tests
bun test src/llm/client.test.ts

# 3. No any types
grep -r "as any" src/llm/client.ts | wc -l  # Expected: 0
```

## Git Commit

```
feat(llm): add LLMClient wrapper with structured JSON output + Zod validation
```
