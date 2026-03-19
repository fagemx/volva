import { Hono } from 'hono';
import { createDb, initSchema } from './db';
import { LLMClient } from './llm/client';
import { CardManager } from './cards/card-manager';
import { ThyraClient } from './thyra-client/client';
import { KarviClient } from './karvi-client/client';
import { conversationRoutes } from './routes/conversations';
import { cardRoutes } from './routes/cards';
import { settlementRoutes } from './routes/settlements';
import { decisionRoutes } from './routes/decisions';
import { skillRoutes } from './routes/skills';
import { containerRoutes } from './routes/containers';
import { DecisionSessionManager } from './decision/session-manager';
import { SkillRegistry } from './skills/registry';
import { createSkillLookup } from './skills/trigger-matcher';

const dbPath = process.env.VOLVA_DB_PATH || ':memory:';
const db = createDb(dbPath);
initSchema(db);

const llm = new LLMClient();
const cardManager = new CardManager(db);
const thyra = new ThyraClient();
const karvi = new KarviClient();

const sessionManager = new DecisionSessionManager(db);
const registry = new SkillRegistry();
const skillLookup = createSkillLookup(registry);

const app = new Hono();

app.route('/', conversationRoutes({ db, llm, cardManager, thyra }));
app.route('/', cardRoutes({ cardManager }));
app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));
app.route('/', decisionRoutes({ db, llm, sessionManager }));
app.route('/', skillRoutes({ db, llm, registry }));
app.route('/', containerRoutes({ skillLookup }));

export default {
  port: 3460,
  fetch: app.fetch,
};
