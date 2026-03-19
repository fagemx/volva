import type { SkillIndexEntry, SkillLookup, SkillMatch } from './types';
import type { SkillRegistry } from './registry';

const EXCLUDED_STATUSES = new Set(['draft', 'deprecated', 'superseded']);

/**
 * Match context string against skill triggerWhen / doNotTriggerWhen keywords.
 * Returns matches sorted by priority descending.
 */
export function matchSkills(
  context: string,
  entries: SkillIndexEntry[],
): SkillMatch[] {
  const contextLower = context.toLowerCase();
  const matches: SkillMatch[] = [];

  for (const entry of entries) {
    if (EXCLUDED_STATUSES.has(entry.status)) continue;

    const excluded = entry.doNotTriggerWhen.some((pattern) =>
      contextLower.includes(pattern.toLowerCase()),
    );
    if (excluded) continue;

    const triggerHits = entry.triggerWhen.filter((pattern) =>
      contextLower.includes(pattern.toLowerCase()),
    );
    if (triggerHits.length === 0) continue;

    matches.push({
      skillId: entry.id,
      confidence: triggerHits.length >= 2 ? 'high' : 'medium',
      matchedTriggers: triggerHits,
    });
  }

  // Sort by priority descending — need to look up priority from entries
  const priorityMap = new Map(entries.map((e) => [e.id, e.priority]));
  return matches.sort(
    (a, b) => (priorityMap.get(b.skillId) ?? 0) - (priorityMap.get(a.skillId) ?? 0),
  );
}

/**
 * Factory: create a SkillLookup backed by a SkillRegistry.
 */
export function createSkillLookup(registry: SkillRegistry): SkillLookup {
  return {
    findMatching(context: string): SkillMatch[] {
      const entries = registry.list();
      return matchSkills(context, entries);
    },
  };
}
