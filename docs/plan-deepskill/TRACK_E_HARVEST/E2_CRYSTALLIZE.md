# E2: Crystallize + Package (Generate Skeleton)

> **Module**: `src/skills/crystallizer.ts`
> **Layer**: L2
> **Dependencies**: E1（SkillCandidate type）, A1（SkillObjectSchema）, A2（serializeSkillObject）
> **Blocks**: F1（Bridge — harvest flow integration）

---

## 給 Agent 的起始指令

```bash
cat src/skills/harvest.ts                    # E1 output — SkillCandidate
cat src/schemas/skill-object.ts              # A1 — SkillObjectSchema
cat src/skills/yaml-parser.ts                # A2 — serializeSkillObject
cat docs/deepskill/skill-object-v0.md        # canonical schema for defaults
bun run build
```

---

## Final Result

- `src/skills/crystallizer.ts` 提供 `crystallize(candidate: SkillCandidate): CrystallizeResult`
- 產出合法的 `skill.object.yaml` 內容（通過 SkillObjectSchema.safeParse）
- 產出基本的 `SKILL.md` 內容
- 產出的 skill: `status: draft`, `currentStage: crystallize`

---

## 實作

### Step 1: CrystallizeResult type

```typescript
export interface CrystallizeResult {
  yaml: string;           // skill.object.yaml content
  skillMd: string;        // SKILL.md content
  skillObject: SkillObject;
}
```

### Step 2: crystallize function

```typescript
export function crystallize(candidate: SkillCandidate): CrystallizeResult {
  const skillObject: SkillObject = {
    kind: 'SkillObject',
    apiVersion: 'volva.ai/v0',
    id: `skill.${toKebabCase(candidate.name)}`,
    name: candidate.name,
    version: '0.1.0',
    status: 'draft',
    identity: {
      summary: candidate.summary,
      owners: { human: [], agent: [] },
      domain: '',
      tags: [],
      maturity: 'emerging',
      riskTier: 'low',
    },
    purpose: {
      problemShapes: candidate.problemShapes,
      desiredOutcomes: candidate.desiredOutcomes,
      nonGoals: candidate.nonGoals,
      notFor: [],
    },
    routing: {
      description: candidate.summary,
      triggerWhen: candidate.triggerWhen,
      // Ensure doNotTriggerWhen is never empty — promotion Gate 3 requires non-empty.
      // If LLM didn't extract any, add a generic anti-trigger from nonGoals.
      doNotTriggerWhen: candidate.doNotTriggerWhen.length > 0
        ? candidate.doNotTriggerWhen
        : candidate.nonGoals.length > 0
          ? [candidate.nonGoals[0]]
          : ['not yet defined — must be filled before promotion'],
      priority: 50,
      conflictsWith: [],
      mayChainTo: [],
    },
    contract: {
      inputs: { required: [], optional: [] },
      outputs: { primary: [], secondary: [] },
      successCriteria: candidate.desiredOutcomes,
      failureModes: [],
    },
    package: {
      root: `skills/${toKebabCase(candidate.name)}/`,
      entryFile: 'SKILL.md',
      references: [],
      scripts: [],
      assets: [],
      config: { schemaFile: 'config.schema.json', dataFile: 'config.json' },
      hooks: [],
      localState: { enabled: true, stablePath: `\${SKILL_DATA}/${toKebabCase(candidate.name)}/`, files: [] },
    },
    environment: {
      toolsRequired: [],
      toolsOptional: [],
      permissions: {
        filesystem: { read: true, write: false },
        network: { read: false, write: false },
        process: { spawn: false },
        secrets: { read: [] },
      },
      externalSideEffects: false,
      executionMode: 'advisory',
    },
    dispatch: {
      mode: 'local',
      targetSelection: { repoPolicy: 'explicit', runtimeOptions: [] },
      workerClass: [],
      handoff: { inputArtifacts: [], outputArtifacts: [] },
      executionPolicy: { sync: false, retries: 1, timeoutMinutes: 30, escalationOnFailure: true },
      approval: { requireHumanBeforeDispatch: false, requireHumanBeforeMerge: true },
    },
    verification: { smokeChecks: [], assertions: [], humanCheckpoints: [], outcomeSignals: [] },
    memory: {
      localMemoryPolicy: { canStore: [], cannotStore: ['secrets', 'unrelated-user-data'] },
      precedentWriteback: { enabled: true, target: 'edda', when: [] },
    },
    governance: {
      mutability: { agentMayEdit: [], agentMayPropose: [], humanApprovalRequired: [], forbiddenWithoutHuman: [] },
      reviewPolicy: { requiredReviewers: ['owner'] },
      promotionGates: [],
      rollbackPolicy: { allowed: true, rollbackOn: [] },
      supersession: { supersedes: [], supersededBy: null },
    },
    telemetry: {
      track: [{ metric: 'run_count' }, { metric: 'success_count' }, { metric: 'last_used_at' }],
      thresholds: { promotion_min_success: 3, retirement_idle_days: 90 },
      reporting: { target: 'edda', frequency: 'on_governance' },
    },
    lifecycle: {
      createdFrom: [],
      currentStage: 'crystallize',
      promotionPath: ['draft', 'sandbox', 'promoted', 'core'],
      retirementCriteria: [],
      lastReviewedAt: null,
    },
  };

  const yaml = serializeSkillObject(skillObject);
  const skillMd = generateSkillMd(candidate);

  return { yaml, skillMd, skillObject };
}
```

### Step 3: generateSkillMd

```typescript
function generateSkillMd(candidate: SkillCandidate): string {
  return `# ${candidate.name}

${candidate.summary}

## When to Use

${candidate.triggerWhen.map(t => `- ${t}`).join('\n')}

## When NOT to Use

${candidate.doNotTriggerWhen.map(t => `- ${t}`).join('\n')}

## Method

${candidate.methodOutline.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Known Gotchas

${candidate.observedGotchas.map(g => `- ${g}`).join('\n')}
`;
}
```

---

## 驗收

```bash
bun run build
bun test src/skills/crystallizer.test.ts

# Full Track E validation:
bun test src/skills/harvest.test.ts src/skills/crystallizer.test.ts

# Test cases:
# - valid candidate → CrystallizeResult with valid yaml + skillMd
# - output yaml passes SkillObjectSchema.safeParse
# - output status = 'draft'
# - output currentStage = 'crystallize'
# - output SKILL.md contains trigger/anti-trigger/method/gotchas
```

## Git Commit

```
feat(skills): add crystallizer for skill candidate → skeleton

crystallize() converts SkillCandidate to valid skill.object.yaml
and SKILL.md with sensible defaults. Output is status: draft,
currentStage: crystallize, ready for packaging.
```
