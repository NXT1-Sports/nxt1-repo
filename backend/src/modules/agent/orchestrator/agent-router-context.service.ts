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

const MAX_TASK_HANDOFF_ARTIFACT_CHARS = 20_000;

function collectHttpUrls(value: unknown, sink: Set<string>): void {
  if (typeof value === 'string') {
    const match = value.match(/https?:\/\/\S+/g);
    if (!match) return;
    for (const rawUrl of match) {
      sink.add(rawUrl.replace(/[),.;!?]+$/, ''));
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectHttpUrls(item, sink);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectHttpUrls(nested, sink);
    }
  }
}

function stripRequestSection(enrichedContext?: string): string | null {
  if (!enrichedContext) return null;

  const marker = '\n\n[Request]\n';
  const markerIndex = enrichedContext.indexOf(marker);
  if (markerIndex < 0) {
    return enrichedContext.trim().length > 0 ? enrichedContext : null;
  }

  const scoped = enrichedContext.slice(0, markerIndex).trim();
  return scoped.length > 0 ? scoped : null;
}

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
      recentSyncSummaries,
      {
        appBaseUrl:
          typeof jobContext?.['appBaseUrl'] === 'string'
            ? String(jobContext['appBaseUrl'])
            : undefined,
      }
    );
    let enriched = `[User Profile]\n${contextStr}`;

    if (jobContext && Object.keys(jobContext).length > 0) {
      const {
        threadId: _threadId,
        mode: _mode,
        attachments: _attachments,
        appBaseUrl: _appBaseUrl,
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

    const scopedContext = stripRequestSection(enrichedContext);
    if (scopedContext) {
      parts.push(scopedContext);
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
            // Cap to a reasonable upper bound to protect prompt budget while
            // still carrying complete artifact URL sets (e.g. multi-diagram playbooks).
            if (artifactStr.length > MAX_TASK_HANDOFF_ARTIFACT_CHARS) {
              artifactStr = artifactStr.slice(0, MAX_TASK_HANDOFF_ARTIFACT_CHARS - 3) + '...';

              const extractedUrls = new Set<string>();
              collectHttpUrls(depResult.artifacts, extractedUrls);
              if (extractedUrls.size > 0) {
                parts.push(
                  `[Artifact URLs from task ${depId}]: ${JSON.stringify([...extractedUrls])}`
                );
              }
            }
            parts.push(`[Artifacts from task ${depId}]: ${artifactStr}`);
          }
        }
      }
    }

    parts.push('[Agent Handoff]');
    parts.push(`Objective: ${task.description}`);
    parts.push('[Task Boundaries]');
    parts.push('- Execute only this Objective for the current task.');
    parts.push('- Do NOT perform downstream or future plan tasks in this step.');
    parts.push(
      '- If blocked by missing prerequisite data, report blocked status instead of continuing.'
    );

    // Inject verbatim structured data so coordinators can read IDs, codes, and
    // references without relying on LLM paraphrasing. This block is the single
    // source of truth for machine-readable handoff data.
    if (task.structuredPayload && Object.keys(task.structuredPayload).length > 0) {
      parts.push(
        `[Structured Handoff Data — use these values exactly, do not paraphrase]:\n${JSON.stringify(task.structuredPayload, null, 2)}`
      );
    }

    return parts.join('\n\n');
  }

  buildSessionContext(
    userId: string,
    sessionId?: string,
    operationId?: string,
    threadId?: string,
    environment?: 'staging' | 'production',
    appBaseUrl?: string,
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
      ...(appBaseUrl && { appBaseUrl }),
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
