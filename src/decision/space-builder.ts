import { z } from 'zod';
import type { LLMClient } from '../llm/client';
import type { IntentRoute, PathCheckResult, RealizationCandidate } from '../schemas/decision';
import { RealizationCandidateSchema } from '../schemas/decision';

// ─── Internal Types ───

type SpaceBuilderContext = {
  userMessage: string;
  edgeProfile?: string[];
  constraints?: string[];
  additionalContext?: Record<string, unknown>;
};

// ─── Canonical Constants ───

export const ECONOMIC_VEHICLES = [
  'done_for_you_service',
  'done_with_you_install',
  'workflow_audit',
  'productized_service',
  'template_pack',
  'tool',
  'operator_model',
] as const;

export const GOVERNANCE_WORLD_FORMS = [
  'market',
  'commons',
  'town',
  'port',
  'night_engine',
  'managed_knowledge_field',
] as const;

// ─── System Prompt ───

const SPACE_BUILDER_SYSTEM_PROMPT = `You are the Space Builder in the Volva decision pipeline.

TASK: Given a classified intent (regime + signals + key unknowns) and path check results,
generate an array of RealizationCandidate objects — concrete realization spaces worth probing.

You are NOT generating ideas or brainstorming. You are generating structured candidates
with clear form, rationale, assumptions, and probe readiness hints.

─── REGIME-SPECIFIC GUIDANCE ───

ECONOMIC REGIME:
Generate domain × vehicle combinations. The 7 canonical vehicles are:
- done_for_you_service: Full execution for client
- done_with_you_install: Setup + handoff
- workflow_audit: Review + optimize existing workflow
- productized_service: Packaged repeatable service
- template_pack: Reusable templates/assets
- tool: Software tool or utility
- operator_model: Ongoing operation on behalf of client

Cross the user's domain signals with these vehicles. Each candidate should have
both "domain" and "vehicle" fields populated.

CAPABILITY REGIME:
Generate learning path / practice structure candidates.
Focus on form types: learning_path, practice_loop, workflow_pack.

LEVERAGE REGIME:
Generate bottleneck × automation target candidates.
Focus on form types: workflow_pack, tool, operator_model.

EXPRESSION REGIME:
Generate medium × format candidates.
Focus on form types: medium, community_format, workflow_pack.

GOVERNANCE REGIME:
Generate world form candidates from the 6 canonical world forms:
- market: Exchange-driven place
- commons: Shared resource space
- town: Community governance space
- port: Connection/transit hub
- night_engine: Automated operation space
- managed_knowledge_field: Curated knowledge space

Each candidate MUST have the "worldForm" field populated.
Focus on form type: world.

IDENTITY REGIME:
Generate staged path candidates.
Focus on form types: learning_path, service, operator_model.

─── CANDIDATE STRUCTURE ───

Each candidate must have:
- id: A unique identifier (use a descriptive slug like "video-gen-done-for-you")
- regime: The primary regime from the intent route
- form: One of: service, productized_service, tool, workflow_pack, learning_path, practice_loop, medium, world, operator_model, community_format
- domain: (optional) The domain area
- vehicle: (optional) The vehicle type (mainly for economic)
- worldForm: (optional, required for governance) One of: market, commons, town, port, night_engine, managed_knowledge_field
- description: Clear one-sentence description
- whyThisCandidate: Array of reasons this candidate fits this person/context
- assumptions: Array of assumptions that must hold for this to work
- probeReadinessHints: Array of hints about what probe could validate this
- timeToSignal: "short" | "medium" | "long" — how quickly you can get signal
- notes: Array of additional notes

─── RULES ───

- Generate 3-6 candidates (not too few, not too many)
- Each candidate must have clear whyThisCandidate (not generic)
- Each candidate must have testable assumptions
- probeReadinessHints should suggest concrete next steps
- Do NOT generate candidates that are just topic labels
- Do NOT generate candidates without clear form

Respond with a JSON array of candidates.`;

// ─── User Prompt Builder ───

function buildUserPrompt(
  intentRoute: IntentRoute,
  pathCheck: PathCheckResult,
  context: SpaceBuilderContext,
): string {
  const sections: string[] = [];

  sections.push(`## Regime: ${intentRoute.primaryRegime}`);

  if (intentRoute.secondaryRegimes && intentRoute.secondaryRegimes.length > 0) {
    sections.push(`## Secondary Regimes: ${intentRoute.secondaryRegimes.join(', ')}`);
  }

  sections.push(`## Signals\n${intentRoute.signals.map((s) => `- ${s}`).join('\n')}`);
  sections.push(`## Key Unknowns\n${intentRoute.keyUnknowns.map((k) => `- ${k}`).join('\n')}`);

  if (pathCheck.fixedElements.length > 0) {
    sections.push(
      `## Fixed Elements\n${pathCheck.fixedElements.map((e) => `- ${e.kind}: ${e.value}`).join('\n')}`,
    );
  }

  if (pathCheck.unresolvedElements.length > 0) {
    sections.push(
      `## Unresolved Elements\n${pathCheck.unresolvedElements.map((e) => `- ${e.kind} (${e.reason})`).join('\n')}`,
    );
  }

  sections.push(`## User Message\n${context.userMessage}`);

  if (context.edgeProfile && context.edgeProfile.length > 0) {
    sections.push(
      `## Edge Profile (Person Asymmetry)\n${context.edgeProfile.map((e) => `- ${e}`).join('\n')}`,
    );
  }

  if (context.constraints && context.constraints.length > 0) {
    sections.push(
      `## Constraints\n${context.constraints.map((c) => `- ${c}`).join('\n')}`,
    );
  }

  // Add regime-specific guidance to user prompt
  if (intentRoute.primaryRegime === 'economic') {
    sections.push(
      `## Available Vehicles\n${ECONOMIC_VEHICLES.map((v) => `- ${v}`).join('\n')}`,
    );
  } else if (intentRoute.primaryRegime === 'governance') {
    sections.push(
      `## Available World Forms\n${GOVERNANCE_WORLD_FORMS.map((w) => `- ${w}`).join('\n')}`,
    );
  }

  return sections.join('\n\n');
}

// ─── Public API ───

export async function buildSpace(
  llm: LLMClient,
  intentRoute: IntentRoute,
  pathCheck: PathCheckResult,
  context: SpaceBuilderContext,
): Promise<RealizationCandidate[]> {
  try {
    const result = await llm.generateStructured({
      system: SPACE_BUILDER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(intentRoute, pathCheck, context),
        },
      ],
      schema: z.array(RealizationCandidateSchema),
      schemaDescription:
        'Array of RealizationCandidate objects, each with id, regime, form, description, whyThisCandidate (string[]), assumptions (string[]), probeReadinessHints (string[]), timeToSignal, notes (string[]). Optional: domain, vehicle, worldForm.',
      maxTokens: 4000,
    });

    if (!result.ok) {
      console.warn('[space-builder] LLM validation failed:', result.error);
      return [];
    }

    return result.data;
  } catch (error) {
    console.error(
      '[space-builder] LLM call failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return [];
  }
}
