import yaml from 'js-yaml';
import { readFileSync } from 'fs';
import { SkillObjectSchema, type SkillObject } from '../schemas/skill-object';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseSkillYaml(yamlStr: string): ParseResult<SkillObject> {
  let raw: unknown;
  try {
    raw = yaml.load(yamlStr);
  } catch (e) {
    return { ok: false, error: `YAML parse error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
  const result = SkillObjectSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, data: result.data };
}

export function serializeSkillObject(obj: SkillObject): string {
  return yaml.dump(obj, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

export function parseSkillYamlFile(filePath: string): ParseResult<SkillObject> {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (e) {
    return { ok: false, error: `File read error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
  return parseSkillYaml(content);
}
