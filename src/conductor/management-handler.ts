import type { LLMClient } from '../llm/client';
import type { ThyraClient } from '../thyra-client/client';
import { parseIntent } from '../llm/intent-parser';
import { generateReply } from '../llm/response-gen';
import type { Intent } from '../schemas/intent';
import type { Strategy } from '../llm/prompts';

export interface ManagementTurnResult {
  reply: string;
  intent: Intent;
  action: 'query' | 'none';
  strategy: Strategy;
}

async function fetchVillageContext(thyra: ThyraClient, villageId: string): Promise<string> {
  try {
    const [village, constitution, chiefs] = await Promise.all([
      thyra.getVillage(villageId),
      thyra.getActiveConstitution(villageId),
      thyra.getChiefs(villageId),
    ]);

    const sections: string[] = [];
    sections.push(`Village: ${village.name}`);
    sections.push(`Target repo: ${village.target_repo}`);

    const hardRules = constitution.rules.filter(r => r.enforcement === 'hard');
    const softRules = constitution.rules.filter(r => r.enforcement === 'soft');
    sections.push(`Constitution: ${hardRules.length} hard rules, ${softRules.length} soft rules`);

    if (chiefs.length > 0) {
      sections.push(`Chiefs: ${chiefs.map(c => c.name).join(', ')}`);
    }

    return sections.join('\n');
  } catch (error) {
    console.error('[management] fetchVillageContext failed:', error);
    return '(Unable to fetch village state from Thyra)';
  }
}

export async function handleManagementTurn(
  llm: LLMClient,
  thyra: ThyraClient,
  villageId: string,
  userMessage: string,
): Promise<ManagementTurnResult> {
  // Use village context as "card snapshot" for intent parsing
  const villageContext = await fetchVillageContext(thyra, villageId);

  // LLM #1: parse intent (CONTRACT LLM-02: must try/catch)
  let intent: Intent;
  try {
    intent = await parseIntent(llm, userMessage, villageContext);
  } catch (error) {
    console.error('[handleManagementTurn] parseIntent threw:', error);
    intent = { type: 'off_topic', summary: userMessage };
  }

  const isQuery = intent.type === 'query_status' || intent.type === 'query_history';
  const action: 'query' | 'none' = isQuery ? 'query' : 'none';

  // For query intents, include village context in the reply generation
  const replyContext = isQuery ? villageContext : `(Management mode — village: ${villageId})`;
  const strategy: Strategy = 'probe';

  // LLM #2: generate reply (CONTRACT LLM-02: must try/catch)
  let reply: string;
  try {
    reply = await generateReply(llm, strategy, replyContext, userMessage);
  } catch (error) {
    console.error('[handleManagementTurn] generateReply threw:', error);
    reply = '(System error during reply generation. Please try again.)';
  }

  return { reply, intent, action, strategy };
}
