# A1: Project Skeleton

> **Layer**: L0
> **Dependencies**: none
> **Blocks**: A2（DB Layer）, B1（LLM Client）, C1（Card Schemas）
> **Output**: 可編譯的 TypeScript 專案骨架

---

## Bootstrap Instructions

```bash
# 確認目錄存在
ls C:/ai_agent/volva/

# 讀 spec
cat docs/VOLVA/01_ARCHITECTURE.md
cat docs/plan/CONTRACT.md
```

---

## Final Result

- `package.json` with dependencies: hono, zod, @anthropic-ai/sdk, js-yaml, better-sqlite3 (or bun:sqlite)
- `tsconfig.json` with strict: true
- `vitest.config.ts`
- 完整的 `src/` 目錄結構（空檔案佔位）
- `bun run build` zero errors

## Implementation Steps

### Step 1: 初始化專案

```bash
cd C:/ai_agent/volva
bun init -y
```

### Step 2: 安裝依賴

```bash
bun add hono zod @anthropic-ai/sdk js-yaml
bun add -d typescript @types/node vitest
```

### Step 3: 建立 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 4: 建立 package.json scripts

```json
{
  "scripts": {
    "build": "tsc --noEmit",
    "dev": "bun run --watch src/index.ts",
    "test": "vitest run",
    "cli": "bun run src/cli.ts"
  }
}
```

### Step 5: 建立目錄結構

```
src/
  db.ts
  schemas/
    conversation.ts
    card.ts
    settlement.ts
    intent.ts
  llm/
    client.ts
    intent-parser.ts
    response-gen.ts
    prompts.ts
  cards/
    card-manager.ts
  conductor/
    state-machine.ts
    turn-handler.ts
    rhythm.ts
  settlement/
    router.ts
    village-pack-builder.ts
  thyra-client/
    client.ts
    schemas.ts
  routes/
    conversations.ts
    cards.ts
    settlements.ts
  cli.ts
  index.ts
```

每個檔案先放一行 `export {};` 確保 TypeScript 認它是 module。

### Step 6: 建立 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

## Acceptance Criteria

```bash
# 1. 建置通過
bun run build

# 2. 目錄結構正確
ls src/schemas/ src/llm/ src/cards/ src/conductor/ src/settlement/ src/thyra-client/ src/routes/

# 3. 所有檔案存在
find src -name "*.ts" | wc -l  # Expected: ~18 files
```

## Git Commit

```
feat: init project skeleton with TypeScript + Hono + Zod
```
