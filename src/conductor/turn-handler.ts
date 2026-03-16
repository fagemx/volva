import type { LLMClient } from '../llm/client';
import type { CardManager } from '../cards/card-manager';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import { checkTransition, type Phase } from './state-machine';
import { pickStrategy } from './rhythm';
import type { WorldCard, WorkflowCard, TaskCard, PipelineCard, AdapterCard, CommerceCard, OrgCard, AnyCard, CardType, CardDiff } from '../schemas/card';
import { LlmPresetEnum, PlatformEnum, OfferingTypeEnum } from '../schemas/card';
import type { Intent } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';
import type { ConversationMode } from '../schemas/conversation';
import type { SkillData } from '../thyra-client/schemas';

export interface TurnResult {
  reply: string;
  intent: Intent;
  phase: Phase;
  phaseChanged: boolean;
  strategy: Strategy;
  cardVersion: number;
  detectedMode?: ConversationMode;
  nomodStreak: number;
}

export function isDiffEmpty(diff: CardDiff): boolean {
  return diff.added.length === 0
    && diff.removed.length === 0
    && diff.changed.filter(k => k !== 'version').length === 0;
}

// ─── Empty Card Factories ───

export function createEmptyWorldCard(): WorldCard {
  return {
    goal: null,
    target_repo: null,
    confirmed: { hard_rules: [], soft_rules: [], must_have: [], success_criteria: [], evaluator_rules: [] },
    pending: [],
    chief_draft: null,
    budget_draft: null,
    llm_preset: null,
    current_proposal: null,
    version: 1,
  };
}

export function createEmptyWorkflowCard(): WorkflowCard {
  return {
    name: null,
    purpose: null,
    steps: [],
    confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
    pending: [],
    version: 1,
  };
}

export function createEmptyTaskCard(): TaskCard {
  return {
    intent: '',
    inputs: {},
    constraints: [],
    success_condition: null,
    version: 1,
  };
}

export function createEmptyPipelineCard(): PipelineCard {
  return {
    name: null,
    steps: [],
    schedule: null,
    proposed_skills: [],
    pending: [],
    version: 1,
  };
}

export function createEmptyAdapterCard(): AdapterCard {
  return {
    platforms: [],
    version: 1,
  };
}

export function createEmptyCommerceCard(): CommerceCard {
  return {
    offerings: [],
    pricing_rules: [],
    pending: [],
    version: 1,
  };
}

export function createEmptyOrgCard(): OrgCard {
  return {
    director: null,
    departments: [],
    governance: { cycle: null, chief_order: [], escalation: null },
    pending: [],
    version: 1,
  };
}

// ─── Mode / CardType Mapping ───

export function modeToCardType(mode: ConversationMode): CardType {
  switch (mode) {
    case 'world_design':
      return 'world';
    case 'workflow_design':
      return 'workflow';
    case 'task':
      return 'task';
    case 'pipeline_design':
      return 'pipeline';
    case 'adapter_config':
      return 'adapter';
    case 'commerce_design':
      return 'commerce';
    case 'org_design':
      return 'org';
  }
}

export function createEmptyCard(mode: ConversationMode): AnyCard {
  switch (mode) {
    case 'world_design':
      return createEmptyWorldCard();
    case 'workflow_design':
      return createEmptyWorkflowCard();
    case 'task':
      return createEmptyTaskCard();
    case 'pipeline_design':
      return createEmptyPipelineCard();
    case 'adapter_config':
      return createEmptyAdapterCard();
    case 'commerce_design':
      return createEmptyCommerceCard();
    case 'org_design':
      return createEmptyOrgCard();
  }
}

// ─── Evaluator Rule Helper ───

function toRisk(value: string): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'medium';
}

function toAction(value: string): 'warn' | 'require_human_approval' | 'reject' {
  if (value === 'warn' || value === 'require_human_approval' || value === 'reject') return value;
  return 'warn';
}

function applyAddEvaluatorRule(updated: WorldCard, intent: Intent): void {
  if (!intent.entities) return;
  const e = intent.entities;
  updated.confirmed.evaluator_rules.push({
    name: e.name || intent.summary,
    trigger: e.trigger || '',
    condition: e.condition || '',
    on_fail: {
      risk: toRisk(e.risk),
      action: toAction(e.action),
    },
  });
}

// ─── Modify Rule Helper ───

function applyModifyRule(updated: WorldCard, intent: Intent): void {
  if (!intent.entities?.target_rule) return;

  const targetRule = intent.entities.target_rule;

  for (const rule of updated.confirmed.hard_rules) {
    if (rule.description.includes(targetRule)) {
      rule.description = `[changed] ${intent.summary}`;
      return;
    }
  }

  for (const rule of updated.confirmed.soft_rules) {
    if (rule.description.includes(targetRule)) {
      rule.description = `[changed] ${intent.summary}`;
      return;
    }
  }

  for (const rule of updated.confirmed.evaluator_rules) {
    if (rule.name.includes(targetRule)) {
      rule.name = `[changed] ${intent.summary}`;
      return;
    }
  }

  updated.confirmed.soft_rules.push({ description: `[new] ${intent.summary}`, scope: ['*'] });
}

// ─── Intent Apply Functions ───

export function applyIntentToCard(card: WorldCard, intent: Intent): WorldCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) updated.goal = intent.summary;
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [key, value] of Object.entries(intent.entities)) {
          if (key === 'llm_preset' && LlmPresetEnum.safeParse(value).success) {
            updated.llm_preset = value as 'economy' | 'balanced' | 'performance';
            continue;
          }
          if (!updated.confirmed.must_have.includes(value)) {
            updated.confirmed.must_have.push(value);
          }
        }
      }
      break;
    case 'set_boundary':
      if (intent.enforcement === 'hard') {
        updated.confirmed.hard_rules.push({ description: intent.summary, scope: ['*'] });
      } else {
        updated.confirmed.soft_rules.push({ description: intent.summary, scope: ['*'] });
      }
      break;
    case 'add_constraint':
      updated.confirmed.soft_rules.push({ description: intent.summary, scope: ['*'] });
      break;
    case 'add_evaluator_rule':
      applyAddEvaluatorRule(updated, intent);
      break;
    case 'style_preference':
      if (!updated.chief_draft) {
        updated.chief_draft = { name: null, role: null, style: null };
      }
      updated.chief_draft.style = intent.summary;
      break;
    case 'modify':
      applyModifyRule(updated, intent);
      break;
    case 'confirm':
    case 'settle_signal':
    case 'question':
    case 'off_topic':
      break;
  }

  return updated;
}

export function applyIntentToWorkflowCard(card: WorkflowCard, intent: Intent): WorkflowCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) {
        updated.name = intent.summary;
        updated.purpose = intent.summary;
      }
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [, value] of Object.entries(intent.entities)) {
          updated.steps.push({
            order: updated.steps.length,
            description: value,
            skill: null,
            conditions: null,
          });
        }
      }
      break;
    case 'set_boundary':
      if (intent.enforcement === 'hard') {
        updated.confirmed.triggers.push(intent.summary);
      } else {
        updated.confirmed.exit_conditions.push(intent.summary);
      }
      break;
    case 'add_constraint':
      updated.confirmed.failure_handling.push(intent.summary);
      break;
    case 'add_evaluator_rule':
    case 'confirm':
    case 'settle_signal':
    case 'modify':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

export function applyIntentToTaskCard(card: TaskCard, intent: Intent): TaskCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) updated.intent = intent.summary;
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [key, value] of Object.entries(intent.entities)) {
          updated.inputs[key] = value;
        }
      }
      break;
    case 'set_boundary':
    case 'add_constraint':
      updated.constraints.push(intent.summary);
      break;
    case 'add_evaluator_rule':
    case 'confirm':
    case 'settle_signal':
    case 'modify':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

function makePipelineStep(
  order: number,
  type: 'skill' | 'gate' | 'branch',
  label: string,
  overrides?: Partial<PipelineCard['steps'][number]>,
): PipelineCard['steps'][number] {
  return {
    order,
    type,
    label,
    skill_name: null,
    instruction: null,
    revision_target: null,
    max_revision_cycles: null,
    condition: null,
    on_true: null,
    on_false: null,
    ...overrides,
  };
}

function applyPipelineBoundary(updated: PipelineCard, intent: Intent): void {
  if (intent.enforcement === 'hard') {
    updated.steps.push(
      makePipelineStep(updated.steps.length, 'gate', intent.summary, { condition: intent.summary }),
    );
    return;
  }
  const targetStep = intent.entities?.target_step;
  if (!targetStep) return;
  for (const step of updated.steps) {
    if (step.label.includes(targetStep)) {
      step.revision_target = intent.summary;
      step.max_revision_cycles = 3;
      break;
    }
  }
}

function applyPipelineModify(updated: PipelineCard, intent: Intent): void {
  if (!intent.entities?.remove_step) return;
  const removeLabel = intent.entities.remove_step;
  updated.steps = updated.steps.filter((s) => !s.label.includes(removeLabel));
  for (let i = 0; i < updated.steps.length; i++) {
    updated.steps[i].order = i;
  }
}

export function applyIntentToPipelineCard(card: PipelineCard, intent: Intent): PipelineCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      if (intent.summary) updated.name = intent.summary;
      break;
    case 'add_info':
      if (intent.entities) {
        for (const [, value] of Object.entries(intent.entities)) {
          updated.steps.push(
            makePipelineStep(updated.steps.length, 'skill', value, { skill_name: value }),
          );
        }
      }
      break;
    case 'set_boundary':
      applyPipelineBoundary(updated, intent);
      break;
    case 'add_constraint':
      updated.steps.push(
        makePipelineStep(updated.steps.length, 'branch', intent.summary, {
          condition: intent.summary,
          on_true: intent.entities?.on_true ?? null,
          on_false: intent.entities?.on_false ?? null,
        }),
      );
      break;
    case 'modify':
      applyPipelineModify(updated, intent);
      break;
    case 'confirm':
    case 'settle_signal':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

function applyAdapterNewIntent(updated: AdapterCard, summary: string): void {
  const words = summary.toLowerCase().split(/[\s,]+/);
  for (const word of words) {
    if (PlatformEnum.safeParse(word).success) {
      const platform = word as AdapterCard['platforms'][number]['platform'];
      if (!updated.platforms.some((p) => p.platform === platform)) {
        updated.platforms.push({ platform, enabled: true, role: '' });
      }
    }
  }
}

function applyAdapterAddInfo(updated: AdapterCard, entities: Record<string, string>): void {
  for (const [key, value] of Object.entries(entities)) {
    const existing = updated.platforms.find((p) => p.platform === key);
    if (existing) {
      existing.role = value;
    }
  }
}

function applyAdapterBoundary(updated: AdapterCard, intent: Intent): void {
  if (!intent.entities) return;
  const target = intent.entities.platform;
  if (!target) return;
  const existing = updated.platforms.find((p) => p.platform === target);
  if (existing) {
    existing.role = intent.summary;
  }
}

export function applyIntentToAdapterCard(card: AdapterCard, intent: Intent): AdapterCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      applyAdapterNewIntent(updated, intent.summary);
      break;
    case 'add_info':
      if (intent.entities) applyAdapterAddInfo(updated, intent.entities);
      break;
    case 'set_boundary':
      applyAdapterBoundary(updated, intent);
      break;
    case 'add_constraint':
    case 'add_evaluator_rule':
    case 'confirm':
    case 'settle_signal':
    case 'modify':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

function resolveOfferingType(value: string | undefined): CommerceCard['offerings'][number]['type'] {
  if (value && OfferingTypeEnum.safeParse(value).success) {
    return value as CommerceCard['offerings'][number]['type'];
  }
  return 'stall_slot';
}

function makeOffering(
  name: string,
  description: string,
  type: CommerceCard['offerings'][number]['type'] = 'stall_slot',
): CommerceCard['offerings'][number] {
  return { type, name, description, base_price: null, capacity: null, duration: null };
}

function makePricingRule(name: string, condition: string): CommerceCard['pricing_rules'][number] {
  return { name, condition, adjustment_pct: 0 };
}

function applyCommerceAddInfo(updated: CommerceCard, entities: Record<string, string>): void {
  const offeringType = resolveOfferingType(entities.offering_type);
  for (const [key, value] of Object.entries(entities)) {
    updated.offerings.push(makeOffering(key, value, offeringType));
  }
}

function applyCommerceModify(updated: CommerceCard, intent: Intent): void {
  const target = intent.entities?.target_name;
  if (!target) return;
  for (const offering of updated.offerings) {
    if (offering.name.includes(target)) {
      offering.description = intent.summary;
      return;
    }
  }
  for (const rule of updated.pricing_rules) {
    if (rule.name.includes(target)) {
      rule.condition = intent.summary;
      return;
    }
  }
}

export function applyIntentToCommerceCard(card: CommerceCard, intent: Intent): CommerceCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      updated.offerings.push(makeOffering(intent.summary, intent.summary));
      break;
    case 'add_info':
      if (intent.entities) applyCommerceAddInfo(updated, intent.entities);
      break;
    case 'set_boundary':
    case 'add_constraint':
      updated.pricing_rules.push(makePricingRule(intent.summary, intent.summary));
      break;
    case 'modify':
      applyCommerceModify(updated, intent);
      break;
    case 'add_evaluator_rule':
    case 'confirm':
    case 'settle_signal':
    case 'question':
    case 'off_topic':
    case 'style_preference':
      break;
  }

  return updated;
}

function applyOrgNewIntent(updated: OrgCard, summary: string): void {
  if (!updated.director) {
    updated.director = { name: null, role: null, style: null };
  }
  updated.director.name = summary;
  updated.director.role = summary;
}

function applyOrgAddInfo(updated: OrgCard, entities: Record<string, string>): void {
  for (const [key, value] of Object.entries(entities)) {
    const existing = updated.departments.find((d) => d.name === key);
    if (existing) {
      if (!existing.workers.includes(value)) {
        existing.workers.push(value);
      }
    } else {
      updated.departments.push({ name: key, chief: null, workers: [value], pipeline_refs: [] });
    }
  }
}

function applyOrgBoundary(updated: OrgCard, intent: Intent): void {
  if (intent.enforcement === 'hard') {
    updated.governance.cycle = intent.summary;
    if (intent.entities?.chief_order) {
      updated.governance.chief_order.push(intent.entities.chief_order);
    }
  } else {
    updated.governance.escalation = intent.summary;
  }
}

function applyOrgModify(updated: OrgCard, intent: Intent): void {
  const target = intent.entities?.target_department;
  if (!target) return;
  for (const dept of updated.departments) {
    if (dept.name.includes(target)) {
      dept.chief = intent.summary;
      return;
    }
  }
}

export function applyIntentToOrgCard(card: OrgCard, intent: Intent): OrgCard {
  const updated = structuredClone(card);

  switch (intent.type) {
    case 'new_intent':
      applyOrgNewIntent(updated, intent.summary);
      break;
    case 'add_info':
      if (intent.entities) applyOrgAddInfo(updated, intent.entities);
      break;
    case 'set_boundary':
      applyOrgBoundary(updated, intent);
      break;
    case 'add_constraint':
      updated.governance.chief_order.push(intent.summary);
      break;
    case 'style_preference':
      if (!updated.director) {
        updated.director = { name: null, role: null, style: null };
      }
      updated.director.style = intent.summary;
      break;
    case 'modify':
      applyOrgModify(updated, intent);
      break;
    case 'add_evaluator_rule':
    case 'confirm':
    case 'settle_signal':
    case 'question':
    case 'off_topic':
      break;
  }

  return updated;
}

export function applyIntent(cardType: CardType, card: AnyCard, intent: Intent): AnyCard {
  switch (cardType) {
    case 'world':
      return applyIntentToCard(card as WorldCard, intent);
    case 'workflow':
      return applyIntentToWorkflowCard(card as WorkflowCard, intent);
    case 'task':
      return applyIntentToTaskCard(card as TaskCard, intent);
    case 'pipeline':
      return applyIntentToPipelineCard(card as PipelineCard, intent);
    case 'adapter':
      return applyIntentToAdapterCard(card as AdapterCard, intent);
    case 'commerce':
      return applyIntentToCommerceCard(card as CommerceCard, intent);
    case 'org':
      return applyIntentToOrgCard(card as OrgCard, intent);
  }
}

// ─── hasPending Helper ───

function cardHasPending(cardType: CardType, card: AnyCard): boolean {
  switch (cardType) {
    case 'world':
      return (card as WorldCard).pending.length > 0;
    case 'workflow':
      return (card as WorkflowCard).pending.length > 0;
    case 'task':
      return false;
    case 'pipeline':
      return (card as PipelineCard).pending.length > 0;
    case 'adapter':
      return false;
    case 'commerce':
      return (card as CommerceCard).pending.length > 0;
    case 'org':
      return (card as OrgCard).pending.length > 0;
  }
}

// ─── handleTurn ───

export async function handleTurn(
  llm: LLMClient,
  cardManager: CardManager,
  conversationId: string,
  userMessage: string,
  currentPhase: Phase,
  mode: ConversationMode = 'world_design',
  nomodStreak = 0,
  availableSkills?: SkillData[],
): Promise<TurnResult> {
  const currentCard = cardManager.getLatest(conversationId);
  const isFirstTurn = !currentCard;
  const cardContent = currentCard ? currentCard.content : createEmptyCard(mode);
  const cardSnapshot = JSON.stringify(cardContent, null, 2);

  // LLM #1: parse intent
  const intent = await parseIntent(llm, userMessage, cardSnapshot);

  // Auto-detect mode on first turn if LLM returned detected_mode
  let effectiveMode = mode;
  let detectedMode: ConversationMode | undefined;
  if (isFirstTurn && intent.detected_mode) {
    effectiveMode = intent.detected_mode;
    detectedMode = intent.detected_mode;
  }

  const cardType = modeToCardType(effectiveMode);
  const effectiveCardContent = isFirstTurn ? createEmptyCard(effectiveMode) : cardContent;

  // Update card content based on intent
  const updatedContent = applyIntent(cardType, effectiveCardContent, intent);

  // Persist card and compute diff-based nomod streak
  let cardVersion: number;
  let newNomodStreak: number;
  if (currentCard) {
    const { card, diff } = cardManager.update(currentCard.id, updatedContent);
    cardVersion = card.version;
    newNomodStreak = isDiffEmpty(diff) ? nomodStreak + 1 : 0;
  } else {
    const card = cardManager.create(conversationId, cardType, updatedContent);
    cardVersion = card.version;
    newNomodStreak = 0;
  }

  // Check state transition
  const transition = checkTransition(currentPhase, cardType, updatedContent, intent.type, newNomodStreak);

  // Pick reply strategy
  const hasPending = cardHasPending(cardType, updatedContent);
  const strategy = pickStrategy(transition.newPhase, intent.type, hasPending, effectiveMode);

  // LLM #2: generate reply
  const reply = await generateReply(llm, strategy, JSON.stringify(updatedContent, null, 2), userMessage, availableSkills);

  return {
    reply,
    intent,
    phase: transition.newPhase,
    phaseChanged: transition.reason !== null,
    strategy,
    cardVersion,
    ...(detectedMode !== undefined && { detectedMode }),
    nomodStreak: newNomodStreak,
  };
}
