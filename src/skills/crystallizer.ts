import type { SkillCandidate } from './harvest';
import type { SkillObject } from '../schemas/skill-object';
import { SkillObjectSchema } from '../schemas/skill-object';
import { serializeSkillObject } from './yaml-parser';

// ─── Result Type ───

export interface CrystallizeResult {
  yaml: string;
  skillMd: string;
  skillObject: SkillObject;
}

// ─── Helpers ───

function toKebabCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveAntiTriggers(candidate: SkillCandidate): string[] {
  if (candidate.doNotTriggerWhen.length > 0) {
    return candidate.doNotTriggerWhen;
  }
  // Derive from observedGotchas if available
  if (candidate.observedGotchas.length > 0) {
    return [candidate.observedGotchas[0]];
  }
  // Fall back to nonGoals
  if (candidate.nonGoals.length > 0) {
    return [candidate.nonGoals[0]];
  }
  return ['not yet defined — must be filled before promotion'];
}

function generateSkillMd(candidate: SkillCandidate, antiTriggers: string[]): string {
  return `# ${candidate.name}

${candidate.summary}

## When to Use

${candidate.triggerWhen.map((t) => `- ${t}`).join('\n')}

## When NOT to Use

${antiTriggers.map((t) => `- ${t}`).join('\n')}

## Method

${candidate.methodOutline.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Known Gotchas

${candidate.observedGotchas.map((g) => `- ${g}`).join('\n')}
`;
}

// ─── Main Function ───

export function crystallize(candidate: SkillCandidate): CrystallizeResult {
  const kebab = toKebabCase(candidate.name);
  const antiTriggers = deriveAntiTriggers(candidate);

  const skillObject: SkillObject = {
    kind: 'SkillObject',
    apiVersion: 'volva.ai/v0',
    id: `skill.${kebab}`,
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
      doNotTriggerWhen: antiTriggers,
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
      root: `skills/${kebab}/`,
      entryFile: 'SKILL.md',
      references: [],
      scripts: [],
      assets: [],
      config: { schemaFile: 'config.schema.json', dataFile: 'config.json' },
      hooks: [],
      localState: {
        enabled: true,
        stablePath: `\${SKILL_DATA}/${kebab}/`,
        files: [],
      },
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
      executionPolicy: {
        sync: false,
        retries: 1,
        timeoutMinutes: 30,
        escalationOnFailure: true,
      },
      approval: { requireHumanBeforeDispatch: false, requireHumanBeforeMerge: true },
    },
    verification: {
      smokeChecks: [],
      assertions: [],
      humanCheckpoints: [],
      outcomeSignals: [],
    },
    memory: {
      localMemoryPolicy: {
        canStore: [],
        cannotStore: ['secrets', 'unrelated-user-data'],
      },
      precedentWriteback: { enabled: true, target: 'edda', when: [] },
    },
    governance: {
      mutability: {
        agentMayEdit: [],
        agentMayPropose: [],
        humanApprovalRequired: [],
        forbiddenWithoutHuman: [],
      },
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

  // Validate output against schema
  const parsed = SkillObjectSchema.safeParse(skillObject);
  if (!parsed.success) {
    throw new Error(`crystallize produced invalid SkillObject: ${parsed.error.message}`);
  }

  const yaml = serializeSkillObject(parsed.data);
  const skillMd = generateSkillMd(candidate, antiTriggers);

  return { yaml, skillMd, skillObject: parsed.data };
}
