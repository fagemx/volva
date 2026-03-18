# A3: Overlay Merge Engine

> **Module**: `src/skills/overlay-merge.ts`
> **Layer**: L0
> **Dependencies**: A1（SkillObjectSchema）, A2（YAML Parser）
> **Blocks**: B1（Registry — merged views）, F1（Bridge — runtime merge）

---

## 給 Agent 的起始指令

```bash
cat src/schemas/skill-object.ts              # A1 output — schemas
cat src/skills/yaml-parser.ts                # A2 output — parser
cat docs/deepskill/four-plane-ownership-v0.md # Section 6.1 Overlay Merge Rules
cat docs/plan-deepskill/CONTRACT.md          # OWNER-01 rule
bun run build
```

---

## Final Result

- `src/skills/overlay-merge.ts` 提供 `mergeSkillObject(base, dispatchOverlay?, runtimeOverlay?)`
- Scope enforcement: dispatch overlay 只能碰 `dispatch.*`，runtime overlay 只能碰 `environment.*` + `verification.*` + `governance.mutability.*`
- 越權欄位 → throw `OverlayScopeError`
- Missing overlay → base values used as-is
- 測試覆蓋：正常 merge、越權 reject、missing overlay、partial overlay

---

## 實作

### Step 1: Define allowed scopes

```typescript
const DISPATCH_OVERLAY_SCOPE = ['dispatch'] as const;
const RUNTIME_OVERLAY_SCOPE = ['environment', 'verification'] as const;
const RUNTIME_GOVERNANCE_SCOPE = ['governance.mutability'] as const;
```

### Step 2: Deep scope validation

> **Critical fix:** 必須做 deep path validation，不能只查 top-level key。
> 例如 `{governance: {mutability:{}, reviewPolicy:{}}}` 的 top-level key 是 `governance`，
> 但 `reviewPolicy` 不在 runtime overlay scope 內。必須逐 nested key 檢查。

```typescript
export class OverlayScopeError extends Error {
  constructor(
    public readonly overlayType: 'dispatch' | 'runtime',
    public readonly invalidFields: string[],
  ) {
    super(`${overlayType} overlay contains out-of-scope fields: ${invalidFields.join(', ')}`);
    this.name = 'OverlayScopeError';
  }
}

/**
 * Recursively collect all leaf paths from a nested object.
 * e.g., { governance: { mutability: { x: 1 }, reviewPolicy: { y: 2 } } }
 * → ['governance.mutability.x', 'governance.reviewPolicy.y']
 */
function collectPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      paths.push(...collectPaths(val as Record<string, unknown>, fullPath));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

/**
 * Check if a path is within any of the allowed scopes.
 * e.g., path 'governance.mutability.agentMayEdit' is allowed by scope 'governance.mutability'
 *        path 'governance.reviewPolicy.x' is NOT allowed by scope 'governance.mutability'
 */
function isPathAllowed(path: string, allowedScopes: readonly string[]): boolean {
  return allowedScopes.some(scope => path === scope || path.startsWith(scope + '.'));
}

function validateOverlayScope(
  overlay: Record<string, unknown>,
  allowedScopes: readonly string[],
  overlayType: 'dispatch' | 'runtime',
): void {
  const allPaths = collectPaths(overlay);
  const invalidFields = allPaths.filter(p => !isPathAllowed(p, allowedScopes));
  if (invalidFields.length > 0) {
    throw new OverlayScopeError(overlayType, invalidFields);
  }
}
```

### Step 3: mergeSkillObject

```typescript
// Dispatch overlay: only dispatch.* paths allowed
const DISPATCH_ALLOWED_SCOPES = ['dispatch'] as const;

// Runtime overlay: environment.*, verification.*, governance.mutability.* allowed
const RUNTIME_ALLOWED_SCOPES = ['environment', 'verification', 'governance.mutability'] as const;

export function mergeSkillObject(
  base: SkillObject,
  dispatchOverlay?: Record<string, unknown>,
  runtimeOverlay?: Record<string, unknown>,
): SkillObject {
  const merged = structuredClone(base);

  if (dispatchOverlay) {
    validateOverlayScope(dispatchOverlay, DISPATCH_ALLOWED_SCOPES, 'dispatch');
    if (dispatchOverlay.dispatch) {
      merged.dispatch = { ...merged.dispatch, ...(dispatchOverlay.dispatch as typeof merged.dispatch) };
    }
  }

  if (runtimeOverlay) {
    validateOverlayScope(runtimeOverlay, RUNTIME_ALLOWED_SCOPES, 'runtime');
    if (runtimeOverlay.environment) {
      merged.environment = { ...merged.environment, ...(runtimeOverlay.environment as typeof merged.environment) };
    }
    if (runtimeOverlay.verification) {
      merged.verification = { ...merged.verification, ...(runtimeOverlay.verification as typeof merged.verification) };
    }
    if (runtimeOverlay.governance && typeof runtimeOverlay.governance === 'object') {
      const gov = runtimeOverlay.governance as Record<string, unknown>;
      if (gov.mutability) {
        merged.governance = {
          ...merged.governance,
          mutability: { ...merged.governance.mutability, ...(gov.mutability as typeof merged.governance.mutability) },
        };
      }
    }
  }

  return merged;
}
```

---

## 驗收

```bash
# 1. Compiles
bun run build

# 2. Tests pass
bun test src/skills/overlay-merge.test.ts

# 3. Scope enforcement test exists (must include nested path test)
grep -c "OverlayScopeError\|out-of-scope\|reviewPolicy" src/skills/overlay-merge.test.ts
# Expected: >= 4 (top-level reject + nested path reject + dispatch scope + runtime scope)

# 4. Track A complete
bun test src/schemas/skill-object.test.ts src/skills/yaml-parser.test.ts src/skills/overlay-merge.test.ts
```

## Git Commit

```
feat(skills): add overlay merge engine with scope enforcement

mergeSkillObject() applies Karvi dispatch and Thyra runtime overlays
with strict scope validation per four-plane-ownership-v0.md Section 6.1.
Rejects out-of-scope fields with OverlayScopeError.
```
