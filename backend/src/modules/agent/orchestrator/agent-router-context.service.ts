import { randomUUID } from 'node:crypto';
import type {
  AgentOperationResult,
  AgentRetrievedMemories,
  AgentSessionContext,
  AgentSessionMessage,
  AgentTask,
  AgentUserContext,
} from '@nxt1/core';
import type { ContextBuilder } from '../memory/context-builder.js';
import type { SessionMemoryService } from '../memory/session.service.js';
import { logger } from '../../../utils/logger.js';

const EMPTY_RETRIEVED_MEMORIES: AgentRetrievedMemories = {
  user: [],
  team: [],
  organization: [],
};

export class AgentRouterContextService {
  constructor(
    private readonly contextBuilder: ContextBuilder,
    private readonly sessionMemory?: SessionMemoryService
  ) {}

  enrichIntentWithContext(
    intent: string,
    userContext: AgentUserContext,
    jobContext?: Record<string, unknown>,
    threadHistory?: string,
    memories: AgentRetrievedMemories = EMPTY_RETRIEVED_MEMORIES,
    recentSyncSummaries: readonly string[] = [],
    activeThreadsSummary?: string
  ): string {
    const contextStr = this.contextBuilder.compressToPrompt(
      userContext,
      memories,
      recentSyncSummaries
    );
    let enriched = `[User Profile]\n${contextStr}`;

    if (jobContext && Object.keys(jobContext).length > 0) {
      const {
        threadId: _threadId,
        mode: _mode,
        attachments: _attachments,
        ...visibleContext
      } = jobContext;
      if (Object.keys(visibleContext).length > 0) {
        let contextMd = '\n\n[Job Context]\n';
        for (const [key, value] of Object.entries(visibleContext)) {
          const formatted = typeof value === 'object' ? JSON.stringify(value) : String(value);
          contextMd += `- **${key}**: ${formatted}\n`;
        }
        enriched += contextMd;
      }
    }

    if (activeThreadsSummary) {
      enriched += `\n\n[Recent Conversation Topics]${activeThreadsSummary}`;
    }

    if (threadHistory) {
      enriched += `\n${threadHistory}`;
    }

    enriched += `\n\n[Request]\n${intent}`;
    return enriched;
  }

  buildTaskIntent(
    task: AgentTask,
    upstreamResults: Map<string, AgentOperationResult>,
    enrichedContext?: string
  ): string {
    const parts: string[] = [];

    if (enrichedContext) {
      parts.push(enrichedContext);
    }

    if (task.dependsOn.length > 0) {
      for (const depId of task.dependsOn) {
        const depResult = upstreamResults.get(depId);
        if (depResult) {
          parts.push(`[Result from task ${depId}]: ${depResult.summary}`);
          // Forward structured artifacts (imageUrl, storagePath, cloudflareVideoId, etc.)
          // so downstream coordinators have direct URL access rather than relying on prose.
          if (depResult.artifacts && Object.keys(depResult.artifacts).length > 0) {
            let artifactStr = JSON.stringify(depResult.artifacts);
            // Cap at 500 chars to respect token budget
            if (artifactStr.length > 500) {
              artifactStr = artifactStr.slice(0, 497) + '...';
            }
            parts.push(`[Artifacts from task ${depId}]: ${artifactStr}`);
          }
        }
      }
    }

    parts.push('[Agent Handoff]');
    parts.push(`Objective: ${task.description}`);

    return parts.join('\n\n');
  }

  buildSessionContext(
    userId: string,
    sessionId?: string,
    operationId?: string,
    threadId?: string,
    environment?: 'staging' | 'production',
    signal?: AbortSignal,
    mode?: string,
    attachments?: readonly {
      readonly url: string;
      readonly mimeType: string;
      readonly storagePath?: string;
      readonly name?: string;
    }[],
    videoAttachments?: readonly {
      readonly url: string;
      readonly mimeType: string;
      readonly name: string;
      readonly cloudflareVideoId?: string;
    }[],
    conversationHistory?: readonly AgentSessionMessage[]
  ): AgentSessionContext {
    const now = new Date().toISOString();
    return {
      sessionId: sessionId ?? randomUUID(),
      userId,
      conversationHistory: conversationHistory ?? [],
      createdAt: now,
      lastActiveAt: now,
      ...(environment && { environment }),
      ...(operationId && { operationId }),
      ...(threadId && { threadId }),
      ...(mode && { mode }),
      ...(attachments?.length && { attachments }),
      ...(videoAttachments?.length && { videoAttachments }),
      ...(signal && { signal }),
    };
  }

  appendAssistantMessage(userId: string, threadId: string | undefined, summary: string): void {
    if (!this.sessionMemory || !threadId) return;
    this.sessionMemory
      .appendMessage(userId, threadId, {
        role: 'assistant',
        content: summary,
        timestamp: new Date().toISOString(),
      })
      .catch((err) => {
        logger.warn('[AgentRouter] Failed to append assistant message to session', {
          userId,
          threadId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }
}
