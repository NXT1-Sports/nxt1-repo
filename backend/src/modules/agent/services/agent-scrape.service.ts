/**
 * @fileoverview Agent Linked Account Scrape Service
 * @module @nxt1/backend/modules/agent/services/agent-scrape
 *
 * Enqueues a linked account scraping job when a new user completes onboarding.
 * Routes through the DataCoordinatorAgent via the standard Agent X queue.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload, UserRole } from '@nxt1/core';
import { enqueueWithOutbox } from '../queue/outbox.service.js';
import { logger } from '../../../utils/logger.js';

export interface LinkedAccount {
  readonly platform: string;
  readonly profileUrl: string;
}

export interface ScrapeLinkedAccountsInput {
  readonly userId: string;
  readonly role: UserRole;
  readonly sport?: string;
  readonly linkedAccounts: readonly LinkedAccount[];
  readonly teamId?: string;
  readonly organizationId?: string;
}

export interface ScrapeLinkedAccountsResult {
  /** One operationId per enqueued job (2 accounts per job). */
  readonly operationIds: readonly string[];
  readonly threadId?: string;
}

let queueService: import('../queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../queue/job.repository.js').AgentJobRepository | null = null;
let chatService: import('./agent-chat.service.js').AgentChatService | null = null;

export function setScrapeDependencies(deps: {
  queueService: import('../queue/queue.service.js').AgentQueueService;
  jobRepository: import('../queue/job.repository.js').AgentJobRepository;
  chatService: import('./agent-chat.service.js').AgentChatService;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
}

export async function enqueueLinkedAccountScrape(
  db: Firestore,
  input: ScrapeLinkedAccountsInput,
  environment: 'staging' | 'production' = 'production'
): Promise<ScrapeLinkedAccountsResult | null> {
  if (!queueService || !jobRepository) {
    logger.warn('[Scrape] Agent queue not initialized — skipping linked account scrape', {
      userId: input.userId,
    });
    return null;
  }

  if (input.linkedAccounts.length === 0) {
    logger.info('[Scrape] No linked accounts to scrape', { userId: input.userId });
    return null;
  }

  const repo = jobRepository;
  const allPlatforms = input.linkedAccounts.map((a) => a.platform).join(', ');

  // ── 1. Create one shared thread before spawning any jobs ────────────────
  let threadId: string | undefined;
  if (chatService) {
    try {
      const combinedPrompt = `Analyze my linked ${allPlatforms} account${
        input.linkedAccounts.length > 1 ? 's' : ''
      } from onboarding`;
      const { thread } = await chatService.startConversation({
        userId: input.userId,
        prompt: combinedPrompt,
        category: 'analytics',
        origin: 'database_event',
      });
      threadId = thread.id;
      logger.info('[Scrape] Shared thread created for linked account scrape', {
        userId: input.userId,
        threadId: thread.id,
        accountCount: input.linkedAccounts.length,
      });
    } catch (err) {
      logger.warn('[Scrape] Failed to create thread — jobs will run without persistence', {
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── 2. Chunk accounts into pairs (ceiling division) ─────────────────────
  // 2 accounts per job maximises parallelism without increasing write-conflict
  // probability beyond acceptable levels (see write-conflict note in plan).
  const chunks: (typeof input.linkedAccounts)[] = [];
  for (let i = 0; i < input.linkedAccounts.length; i += 2) {
    chunks.push(input.linkedAccounts.slice(i, i + 2));
  }

  const operationIds: string[] = [];

  try {
    for (const chunk of chunks) {
      const operationId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      const chunkPlatforms = chunk.map((a) => a.platform).join(', ');
      const chunkUrlList = chunk.map((a) => `- ${a.platform}: ${a.profileUrl}`).join('\n');
      const chunkIntent = `Analyze my linked ${chunkPlatforms} account${
        chunk.length > 1 ? 's' : ''
      }:\n${chunkUrlList}`;

      const payload: AgentJobPayload = {
        operationId,
        userId: input.userId,
        intent: chunkIntent,
        sessionId,
        origin: 'user',
        agent: 'data_coordinator',
        context: {
          origin: 'onboarding',
          step: 'link-sources',
          userRole: input.role,
          sport: input.sport,
          linkedAccounts: chunk.map((a) => ({ platform: a.platform, url: a.profileUrl })),
          ...(threadId ? { threadId } : {}),
          ...(input.teamId ? { teamId: input.teamId } : {}),
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        },
      };

      await repo.withDb(db).create(payload);
      await enqueueWithOutbox(db, payload, environment, queueService);

      if (threadId) {
        await repo
          .withDb(db)
          .patchContext(operationId, { threadId })
          .catch((err) =>
            logger.warn('[Scrape] Failed to patch threadId into job context', {
              operationId,
              err: err instanceof Error ? err.message : String(err),
            })
          );
      }

      operationIds.push(operationId);

      logger.info('[Scrape] Chunk job enqueued', {
        userId: input.userId,
        operationId,
        platforms: chunkPlatforms,
        chunkSize: chunk.length,
        threadId,
      });
    }

    logger.info('[Scrape] All linked account scrape jobs enqueued', {
      userId: input.userId,
      operationIds,
      totalAccounts: input.linkedAccounts.length,
      jobCount: chunks.length,
      threadId,
    });

    return { operationIds, ...(threadId ? { threadId } : {}) };
  } catch (err) {
    logger.error('[Scrape] Failed to enqueue linked account scrape jobs', {
      userId: input.userId,
      enqueuedSoFar: operationIds.length,
      error: err instanceof Error ? err.message : String(err),
    });
    // Return partial results if at least one job enqueued successfully
    if (operationIds.length > 0) {
      return { operationIds, ...(threadId ? { threadId } : {}) };
    }
    return null;
  }
}
