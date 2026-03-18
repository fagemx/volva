# D3: Regime-Specific Builder Configs + Full Track D Tests

> **Module**: `src/decision/space-builder.ts` (regime config additions), `src/decision/space-builder.test.ts`, `src/decision/kill-filters.test.ts`
> **Layer**: L2
> **Dependencies**: D1（Space Builder — buildSpace）, D2（Kill Filters — applyKillFilters）
> **Blocks**: E1（Probe Shell）, F1（Decision Routes）

---

## Bootstrap Instructions

```bash
# 1. Read D1 and D2 outputs
cat src/decision/space-builder.ts
cat src/decision/kill-filters.ts

# 2. Read spec for regime-specific configs
cat docs/world-design-v0/economic-regime-v0.md    # Section 10: 7 canonical vehicles
cat docs/world-design-v0/governance-regime-v0.md   # Section 9: 6 canonical world forms

# 3. Read shared types
cat src/schemas/decision.ts

# 4. Read test patterns
cat src/llm/client.test.ts                        # LLM mock pattern
cat docs/plan-world-design/CONTRACT.md             # TEST-01

# 5. Verify baseline
bun run build
```

---

## Final Result

- `src/decision/space-builder.ts` gains exported regime config constants: `ECONOMIC_VEHICLES`, `GOVERNANCE_WORLD_FORMS`
- `src/decision/space-builder.test.ts` covers: LLM call with correct schema, economic candidate generation, governance candidate generation, fallback on LLM failure
- `src/decision/kill-filters.test.ts` covers: common filters, economic-specific filters, governance-specific filters, empty input, all-killed scenario
- `bun test src/decision/space-builder.test.ts` pass
- `bun test src/decision/kill-filters.test.ts` pass

---

## Implementation Steps

### Step 1: Add regime configuration constants to space-builder.ts

- **File**: `src/decision/space-builder.ts`
- **Reference**: `economic-regime-v0.md` Section 10 (7 vehicles), `governance-regime-v0.md` Section 9 (6 world forms)
- **Key changes**:
  1. Export economic vehicle types:
     ```typescript
     export const ECONOMIC_VEHICLES = [
       'done_for_you_service',
       'done_with_you_install',
       'workflow_audit',
       'productized_service',
       'template_pack',
       'tool',
       'operator_model',
     ] as const;
     ```
  2. Export governance world forms:
     ```typescript
     export const GOVERNANCE_WORLD_FORMS = [
       'market',
       'commons',
       'town',
       'port',
       'night_engine',
       'managed_knowledge_field',
     ] as const;
     ```
  3. Use these constants in `buildUserPrompt()` to inject regime-specific guidance into LLM prompt

### Step 2: Write space-builder tests

- **File**: `src/decision/space-builder.test.ts`
- **Reference**: `CLAUDE.md` test patterns (LLM mock with `vi.mock`), CONTRACT TEST-01
- **Key changes**:
  1. Mock LLM client:
     ```typescript
     const mockCreate = vi.fn();
     vi.mock('@anthropic-ai/sdk', () => ({
       default: vi.fn().mockImplementation(() => ({
         messages: { create: mockCreate },
       })),
     }));
     ```
  2. Test: economic regime returns candidates with `vehicle` field populated
     ```typescript
     it('generates economic candidates with domain x vehicle', async () => {
       mockCreate.mockResolvedValueOnce({
         content: [{ type: 'text', text: JSON.stringify([{
           id: 'c1', regime: 'economic', form: 'service',
           domain: 'video-generation', vehicle: 'done_for_you_service',
           description: 'Video generation service', whyThisCandidate: ['edge in video'],
           assumptions: ['buyer exists'], timeToSignal: 'short', notes: [],
         }]) }],
       });
       const result = await buildSpace(llm, economicIntentRoute, pathCheckResult, context);
       expect(result.length).toBeGreaterThan(0);
       expect(result[0].regime).toBe('economic');
       expect(result[0].vehicle).toBeDefined();
     });
     ```
  3. Test: governance regime returns candidates with `worldForm` field populated
  4. Test: LLM failure returns empty array (not crash)
     ```typescript
     it('returns empty array on LLM failure', async () => {
       mockCreate.mockRejectedValueOnce(new Error('API down'));
       const result = await buildSpace(llm, economicIntentRoute, pathCheckResult, context);
       expect(result).toEqual([]);
     });
     ```
  5. Test: Zod validation rejects malformed LLM output

### Step 3: Write kill-filters tests

- **File**: `src/decision/kill-filters.test.ts`
- **Reference**: `probe-commit.md` Section 7, `economic-regime-v0.md` Section 11, `governance-regime-v0.md` Section 12
- **Key changes**:
  1. Test: common filter — edge mismatch kills candidate with no edge overlap
     ```typescript
     it('kills candidate with no edge overlap', () => {
       const candidates = [makeCandidateWith({ whyThisCandidate: ['video expertise'] })];
       const result = applyKillFilters(candidates, 'economic', {
         edgeProfile: ['cooking', 'farming'],
       });
       expect(result).toHaveLength(0);
     });
     ```
  2. Test: common filter — search friction too high
  3. Test: economic filter — generic tool fantasy killed
     ```typescript
     it('kills generic tool fantasy in economic regime', () => {
       const candidates = [makeCandidateWith({ form: 'tool', description: 'AI tool for everyone' })];
       const result = applyKillFilters(candidates, 'economic', {});
       expect(result).toHaveLength(0);
     });
     ```
  4. Test: governance filter — fake world killed (no state/change density)
  5. Test: governance filter — tool-in-world-clothing killed
  6. Test: empty input returns empty output
  7. Test: candidate passes all filters when valid
  8. Test: economic filters not applied to governance regime

---

## Acceptance Criteria

```bash
# 1. Compiles
bun run build

# 2. Lint passes
bun run lint

# 3. All space-builder tests pass
bun test src/decision/space-builder.test.ts

# 4. All kill-filters tests pass
bun test src/decision/kill-filters.test.ts

# 5. Regime configs are exported
grep -n "export const ECONOMIC_VEHICLES" src/decision/space-builder.ts
grep -n "export const GOVERNANCE_WORLD_FORMS" src/decision/space-builder.ts

# 6. No 'any' usage (CONTRACT TYPE-01)
grep -n "as any\|: any" src/decision/space-builder.test.ts src/decision/kill-filters.test.ts | wc -l
# Expected: 0
```

## Git Commit

```
feat(decision): add regime configs and full Track D tests

Export ECONOMIC_VEHICLES (7) and GOVERNANCE_WORLD_FORMS (6) constants.
Tests cover: LLM candidate generation per regime, Zod validation,
LLM failure fallback, all kill filter categories (common + economic
+ governance), edge cases. Per CONTRACT TEST-01.
```
