import { z } from 'zod';
import type { AgentSessionContext } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { resolveClassifierSystemPrompt } from '../config/agent-app-config.js';

export const conversationRouteScopeSchema = z.enum([
  'profile',
  'thread_history',
  'active_threads',
  'memories',
  'recent_sync',
]);

export type ConversationRouteScope = z.infer<typeof conversationRouteScopeSchema>;

export const classifierDecisionSchema = z.object({
  route: z.enum(['chat', 'action', 'plan']).default('action'),
  reasoning: z.string().default(''),
  requiredContextScopes: z.array(conversationRouteScopeSchema).default([]),
  directResponse: z.string().nullable().default(null),
  planSummary: z.string().nullable().default(null),
});

export type ClassifierDecision = z.infer<typeof classifierDecisionSchema>;

export class ClassifierAgent {
  readonly name = 'Intent Classifier';

  constructor(private readonly llm: OpenRouterService) {}

  getSystemPrompt(): string {
    const prompt = `You are Agent X's intent classifier. Your only job is to decide whether the user needs a conversational reply now or an action workflow.

Return JSON only.

Rules:
- route="chat" when the user is asking a question, wants guidance, wants platform help, wants an explanation, or is making conversational small talk.
- route="action" when the user wants Agent X to perform work, trigger tools, run an operation, create or modify something, navigate, open apps, send outreach, analyze assets, generate content, or coordinate specialists.
- requiredContextScopes must contain only the minimum extra context needed to answer a chat request well.
- Available scopes: profile, thread_history, active_threads, memories, recent_sync.
- directResponse is only for route="chat" when no extra context is required.
- planSummary is only for route="action" and should briefly describe the work to be done.
- For greetings, bare acknowledgements, identity questions, and openers, prefer route="chat", requiredContextScopes=[], and a directResponse.
- Do not request profile context just to make the response warmer.
- Imperative action requests are always route="action".
- Never refuse an action in directResponse. If the message is action-oriented, classify it as route="action".`;

    return resolveClassifierSystemPrompt(prompt);
  }

  async classify(intent: string, context: AgentSessionContext): Promise<ClassifierDecision | null> {
    try {
      const result = await this.llm.prompt(this.getSystemPrompt(), intent, {
        tier: 'chat',
        maxTokens: 300,
        temperature: 0.1,
        timeoutMs: 6_000,
        outputSchema: {
          name: 'intent_classifier_decision',
          schema: classifierDecisionSchema,
        },
        ...(context.operationId && {
          telemetryContext: {
            operationId: context.operationId,
            userId: context.userId,
            agentId: 'router',
          },
        }),
      });

      const parsed = classifierDecisionSchema.safeParse(result.parsedOutput);
      if (!parsed.success) {
        return null;
      }

      return {
        ...parsed.data,
        route: parsed.data.route === 'plan' ? 'action' : parsed.data.route,
      };
    } catch {
      return null;
    }
  }
}
