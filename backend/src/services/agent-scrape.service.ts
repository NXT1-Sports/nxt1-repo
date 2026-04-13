/**
 * @fileoverview Agent Linked Account Scrape Service
 * @module @nxt1/backend/services/agent-scrape
 *
 * Enqueues a linked account scraping job when a new user completes onboarding.
 * Routes through the DataCoordinatorAgent via the standard Agent X queue.
 *
 * Follows the same fire-and-forget pattern as agent-welcome.service.ts.
 * The job is enqueued from the backend (POST /profile/onboarding) so
 * scraping begins immediately — the frontend overlay simply polls progress.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload, UserRole } from '@nxt1/core';
import { logger } from '../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

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
}

// ─── Lazy Queue References ──────────────────────────────────────────────────

let queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository | null =
  null;
let chatService: import('../modules/agent/services/agent-chat.service.js').AgentChatService | null =
  null;

/**
 * Inject queue deps (called by bootstrap — avoid circular imports).
 */
export function setScrapeDependencies(deps: {
  queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository;
  chatService: import('../modules/agent/services/agent-chat.service.js').AgentChatService;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Enqueue a linked account scraping job for a newly onboarded user.
 * Fire-and-forget — callers should not await the scrape completion.
 *
 * @returns The jobId and operationId, or null if the queue is unavailable.
 */
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

  // Build a human-readable prompt so the thread title and operations log
  // display a meaningful description instead of raw URLs.
  const prompt = `Analyze my linked ${platformNames} account${input.linkedAccounts.length > 1 ? 's' : ''}:\n${urlList}`;

  const operationId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  // Create a MongoDB thread + first message atomically via startConversation
  let threadId: string | undefined;
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
        threadId,
      });
    } catch (err) {
      logger.warn('[Scrape] Failed to create thread — job will run without persistence', {
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
      ...(threadId ? { threadId } : {}),
    },
  };

  try {
    await jobRepository.withDb(db).create(payload);
    await queueService.enqueue(payload, environment);

    logger.info('[Scrape] Linked account scrape job enqueued', {
      userId: input.userId,
      operationId,
      platforms: platformNames,
      count: input.linkedAccounts.length,
    });

    return { operationId };
  } catch (err) {
    logger.error('[Scrape] Failed to enqueue linked account scrape job', {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
