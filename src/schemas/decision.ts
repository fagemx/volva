import { z } from 'zod';
import type { SkillStatus } from './skill-object';

// ─── Section 1: Base Types ───

export const RegimeEnum = z.enum([
  'economic', 'capability', 'leverage', 'expression', 'governance', 'identity',
]);
export type Regime = z.infer<typeof RegimeEnum>;

// ─── Section 2: Intent Router ───

export const IntentRouteSchema = z.object({
  primaryRegime: RegimeEnum,
  secondaryRegimes: z.array(RegimeEnum).optional(),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  rationale: z.array(z.string()),
  keyUnknowns: z.array(z.string()),
  suggestedFollowups: z.array(z.string()),
});
export type IntentRoute = z.infer<typeof IntentRouteSchema>;

// ─── Section 3: Path Check ───

const FixedElementKindEnum = z.enum(['intent', 'domain', 'form', 'buyer', 'loop', 'build_target']);

export const FixedElementSchema = z.object({
  kind: FixedElementKindEnum,
  value: z.string(),
});
export type FixedElement = z.infer<typeof FixedElementSchema>;

const UnresolvedElementKindEnum = z.enum(['domain', 'form', 'buyer', 'loop', 'build_target', 'signal']);

export const UnresolvedElementSchema = z.object({
  kind: UnresolvedElementKindEnum,
  reason: z.string(),
  severity: z.enum(['blocking', 'important', 'nice_to_have']),
});
export type UnresolvedElement = z.infer<typeof UnresolvedElementSchema>;

export const PathCheckResultSchema = z.object({
  certainty: z.enum(['low', 'medium', 'high']),
  route: z.enum(['space-builder', 'forge-fast-path', 'space-builder-then-forge']),
  fixedElements: z.array(FixedElementSchema),
  unresolvedElements: z.array(UnresolvedElementSchema),
  whyNotReady: z.array(z.string()).optional(),
  whyReady: z.array(z.string()).optional(),
  recommendedNextStep: z.string(),
});
export type PathCheckResult = z.infer<typeof PathCheckResultSchema>;

// ─── Section 4: Space Builder ───

export const RealizationFormEnum = z.enum([
  'service', 'productized_service', 'tool', 'workflow_pack', 'learning_path',
  'practice_loop', 'medium', 'world', 'operator_model', 'community_format',
]);
export type RealizationForm = z.infer<typeof RealizationFormEnum>;

export const WorldFormEnum = z.enum([
  'market', 'commons', 'town', 'port', 'night_engine', 'managed_knowledge_field',
]);
export type WorldForm = z.infer<typeof WorldFormEnum>;

const TimeToSignalEnum = z.enum(['short', 'medium', 'long']);

export const RealizationCandidateSchema = z.object({
  id: z.string(),
  regime: RegimeEnum,
  form: RealizationFormEnum,
  domain: z.string().optional(),
  vehicle: z.string().optional(),
  worldForm: WorldFormEnum.optional(),
  description: z.string(),
  whyThisCandidate: z.array(z.string()),
  assumptions: z.array(z.string()),
  probeReadinessHints: z.array(z.string()).optional(),
  timeToSignal: TimeToSignalEnum,
  notes: z.array(z.string()),
});
export type RealizationCandidate = z.infer<typeof RealizationCandidateSchema>;

const ThreeLevelEnum = z.enum(['low', 'medium', 'high']);

export const GovernanceWorldCandidateSchema = RealizationCandidateSchema.extend({
  worldForm: WorldFormEnum,
  stateDensity: ThreeLevelEnum,
  changeClarity: ThreeLevelEnum,
  governancePressure: ThreeLevelEnum,
  outcomeVisibility: ThreeLevelEnum,
  cycleability: ThreeLevelEnum,
  likelyMinimumWorldShape: z.array(z.string()),
  mainRisks: z.array(z.string()),
});
export type GovernanceWorldCandidate = z.infer<typeof GovernanceWorldCandidateSchema>;

// ─── Section 5: Probe-Commit ───

export const ProbeableFormSchema = z.object({
  candidateId: z.string(),
  regime: RegimeEnum,
  hypothesis: z.string(),
  testTarget: z.string(),
  judge: z.string(),
  cheapestBelievableProbe: z.string(),
  disconfirmers: z.array(z.string()),
});
export type ProbeableForm = z.infer<typeof ProbeableFormSchema>;

const SignalStrengthEnum = z.enum(['weak', 'moderate', 'strong']);

export const SignalPacketSchema = z.object({
  candidateId: z.string(),
  probeId: z.string(),
  regime: RegimeEnum,
  signalType: z.string(),
  strength: SignalStrengthEnum,
  evidence: z.array(z.string()),
  negativeEvidence: z.array(z.string()).optional(),
  interpretation: z.string(),
  nextQuestions: z.array(z.string()),
});
export type SignalPacket = z.infer<typeof SignalPacketSchema>;

export const EvaluatorInputSchema = z.object({
  candidate: RealizationCandidateSchema,
  probeableForm: ProbeableFormSchema,
  signals: z.array(SignalPacketSchema),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type EvaluatorInput = z.infer<typeof EvaluatorInputSchema>;

const VerdictEnum = z.enum(['commit', 'hold', 'discard']);

export const EvaluatorOutputSchema = z.object({
  verdict: VerdictEnum,
  rationale: z.array(z.string()),
  evidenceUsed: z.array(z.string()),
  unresolvedRisks: z.array(z.string()),
  recommendedNextStep: z.array(z.string()),
  handoffNotes: z.array(z.string()).optional(),
});
export type EvaluatorOutput = z.infer<typeof EvaluatorOutputSchema>;

export const CommitMemoSchema = z.object({
  candidateId: z.string(),
  regime: RegimeEnum,
  verdict: VerdictEnum,
  rationale: z.array(z.string()),
  evidenceUsed: z.array(z.string()),
  unresolvedRisks: z.array(z.string()),
  whatForgeShouldBuild: z.array(z.string()),
  whatForgeMustNotBuild: z.array(z.string()),
  recommendedNextStep: z.array(z.string()),
});
export type CommitMemo = z.infer<typeof CommitMemoSchema>;

export const EconomicCommitMemoSchema = CommitMemoSchema.extend({
  buyerHypothesis: z.string(),
  painHypothesis: z.string(),
  paymentEvidence: z.array(z.string()),
  whyThisVehicleNow: z.array(z.string()),
  nextSignalAfterBuild: z.array(z.string()),
});
export type EconomicCommitMemo = z.infer<typeof EconomicCommitMemoSchema>;

export const GovernanceCommitMemoSchema = CommitMemoSchema.extend({
  selectedWorldForm: WorldFormEnum,
  minimumWorldShape: z.array(z.string()),
  stateDensityAssessment: ThreeLevelEnum,
  governancePressureAssessment: ThreeLevelEnum,
  firstCycleDesign: z.array(z.string()),
  thyraHandoffRequirements: z.array(z.string()),
});
export type GovernanceCommitMemo = z.infer<typeof GovernanceCommitMemoSchema>;

// ─── Section 6: Canonical Cycle (type-only, no Zod for v0) ───

export type WorldMode = 'setup' | 'open' | 'peak' | 'managed' | 'cooldown' | 'closed';
export type CycleMode = 'normal' | 'peak' | 'incident' | 'shutdown';

export type CanonicalVerdict =
  | 'approved' | 'approved_with_constraints' | 'rejected'
  | 'simulation_required' | 'escalated' | 'deferred';

export type ChangeProposalStatus =
  | 'draft' | 'proposed' | 'judged' | 'approved' | 'approved_with_constraints'
  | 'rejected' | 'simulation_required' | 'escalated' | 'deferred'
  | 'applied' | 'cancelled' | 'rolled_back'
  | 'outcome_window_open' | 'outcome_closed' | 'archived';

export type ChangeKindMVP =
  | 'adjust_stall_capacity' | 'adjust_spotlight_weight'
  | 'throttle_entry' | 'pause_event' | 'modify_pricing_rule';

export type ChangeKind = ChangeKindMVP
  | 'resume_event' | 'reassign_zone_priority'
  | 'tighten_safety_threshold' | 'relax_safety_threshold'
  | 'law_patch' | 'chief_permission_patch';

export type OutcomeVerdict = 'beneficial' | 'neutral' | 'harmful' | 'inconclusive';
export type OutcomeRecommendation = 'reinforce' | 'retune' | 'watch' | 'rollback' | 'do_not_repeat';

export type LayerResult = {
  passed: boolean;
  issues: string[];
  verdict: CanonicalVerdict;
};

export type SimulationPlan = {
  mode: 'dry_run' | 'shadow' | 'counterfactual';
  durationMinutes: number;
  watchedMetrics: string[];
};

export type JudgmentReport = {
  id: string;
  proposalId: string;
  cycleId: string;
  layerResults: {
    structural: LayerResult;
    invariants: LayerResult;
    constitution: LayerResult;
    contextual: LayerResult;
  };
  finalVerdict: CanonicalVerdict;
  finalRiskClass: 'low' | 'medium' | 'high';
  constraints?: string[];
  simulationPlan?: SimulationPlan;
  escalationTarget?: string;
  rollbackRequirements: string[];
  rationale: string;
  createdAt: string;
};

export type Concern = {
  kind: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  targetId?: string;
  summary: string;
};

export type PulseFrame = {
  id: string;
  worldId: string;
  cycleId?: string;
  healthScore: number;
  mode: WorldMode;
  stability: 'stable' | 'unstable' | 'critical';
  dominantConcerns: Concern[];
  metrics: Record<string, number>;
  timestamp: string;
};

export type ExpectedEffectResult = {
  metric: string;
  baseline: number;
  observed: number;
  delta: number;
  matched: boolean;
};

export type SideEffectResult = {
  metric: string;
  baseline: number;
  observed: number;
  delta: number;
  severity: 'negligible' | 'minor' | 'significant';
};

export type OutcomeReport = {
  id: string;
  appliedChangeId: string;
  outcomeWindowId: string;
  primaryObjectiveMet: boolean;
  expectedEffects: ExpectedEffectResult[];
  sideEffects: SideEffectResult[];
  verdict: OutcomeVerdict;
  recommendation: OutcomeRecommendation;
  notes: string[];
  createdAt: string;
};

export type PrecedentRecord = {
  id: string;
  worldId: string;
  worldType: string;
  proposalId: string;
  changeKind: ChangeKind;
  cycleId: string;
  context: string;
  decision: string;
  outcome: OutcomeVerdict;
  recommendation: OutcomeRecommendation;
  lessonsLearned: string[];
  contextTags: string[];
  createdAt: string;
};

export type GovernanceAdjustment = {
  id: string;
  worldId: string;
  triggeredBy: string;
  adjustmentType: 'law_threshold' | 'chief_permission' | 'chief_style' | 'risk_policy' | 'simulation_policy';
  target: string;
  before: string;
  after: string;
  rationale: string;
  status: 'proposed' | 'approved' | 'applied' | 'rejected';
  createdAt: string;
};

// ─── Section 7: Dispatch Admission ───

export const DispatchAdmissionResultSchema = z.object({
  admitted: z.boolean(),
  reason: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  policyOverrides: z.object({
    timeoutMinutes: z.number().optional(),
    runtimeOptions: z.array(z.string()).optional(),
  }).optional(),
});
export type DispatchAdmissionResult = z.infer<typeof DispatchAdmissionResultSchema>;

export type AdmissionContext = {
  sessionId: string;
  userId?: string;
  skillId: string;
  skillName: string;
  skillStatus: SkillStatus;
  executionMode: 'advisory' | 'assistive' | 'active' | 'destructive';
  externalSideEffects: boolean;
  timeoutMinutes: number;
  userConfirmedDestructive?: boolean;
  budgetLimit?: number;
};
