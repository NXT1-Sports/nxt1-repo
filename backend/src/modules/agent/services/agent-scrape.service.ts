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
  readonly operationId: string;
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

  const platformNames = input.linkedAccounts.map((a) => a.platform).join(', ');
  const urlList = input.linkedAccounts.map((a) => `- ${a.platform}: ${a.profileUrl}`).join('\n');
  const prompt = `Analyze my linked ${platformNames} account${input.linkedAccounts.length > 1 ? 's' : ''}:\n${urlList}`;

  const operationId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  const payload: AgentJobPayload = {
    operationId,
    userId: input.userId,
    intent: prompt,
    sessionId,
    origin: 'user',
    agent: 'data_coordinator',
    context: {
      origin: 'onboarding',
      step: 'link-sources',
      userRole: input.role,
      sport: input.sport,
      linkedAccounts: input.linkedAccounts.map((a) => ({
        platform: a.platform,
        url: a.profileUrl,
      })),
      ...(input.teamId ? { teamId: input.teamId } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    },
  };

  try {
    await jobRepository.withDb(db).create(payload);
    await enqueueWithOutbox(db, payload, environment, queueService);

    let threadId: string | undefined;
    const repo = jobRepository;
    if (chatService) {
      try {
        const { thread } = await chatService.startConversation({
          userId: input.userId,
          prompt,
          category: 'analytics',
          origin: 'database_event',
        });
        threadId = thread.id;
        logger.info('[Scrape] Thread created for linked account scrape', {
          userId: input.userId,
          threadId: thread.id,
        });
        await repo
          .withDb(db)
          .patchContext(operationId, { threadId: thread.id })
          .catch((err) =>
            logger.warn('[Scrape] Failed to patch threadId into job context', {
              err: err instanceof Error ? err.message : String(err),
            })
          );
      } catch (err) {
        logger.warn('[Scrape] Failed to create thread — job will run without persistence', {
          userId: input.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('[Scrape] Linked account scrape job enqueued', {
      userId: input.userId,
      operationId,
      platforms: platformNames,
      count: input.linkedAccounts.length,
      threadId: threadId ?? undefined,
    });

    return { operationId, ...(threadId ? { threadId } : {}) };
  } catch (err) {
    logger.error('[Scrape] Failed to enqueue linked account scrape job', {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
