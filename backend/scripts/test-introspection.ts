import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env' });
loadDotenv({ path: '.env.local', override: true });

import { OpenRouterService } from '../src/modules/agent/llm/openrouter.service.js';
import { ToolRegistry } from '../src/modules/agent/tools/tool-registry.js';
import { ContextBuilder } from '../src/modules/agent/memory/context-builder.js';
import { AgentRouter } from '../src/modules/agent/agent.router.js';

async function run() {
  console.log('Bootstrapping agent infrastructure...');
  const llm = new OpenRouterService();
  const toolRegistry = new ToolRegistry();
  const contextBuilder = new ContextBuilder();
  const router = new AgentRouter(llm, toolRegistry, contextBuilder);

  // Stub Firestore Context lookup so it doesn't fail on Auth
  contextBuilder.buildContext = async () =>
    ({
      userId: 'user-000',
      displayName: 'John Keller',
      role: 'athlete',
      sport: 'football',
      position: 'QB',
      targetColleges: ['Ohio State', 'Texas', 'Michigan'],
      graduationYear: 2026,
    }) as any;

  contextBuilder.getMemoriesForContext = async () => ({
    user: [
      {
        id: 'm1',
        userId: 'user-000',
        target: 'user',
        content: 'Very competitive, wants D1',
        category: 'goals',
        createdAt: new Date().toISOString(),
      },
    ],
    team: [],
    organization: [],
  });

  contextBuilder.getRecentSyncSummariesForContext = async () => [
    'Updated highlight reel and watched Ohio State game tape.',
    'Chatted about improving arm strength.',
  ];

  contextBuilder.getActiveThreadsSummary = async () => '1. Recruiting Strategy 2. Workout Schedule';
  contextBuilder.getRecentThreadHistory = async () =>
    'User: hello\nAgent: Hi John, how can I help?';

  console.log('Running Query ... "What do you know about me?"');
  const result = await router.run(
    {
      operationId: 'test-introspect-' + Date.now(),
      userId: 'user-000',
      intent: 'What do you know about me?',
      origin: 'user',
      priority: 'normal',
      createdAt: new Date().toISOString(),
    },
    (update) => {
      console.log('[Update =>]', update.status, update.message);
    },
    undefined,
    (event) => {
      if (event.type === 'delta') {
        process.stdout.write(event.text);
      }
    }
  );

  console.log('\n\n--- Final Result ---');
  console.log(result.summary);
  process.exit(0);
}
run().catch(console.error);
