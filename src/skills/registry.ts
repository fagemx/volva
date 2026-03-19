import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { SkillObject, SkillStatus } from '../schemas/skill-object';
import { parseSkillYamlFile } from './yaml-parser';
import type { SkillFilter, SkillIndexEntry, ScanResult } from './types';

export type { SkillLookup, SkillMatch } from './types';

const STATUS_ORDER: SkillStatus[] = [
  'draft',
  'sandbox',
  'promoted',
  'core',
  'deprecated',
  'superseded',
];

function findSkillYamlFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: 'utf-8' });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...findSkillYamlFiles(fullPath));
    } else if (entry === 'skill.object.yaml') {
      results.push(fullPath);
    }
  }
  return results;
}

export class SkillRegistry {
  private index = new Map<string, SkillIndexEntry>();

  /**
   * Scan a directory recursively for skill.object.yaml files.
   * Parse errors are logged and accumulated — a single bad file
   * does not prevent other skills from loading.
   */
  scan(dir: string): ScanResult {
    const errors: string[] = [];
    const yamlPaths = findSkillYamlFiles(dir);

    for (const yamlPath of yamlPaths) {
      const result = parseSkillYamlFile(yamlPath);
      if (!result.ok) {
        errors.push(`${yamlPath}: ${result.error}`);
        continue;
      }
      const obj = result.data;
      this.index.set(obj.id, {
        id: obj.id,
        name: obj.name,
        status: obj.status,
        priority: obj.routing.priority,
        filePath: yamlPath,
        triggerWhen: obj.routing.triggerWhen,
        doNotTriggerWhen: obj.routing.doNotTriggerWhen,
        skillObject: obj,
      });
    }

    return { found: this.index.size, errors };
  }

  get(id: string): SkillObject | null {
    return this.index.get(id)?.skillObject ?? null;
  }

  list(filter?: SkillFilter): SkillIndexEntry[] {
    let entries = [...this.index.values()];

    if (filter?.minStatus) {
      const minIdx = STATUS_ORDER.indexOf(filter.minStatus);
      entries = entries.filter(
        (e) => STATUS_ORDER.indexOf(e.status) >= minIdx,
      );
    }

    if (filter?.domain) {
      const domain = filter.domain;
      entries = entries.filter(
        (e) => e.skillObject.identity.domain === domain,
      );
    }

    if (filter?.tags && filter.tags.length > 0) {
      const requiredTags = filter.tags;
      entries = entries.filter((e) =>
        requiredTags.every((t) => e.skillObject.identity.tags.includes(t)),
      );
    }

    return entries.sort((a, b) => b.priority - a.priority);
  }
}
