import type { AgentSessionContext } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { resolveConversationSystemPrompt } from '../config/agent-app-config.js';
import { sanitizeAgentOutputText } from '../utils/platform-identifier-sanitizer.js';

export class ConversationAgent {
  readonly name = 'Conversation Agent';

  constructor(private readonly llm: OpenRouterService) {}

  getSystemPrompt(): string {
    const prompt = `You are Agent X, NXT1's conversational interface. Answer naturally, concisely, and practically using the supplied context when it is relevant.

Rules:
- The routing layer already decided this is a conversational response.
- Do not create plans, tool calls, or specialist task lists.
- Do not invent profile facts or past activity that are not present in the supplied context.
- Be direct and useful. Avoid filler.`;

    return resolveConversationSystemPrompt(prompt);
  }

  async respond(
    intent: string,
    scopedContextText: string,
    context: AgentSessionContext
  ): Promise<string> {
    const userMessage = scopedContextText
      ? `${scopedContextText}\n\n[User Message]\n${intent}`
      : intent;

    const result = await this.llm.prompt(this.getSystemPrompt(), userMessage, {
      tier: 'chat',
      maxTokens: 512,
      temperature: 0.4,
      timeoutMs: 8_000,
      ...(context.operationId && {
        telemetryContext: {
          operationId: context.operationId,
          userId: context.userId,
          agentId: 'router',
        },
      }),
    });

    return sanitizeAgentOutputText(result.content || "I'm here and ready to help.");
  }
}
