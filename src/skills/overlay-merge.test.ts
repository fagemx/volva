import { describe, it, expect } from 'vitest';
import type { SkillObject } from '../schemas/skill-object';
import { mergeSkillObject, OverlayScopeError } from './overlay-merge';

// ─── Test fixture ───

function makeBaseSkillObject(): SkillObject {
  return {
    kind: 'SkillObject',
    apiVersion: 'v0',
    id: 'skill.test',
    name: 'Test Skill',
    version: '1.0.0',
    status: 'draft',
    identity: {
      summary: 'A test skill',
      owners: { human: ['alice'], agent: ['volva'] },
      domain: 'testing',
      tags: ['test'],
      maturity: 'emerging',
      riskTier: 'low',
    },
    purpose: {
      problemShapes: ['test problem'],
      desiredOutcomes: ['test outcome'],
      nonGoals: [],
      notFor: [],
    },
    routing: {
      description: 'test routing',
      triggerWhen: ['test trigger'],
      doNotTriggerWhen: [],
      priority: 50,
      conflictsWith: [],
      mayChainTo: [],
    },
    contract: {
      inputs: { required: [], optional: [] },
      outputs: { primary: [], secondary: [] },
      successCriteria: ['passes'],
      failureModes: [],
    },
    package: {
      root: 'skills/test',
      entryFile: 'SKILL.md',
      references: [],
      scripts: [],
      assets: [],
      config: { schemaFile: 'schema.json', dataFile: 'data.json' },
      hooks: [],
      localState: { enabled: false, stablePath: '.state', files: [] },
    },
    environment: {
      toolsRequired: ['bash'],
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
      targetSelection: { repoPolicy: 'current', runtimeOptions: [] },
      workerClass: [],
      handoff: { inputArtifacts: [], outputArtifacts: [] },
      executionPolicy: {
        sync: true,
        retries: 0,
        timeoutMinutes: 10,
        escalationOnFailure: false,
      },
      approval: {
        requireHumanBeforeDispatch: false,
        requireHumanBeforeMerge: false,
      },
    },
    verification: {
      smokeChecks: [],
      assertions: [],
      humanCheckpoints: [],
      outcomeSignals: [],
    },
    memory: {
      localMemoryPolicy: { canStore: [], cannotStore: [] },
      precedentWriteback: { enabled: false, target: 'edda', when: [] },
    },
    governance: {
      mutability: {
        agentMayEdit: [],
        agentMayPropose: [],
        humanApprovalRequired: [],
        forbiddenWithoutHuman: [],
      },
      reviewPolicy: { requiredReviewers: [] },
      promotionGates: [],
      rollbackPolicy: { allowed: false, rollbackOn: [] },
      supersession: { supersedes: [], supersededBy: null },
    },
  };
}

// ─── Tests ───

describe('mergeSkillObject', () => {
  // --- Normal merge: dispatch overlay ---
  it('merges dispatch overlay modifying dispatch.timeout', () => {
    const base = makeBaseSkillObject();
    const dispatchOverlay = {
      dispatch: {
        executionPolicy: {
          sync: true,
          retries: 3,
          timeoutMinutes: 30,
          escalationOnFailure: true,
        },
      },
    };

    const result = mergeSkillObject(base, dispatchOverlay);

    expect(result.dispatch.executionPolicy.timeoutMinutes).toBe(30);
    expect(result.dispatch.executionPolicy.retries).toBe(3);
    expect(result.dispatch.executionPolicy.escalationOnFailure).toBe(true);
  });

  // --- Normal merge: runtime overlay modifying environment ---
  it('merges runtime overlay modifying environment.toolsRequired', () => {
    const base = makeBaseSkillObject();
    const runtimeOverlay = {
      environment: {
        toolsRequired: ['bash', 'git', 'npm'],
      },
    };

    const result = mergeSkillObject(base, undefined, runtimeOverlay);

    expect(result.environment.toolsRequired).toEqual([
      'bash',
      'git',
      'npm',
    ]);
  });

  // --- Scope rejection (top-level): dispatch overlay with purpose.summary ---
  it('throws OverlayScopeError when dispatch overlay sets purpose.summary', () => {
    const base = makeBaseSkillObject();
    const dispatchOverlay = {
      purpose: { summary: 'hacked summary' },
    };

    expect(() =>
      mergeSkillObject(base, dispatchOverlay),
    ).toThrow(OverlayScopeError);

    try {
      mergeSkillObject(base, dispatchOverlay);
    } catch (e) {
      const err = e as OverlayScopeError;
      expect(err.overlayType).toBe('dispatch');
      expect(err.invalidFields).toContain('purpose.summary');
    }
  });

  // --- Scope rejection (nested): dispatch overlay with routing.triggerWhen ---
  it('throws OverlayScopeError when dispatch overlay sets routing.triggerWhen', () => {
    const base = makeBaseSkillObject();
    const dispatchOverlay = {
      routing: { triggerWhen: ['new trigger'] },
    };

    expect(() =>
      mergeSkillObject(base, dispatchOverlay),
    ).toThrow(OverlayScopeError);

    try {
      mergeSkillObject(base, dispatchOverlay);
    } catch (e) {
      const err = e as OverlayScopeError;
      expect(err.overlayType).toBe('dispatch');
      expect(err.invalidFields).toContain('routing.triggerWhen');
    }
  });

  // --- Scope rejection: runtime overlay with dispatch.mode ---
  it('throws OverlayScopeError when runtime overlay sets dispatch.mode', () => {
    const base = makeBaseSkillObject();
    const runtimeOverlay = {
      dispatch: { mode: 'karvi' },
    };

    expect(() =>
      mergeSkillObject(base, undefined, runtimeOverlay),
    ).toThrow(OverlayScopeError);

    try {
      mergeSkillObject(base, undefined, runtimeOverlay);
    } catch (e) {
      const err = e as OverlayScopeError;
      expect(err.overlayType).toBe('runtime');
      expect(err.invalidFields).toContain('dispatch.mode');
    }
  });

  // --- Runtime overlay modifying governance.mutability → success ---
  it('allows runtime overlay to modify governance.mutability', () => {
    const base = makeBaseSkillObject();
    const runtimeOverlay = {
      governance: {
        mutability: {
          agentMayEdit: ['routing.priority'],
          agentMayPropose: ['purpose.nonGoals'],
          humanApprovalRequired: ['contract.inputs'],
          forbiddenWithoutHuman: ['identity.owners'],
        },
      },
    };

    const result = mergeSkillObject(base, undefined, runtimeOverlay);

    expect(result.governance.mutability.agentMayEdit).toEqual([
      'routing.priority',
    ]);
    expect(result.governance.mutability.agentMayPropose).toEqual([
      'purpose.nonGoals',
    ]);
    // Other governance fields unchanged
    expect(result.governance.reviewPolicy.requiredReviewers).toEqual([]);
    expect(result.governance.promotionGates).toEqual([]);
  });

  // --- Runtime overlay modifying governance.reviewPolicy → rejected ---
  it('throws OverlayScopeError when runtime overlay sets governance.reviewPolicy', () => {
    const base = makeBaseSkillObject();
    const runtimeOverlay = {
      governance: {
        reviewPolicy: { requiredReviewers: ['eve'] },
      },
    };

    expect(() =>
      mergeSkillObject(base, undefined, runtimeOverlay),
    ).toThrow(OverlayScopeError);

    try {
      mergeSkillObject(base, undefined, runtimeOverlay);
    } catch (e) {
      const err = e as OverlayScopeError;
      expect(err.overlayType).toBe('runtime');
      expect(err.invalidFields).toContain(
        'governance.reviewPolicy.requiredReviewers',
      );
    }
  });

  // --- Partial overlays ---
  it('handles only dispatch overlay (no runtime)', () => {
    const base = makeBaseSkillObject();
    const dispatchOverlay = {
      dispatch: { mode: 'karvi' as const },
    };

    const result = mergeSkillObject(base, dispatchOverlay);

    expect(result.dispatch.mode).toBe('karvi');
    // Other sections unchanged
    expect(result.environment).toEqual(base.environment);
    expect(result.verification).toEqual(base.verification);
  });

  it('handles only runtime overlay (no dispatch)', () => {
    const base = makeBaseSkillObject();
    const runtimeOverlay = {
      verification: {
        smokeChecks: ['has-boundaries'],
        assertions: ['output-valid'],
      },
    };

    const result = mergeSkillObject(base, undefined, runtimeOverlay);

    expect(result.verification.smokeChecks).toEqual(['has-boundaries']);
    expect(result.verification.assertions).toEqual(['output-valid']);
    // Dispatch unchanged
    expect(result.dispatch).toEqual(base.dispatch);
  });

  it('handles both dispatch and runtime overlays', () => {
    const base = makeBaseSkillObject();
    const dispatchOverlay = {
      dispatch: { mode: 'hybrid' as const },
    };
    const runtimeOverlay = {
      environment: { executionMode: 'assistive' as const },
    };

    const result = mergeSkillObject(
      base,
      dispatchOverlay,
      runtimeOverlay,
    );

    expect(result.dispatch.mode).toBe('hybrid');
    expect(result.environment.executionMode).toBe('assistive');
  });

  // --- No overlay: returns base unchanged ---
  it('returns base unchanged when no overlays provided', () => {
    const base = makeBaseSkillObject();

    const result = mergeSkillObject(base);

    expect(result).toEqual(base);
    // Verify it is a clone, not the same reference
    expect(result).not.toBe(base);
  });
});
