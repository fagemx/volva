import type { SkillObject, SkillStatus } from '../schemas/skill-object';

// ─── DI interface for Container Router ───

export interface SkillLookup {
  findMatching(context: string): SkillMatch[];
}

export interface SkillMatch {
  skillId: string;
  confidence: 'high' | 'medium' | 'low';
  matchedTriggers: string[];
}

// ─── Registry types ───

export interface SkillIndexEntry {
  id: string;
  name: string;
  status: SkillStatus;
  priority: number;
  filePath: string;
  triggerWhen: string[];
  doNotTriggerWhen: string[];
  skillObject: SkillObject;
}

export interface SkillFilter {
  minStatus?: SkillStatus;
  domain?: string;
  tags?: string[];
}

export interface ScanResult {
  found: number;
  errors: string[];
}
