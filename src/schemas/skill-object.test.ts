import { describe, it, expect } from 'vitest';
import {
  SkillStatusEnum,
  LifecycleStageEnum,
  MaturityEnum,
  RiskTierEnum,
  ExecutionModeEnum,
  DispatchModeEnum,
  IdentitySchema,
  PurposeSchema,
  RoutingSchema,
  ContractSchema,
  PackageSchema,
  EnvironmentSchema,
  DispatchSchema,
  VerificationSchema,
  MemorySchema,
  GovernanceSchema,
  TelemetrySchema,
  LifecycleSchema,
  SkillObjectSchema,
} from './skill-object';

// ─── Test fixtures ───

const validIdentity = {
  summary: 'Generates architecture specs from fuzzy concepts',
  owners: { human: ['alice'], agent: ['volva'] },
  domain: 'architecture',
  tags: ['spec', 'design'],
  maturity: 'emerging' as const,
  riskTier: 'low' as const,
};

const validPurpose = {
  problemShapes: ['ambiguous-intent', 'architecture-crystallization'],
  desiredOutcomes: ['reviewable-spec-stack'],
  nonGoals: ['direct-implementation'],
  notFor: ['production-ops'],
};

const validRouting = {
  description: 'Trigger when user has fuzzy concept needing architecture',
  triggerWhen: ['user has fuzzy concept needing architecture structure'],
  doNotTriggerWhen: ['task is already implementation-ready'],
  priority: 50,
  conflictsWith: [],
  mayChainTo: [],
};

const validContract = {
  inputs: {
    required: [
      { name: 'service_name', type: 'string', description: 'Name of the service' },
    ],
    optional: [
      { name: 'target_env', type: 'string', default: 'staging', description: 'Target environment' },
    ],
  },
  outputs: {
    primary: [{ name: 'spec_url', type: 'string', description: 'URL of the spec' }],
    secondary: [],
  },
  successCriteria: ['spec is reviewable'],
  failureModes: [{ mode: 'timeout', mitigation: 'escalate to ops' }],
};

const validPackage = {
  root: 'skills/arch-spec',
  entryFile: 'SKILL.md',
  references: ['references/arch-patterns.md'],
  scripts: [],
  assets: [],
  config: { schemaFile: 'config.schema.json', dataFile: 'config.json' },
  hooks: [{ event: 'pre-run' as const, script: 'validate.sh' }],
  localState: { enabled: true, stablePath: '${SKILL_DATA}/arch-spec/', files: [] },
};

const validEnvironment = {
  toolsRequired: ['git'],
  toolsOptional: [],
  permissions: {
    filesystem: { read: true, write: false },
    network: { read: false, write: false },
    process: { spawn: false },
    secrets: { read: [] },
  },
  externalSideEffects: false,
  executionMode: 'advisory' as const,
};

const validDispatch = {
  mode: 'local' as const,
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
};

const validVerification = {
  smokeChecks: ['has-boundaries', 'has-non-goals'],
  assertions: [],
  humanCheckpoints: ['boundary-review'],
  outcomeSignals: [],
};

const validMemory = {
  localMemoryPolicy: {
    canStore: ['drafts', 'logs'],
    cannotStore: ['secrets', 'unrelated-user-data'],
  },
  precedentWriteback: { enabled: true, target: 'edda', when: [] },
};

const validGovernance = {
  mutability: {
    agentMayEdit: ['tags'],
    agentMayPropose: ['routing.triggerWhen'],
    humanApprovalRequired: ['contract'],
    forbiddenWithoutHuman: ['enabling-destructive-actions'],
  },
  reviewPolicy: { requiredReviewers: ['owner'] },
  promotionGates: [],
  rollbackPolicy: { allowed: true, rollbackOn: [] },
  supersession: { supersedes: [], supersededBy: null },
};

const validTelemetry = {
  track: [
    { metric: 'run_count' },
    { metric: 'success_count' },
    { metric: 'last_used_at' },
  ],
  thresholds: { promotion_min_success: 3, retirement_idle_days: 90 },
  reporting: { target: 'edda', frequency: 'on_governance' as const },
};

const validLifecycle = {
  createdFrom: ['conversation:conv_123'],
  currentStage: 'capture' as const,
  promotionPath: ['draft' as const, 'sandbox' as const, 'promoted' as const, 'core' as const],
  retirementCriteria: [],
  lastReviewedAt: null,
};

const validSkillObject = {
  kind: 'SkillObject' as const,
  apiVersion: 'volva.ai/v0',
  id: 'skill.arch-spec',
  name: 'arch-spec',
  version: '0.1.0',
  status: 'draft' as const,
  identity: validIdentity,
  purpose: validPurpose,
  routing: validRouting,
  contract: validContract,
  package: validPackage,
  environment: validEnvironment,
  dispatch: validDispatch,
  verification: validVerification,
  memory: validMemory,
  governance: validGovernance,
  telemetry: validTelemetry,
  lifecycle: validLifecycle,
};

// ─── Enum Tests ───

describe('SkillStatusEnum', () => {
  it('accepts all valid statuses', () => {
    for (const s of ['draft', 'sandbox', 'promoted', 'core', 'deprecated', 'superseded']) {
      expect(SkillStatusEnum.parse(s)).toBe(s);
    }
  });

  it('rejects invalid status', () => {
    expect(() => SkillStatusEnum.parse('active')).toThrow();
  });
});

describe('LifecycleStageEnum', () => {
  it('accepts all valid stages', () => {
    for (const s of ['capture', 'crystallize', 'package', 'route', 'execute', 'verify', 'learn', 'govern']) {
      expect(LifecycleStageEnum.parse(s)).toBe(s);
    }
  });

  it('rejects invalid stage', () => {
    expect(() => LifecycleStageEnum.parse('deploy')).toThrow();
  });
});

describe('MaturityEnum', () => {
  it('accepts all valid values', () => {
    for (const v of ['emerging', 'stable', 'core']) {
      expect(MaturityEnum.parse(v)).toBe(v);
    }
  });

  it('rejects invalid value', () => {
    expect(() => MaturityEnum.parse('proven')).toThrow();
  });
});

describe('RiskTierEnum', () => {
  it('accepts all valid values', () => {
    for (const v of ['low', 'medium', 'high', 'critical']) {
      expect(RiskTierEnum.parse(v)).toBe(v);
    }
  });

  it('rejects invalid value', () => {
    expect(() => RiskTierEnum.parse('extreme')).toThrow();
  });
});

describe('ExecutionModeEnum', () => {
  it('accepts all valid values', () => {
    for (const v of ['advisory', 'assistive', 'active', 'destructive']) {
      expect(ExecutionModeEnum.parse(v)).toBe(v);
    }
  });

  it('rejects invalid value', () => {
    expect(() => ExecutionModeEnum.parse('manual')).toThrow();
  });
});

describe('DispatchModeEnum', () => {
  it('accepts all valid values', () => {
    for (const v of ['local', 'karvi', 'hybrid']) {
      expect(DispatchModeEnum.parse(v)).toBe(v);
    }
  });

  it('rejects invalid value', () => {
    expect(() => DispatchModeEnum.parse('remote')).toThrow();
  });
});

// ─── Section Schema Tests ───

describe('IdentitySchema', () => {
  it('parses valid identity', () => {
    const result = IdentitySchema.safeParse(validIdentity);
    expect(result.success).toBe(true);
  });

  it('rejects missing summary', () => {
    const rest = Object.fromEntries(Object.entries(validIdentity).filter(([k]) => k !== "summary"));
    expect(IdentitySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid maturity', () => {
    expect(
      IdentitySchema.safeParse({ ...validIdentity, maturity: 'proven' }).success,
    ).toBe(false);
  });

  it('rejects invalid riskTier', () => {
    expect(
      IdentitySchema.safeParse({ ...validIdentity, riskTier: 'extreme' }).success,
    ).toBe(false);
  });
});

describe('PurposeSchema', () => {
  it('parses valid purpose', () => {
    expect(PurposeSchema.safeParse(validPurpose).success).toBe(true);
  });

  it('parses purpose with empty arrays', () => {
    expect(
      PurposeSchema.safeParse({
        problemShapes: [],
        desiredOutcomes: [],
        nonGoals: [],
        notFor: [],
      }).success,
    ).toBe(true);
  });

  it('rejects missing problemShapes', () => {
    const rest = Object.fromEntries(Object.entries(validPurpose).filter(([k]) => k !== "problemShapes"));
    expect(PurposeSchema.safeParse(rest).success).toBe(false);
  });
});

describe('RoutingSchema', () => {
  it('parses valid routing', () => {
    expect(RoutingSchema.safeParse(validRouting).success).toBe(true);
  });

  it('applies default priority of 50', () => {
    const rest = Object.fromEntries(Object.entries(validRouting).filter(([k]) => k !== "priority"));
    const result = RoutingSchema.parse(rest);
    expect(result.priority).toBe(50);
  });

  it('rejects priority > 100', () => {
    expect(
      RoutingSchema.safeParse({ ...validRouting, priority: 101 }).success,
    ).toBe(false);
  });

  it('rejects priority < 0', () => {
    expect(
      RoutingSchema.safeParse({ ...validRouting, priority: -1 }).success,
    ).toBe(false);
  });

  it('rejects non-integer priority', () => {
    expect(
      RoutingSchema.safeParse({ ...validRouting, priority: 50.5 }).success,
    ).toBe(false);
  });
});

describe('ContractSchema', () => {
  it('parses valid contract', () => {
    expect(ContractSchema.safeParse(validContract).success).toBe(true);
  });

  it('parses contract with empty arrays', () => {
    expect(
      ContractSchema.safeParse({
        inputs: { required: [], optional: [] },
        outputs: { primary: [], secondary: [] },
        successCriteria: [],
        failureModes: [],
      }).success,
    ).toBe(true);
  });

  it('rejects input entry without name', () => {
    expect(
      ContractSchema.safeParse({
        ...validContract,
        inputs: {
          required: [{ type: 'string', description: 'missing name' }],
          optional: [],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts optional entry with default', () => {
    const result = ContractSchema.safeParse({
      ...validContract,
      inputs: {
        required: [],
        optional: [
          { name: 'env', type: 'string', default: 'staging', description: 'Target env' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('PackageSchema', () => {
  it('parses valid package', () => {
    expect(PackageSchema.safeParse(validPackage).success).toBe(true);
  });

  it('rejects missing entryFile', () => {
    const rest = Object.fromEntries(Object.entries(validPackage).filter(([k]) => k !== "entryFile"));
    expect(PackageSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid hook event', () => {
    expect(
      PackageSchema.safeParse({
        ...validPackage,
        hooks: [{ event: 'on-start', script: 'run.sh' }],
      }).success,
    ).toBe(false);
  });
});

describe('EnvironmentSchema', () => {
  it('parses valid environment', () => {
    expect(EnvironmentSchema.safeParse(validEnvironment).success).toBe(true);
  });

  it('rejects invalid executionMode', () => {
    expect(
      EnvironmentSchema.safeParse({ ...validEnvironment, executionMode: 'manual' })
        .success,
    ).toBe(false);
  });

  it('rejects missing permissions', () => {
    const rest = Object.fromEntries(Object.entries(validEnvironment).filter(([k]) => k !== "permissions"));
    expect(EnvironmentSchema.safeParse(rest).success).toBe(false);
  });
});

describe('DispatchSchema', () => {
  it('parses valid dispatch', () => {
    expect(DispatchSchema.safeParse(validDispatch).success).toBe(true);
  });

  it('rejects invalid mode', () => {
    expect(
      DispatchSchema.safeParse({ ...validDispatch, mode: 'remote' }).success,
    ).toBe(false);
  });

  it('rejects negative retries', () => {
    expect(
      DispatchSchema.safeParse({
        ...validDispatch,
        executionPolicy: { ...validDispatch.executionPolicy, retries: -1 },
      }).success,
    ).toBe(false);
  });

  it('rejects timeoutMinutes < 1', () => {
    expect(
      DispatchSchema.safeParse({
        ...validDispatch,
        executionPolicy: { ...validDispatch.executionPolicy, timeoutMinutes: 0 },
      }).success,
    ).toBe(false);
  });
});

describe('VerificationSchema', () => {
  it('parses valid verification', () => {
    expect(VerificationSchema.safeParse(validVerification).success).toBe(true);
  });

  it('parses verification with empty arrays', () => {
    expect(
      VerificationSchema.safeParse({
        smokeChecks: [],
        assertions: [],
        humanCheckpoints: [],
        outcomeSignals: [],
      }).success,
    ).toBe(true);
  });
});

describe('MemorySchema', () => {
  it('parses valid memory', () => {
    expect(MemorySchema.safeParse(validMemory).success).toBe(true);
  });

  it('rejects missing precedentWriteback', () => {
    expect(
      MemorySchema.safeParse({ localMemoryPolicy: validMemory.localMemoryPolicy })
        .success,
    ).toBe(false);
  });
});

describe('GovernanceSchema', () => {
  it('parses valid governance', () => {
    expect(GovernanceSchema.safeParse(validGovernance).success).toBe(true);
  });

  it('rejects missing mutability', () => {
    const rest = Object.fromEntries(Object.entries(validGovernance).filter(([k]) => k !== "mutability"));
    expect(GovernanceSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts supersededBy as null', () => {
    const result = GovernanceSchema.safeParse(validGovernance);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.supersession.supersededBy).toBeNull();
    }
  });

  it('accepts supersededBy as string', () => {
    const result = GovernanceSchema.safeParse({
      ...validGovernance,
      supersession: { supersedes: [], supersededBy: 'skill.new-version' },
    });
    expect(result.success).toBe(true);
  });
});

describe('TelemetrySchema', () => {
  it('parses valid telemetry', () => {
    expect(TelemetrySchema.safeParse(validTelemetry).success).toBe(true);
  });

  it('parses telemetry with partial thresholds and reporting', () => {
    expect(
      TelemetrySchema.safeParse({
        track: [{ metric: 'run_count' }],
        thresholds: {},
        reporting: {},
      }).success,
    ).toBe(true);
  });

  it('rejects invalid reporting frequency', () => {
    expect(
      TelemetrySchema.safeParse({
        ...validTelemetry,
        reporting: { frequency: 'daily' },
      }).success,
    ).toBe(false);
  });
});

describe('LifecycleSchema', () => {
  it('parses valid lifecycle', () => {
    expect(LifecycleSchema.safeParse(validLifecycle).success).toBe(true);
  });

  it('accepts lastReviewedAt as ISO string', () => {
    const result = LifecycleSchema.safeParse({
      ...validLifecycle,
      lastReviewedAt: '2026-01-15T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid currentStage', () => {
    expect(
      LifecycleSchema.safeParse({ ...validLifecycle, currentStage: 'deploy' }).success,
    ).toBe(false);
  });

  it('rejects invalid promotionPath entry', () => {
    expect(
      LifecycleSchema.safeParse({ ...validLifecycle, promotionPath: ['invalid'] })
        .success,
    ).toBe(false);
  });
});

// ─── Top-Level SkillObject ───

describe('SkillObjectSchema', () => {
  it('parses a complete valid skill object', () => {
    const result = SkillObjectSchema.safeParse(validSkillObject);
    expect(result.success).toBe(true);
  });

  it('parses skill object without optional telemetry and lifecycle', () => {
    const rest = Object.fromEntries(Object.entries(validSkillObject).filter(([k]) => k !== "telemetry" && k !== "lifecycle"));
    const result = SkillObjectSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it('rejects invalid kind', () => {
    expect(
      SkillObjectSchema.safeParse({ ...validSkillObject, kind: 'Task' }).success,
    ).toBe(false);
  });

  it('rejects missing required section', () => {
    const rest = Object.fromEntries(Object.entries(validSkillObject).filter(([k]) => k !== "identity"));
    expect(SkillObjectSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(
      SkillObjectSchema.safeParse({ ...validSkillObject, status: 'active' }).success,
    ).toBe(false);
  });

  it('preserves all parsed fields', () => {
    const result = SkillObjectSchema.parse(validSkillObject);
    expect(result.kind).toBe('SkillObject');
    expect(result.id).toBe('skill.arch-spec');
    expect(result.identity.maturity).toBe('emerging');
    expect(result.dispatch.mode).toBe('local');
    expect(result.lifecycle?.currentStage).toBe('capture');
    expect(result.telemetry?.track).toHaveLength(3);
  });
});
