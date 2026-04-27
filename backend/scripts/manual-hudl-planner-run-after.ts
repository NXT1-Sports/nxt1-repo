import { config as loadDotenv } from 'dotenv';
import { OpenRouterService } from '../src/modules/agent/llm/openrouter.service.js';
import { PlannerAgent } from '../src/modules/agent/agents/planner.agent.js';

loadDotenv({ path: '.env' });
loadDotenv({ path: '.env.local', override: true });

async function main(): Promise<void> {
  const llm = new OpenRouterService();
  const planner = new PlannerAgent(llm);
  const now = new Date().toISOString();
  const context = {
    sessionId: `manual-run-after-${Date.now()}`,
    userId: 'manual-user',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
  };

  const intent = 'open hudl for me please lets watch film';
  const result = await planner.execute(intent, context, []);
  const data = result.data ?? {};
  const plan = data['plan'] as { tasks?: Array<Record<string, unknown>> } | undefined;

  const out = {
    intent,
    summary: result.summary,
    metadata: data['metadata'] ?? null,
    directResponse: data['directResponse'] ?? null,
    taskCount: Array.isArray(plan?.tasks) ? plan.tasks.length : 0,
    tasks: Array.isArray(plan?.tasks) ? plan.tasks : [],
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
