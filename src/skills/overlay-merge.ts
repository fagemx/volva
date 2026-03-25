import type { SkillObject } from '../schemas/skill-object';

// ─── Scope Definitions (CONTRACT OWNER-01) ───

/** Dispatch overlay (Karvi): only dispatch.* paths allowed */
const DISPATCH_ALLOWED_SCOPES = ['dispatch'] as const;

/** Runtime overlay (Thyra): environment.*, verification.*, governance.mutability.* allowed */
const RUNTIME_ALLOWED_SCOPES = [
  'environment',
  'verification',
  'governance.mutability',
] as const;

// ─── Error ───

export class OverlayScopeError extends Error {
  constructor(
    public readonly overlayType: 'dispatch' | 'runtime',
    public readonly invalidFields: string[],
  ) {
    super(
      `${overlayType} overlay contains out-of-scope fields: ${invalidFields.join(', ')}`,
    );
    this.name = 'OverlayScopeError';
  }
}

// ─── Path Utilities ───

/**
 * Recursively collect all leaf paths from a nested object.
 * e.g., { governance: { mutability: { x: 1 }, reviewPolicy: { y: 2 } } }
 * -> ['governance.mutability.x', 'governance.reviewPolicy.y']
 */
function collectPaths(
  obj: Record<string, unknown>,
  prefix = '',
): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      paths.push(
        ...collectPaths(val as Record<string, unknown>, fullPath),
      );
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
function isPathAllowed(
  path: string,
  allowedScopes: readonly string[],
): boolean {
  return allowedScopes.some(
    (scope) => path === scope || path.startsWith(scope + '.'),
  );
}

function validateOverlayScope(
  overlay: Record<string, unknown>,
  allowedScopes: readonly string[],
  overlayType: 'dispatch' | 'runtime',
): void {
  const allPaths = collectPaths(overlay);
  const invalidFields = allPaths.filter(
    (p) => !isPathAllowed(p, allowedScopes),
  );
  if (invalidFields.length > 0) {
    throw new OverlayScopeError(overlayType, invalidFields);
  }
}

// ─── Deep Merge Helper ───

/**
 * Merge overlay into base one level deep: for each key in overlay,
 * if both base[key] and overlay[key] are plain objects, spread-merge them;
 * otherwise overlay[key] wins (replaces arrays, scalars, etc.).
 */
function mergeOneLevel<T extends Record<string, unknown>>(
  base: T,
  overlay: Record<string, unknown>,
): T {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overVal = overlay[key];
    if (
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      overVal !== null &&
      typeof overVal === 'object' &&
      !Array.isArray(overVal)
    ) {
      (result as Record<string, unknown>)[key] = {
        ...(baseVal as Record<string, unknown>),
        ...(overVal as Record<string, unknown>),
      };
    } else {
      (result as Record<string, unknown>)[key] = overVal;
    }
  }
  return result;
}

// ─── Merge ───

/**
 * Merge base SkillObject with optional dispatch and runtime overlays.
 *
 * Scope enforcement (CONTRACT OWNER-01):
 * - Dispatch overlay (Karvi): ONLY dispatch.* fields
 * - Runtime overlay (Thyra): ONLY environment.*, verification.*, governance.mutability.*
 *
 * Throws OverlayScopeError if an overlay contains out-of-scope fields.
 */
export function mergeSkillObject(
  base: SkillObject,
  dispatchOverlay?: Record<string, unknown>,
  runtimeOverlay?: Record<string, unknown>,
): SkillObject {
  const merged = structuredClone(base);

  if (dispatchOverlay) {
    validateOverlayScope(
      dispatchOverlay,
      DISPATCH_ALLOWED_SCOPES,
      'dispatch',
    );
    if (dispatchOverlay.dispatch) {
      merged.dispatch = mergeOneLevel(
        merged.dispatch,
        dispatchOverlay.dispatch as Record<string, unknown>,
      );
    }
  }

  if (runtimeOverlay) {
    validateOverlayScope(
      runtimeOverlay,
      RUNTIME_ALLOWED_SCOPES,
      'runtime',
    );
    if (runtimeOverlay.environment) {
      merged.environment = mergeOneLevel(
        merged.environment,
        runtimeOverlay.environment as Record<string, unknown>,
      );
    }
    if (runtimeOverlay.verification) {
      merged.verification = mergeOneLevel(
        merged.verification,
        runtimeOverlay.verification as Record<string, unknown>,
      );
    }
    if (
      runtimeOverlay.governance &&
      typeof runtimeOverlay.governance === 'object'
    ) {
      const gov = runtimeOverlay.governance as Record<string, unknown>;
      if (gov.mutability) {
        merged.governance = {
          ...merged.governance,
          mutability: {
            ...merged.governance.mutability,
            ...(gov.mutability as typeof merged.governance.mutability),
          },
        };
      }
    }
  }

  return merged;
}
