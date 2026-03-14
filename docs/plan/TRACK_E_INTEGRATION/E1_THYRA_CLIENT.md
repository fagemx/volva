# E1: Thyra HTTP Client

> **Layer**: L3
> **Dependencies**: A2（schemas）
> **Blocks**: E2（CLI — 沉澱後呼叫 Thyra）
> **Output**: `src/thyra-client/client.ts`, `src/thyra-client/schemas.ts`

---

## Bootstrap Instructions

```bash
cat docs/plan/CONTRACT.md       # ARCH-01
# 查看 Thyra 的現有 API
curl -s http://localhost:3462/api/health 2>/dev/null || echo "Thyra not running (OK for dev)"
bun run build
```

---

## Implementation

ThyraClient 是一個簡單的 HTTP wrapper，呼叫 Thyra REST API。

核心方法：
```typescript
class ThyraClient {
  constructor(baseUrl: string = 'http://localhost:3462') {}

  async createVillage(input: { name: string; target_repo: string }): Promise<ThyraResponse> {}
  async createConstitution(villageId: string, input: ConstitutionInput): Promise<ThyraResponse> {}
  async createChief(villageId: string, input: ChiefInput): Promise<ThyraResponse> {}
  async createSkill(input: SkillInput): Promise<ThyraResponse> {}
  async applyVillagePack(yaml: string): Promise<ThyraResponse> {}
  async getHealth(): Promise<{ ok: boolean }> {}
}
```

`src/thyra-client/schemas.ts`：複製 Thyra 的 response format（`{ ok, data?, error? }`）。

測試：mock HTTP 呼叫，驗證 URL 和 payload 格式正確。

## Acceptance Criteria

```bash
bun run build
bun test src/thyra-client/
```

## Git Commit

```
feat(thyra): add HTTP client wrapper for Thyra API
```
