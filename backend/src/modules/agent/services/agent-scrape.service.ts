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
import type { OpenRouterService } from '../llm/openrouter.service.js';

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
  /** Operation IDs for enqueued jobs (onboarding currently enqueues one job). */
  readonly operationIds: readonly string[];
  readonly threadId?: string;
}

let queueService: import('../queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../queue/job.repository.js').AgentJobRepository | null = null;
let chatService: import('./agent-chat.service.js').AgentChatService | null = null;
let llmService: OpenRouterService | null = null;

export function setScrapeDependencies(deps: {
  queueService: import('../queue/queue.service.js').AgentQueueService;
  jobRepository: import('../queue/job.repository.js').AgentJobRepository;
  chatService: import('./agent-chat.service.js').AgentChatService;
  llmService: OpenRouterService;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
  llmService = deps.llmService;
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

  const operationIds: string[] = [];
  const normalizeScopeId = (value?: string): string => (value ?? '').trim().toLowerCase();
  const isTeamRole = input.role === 'coach' || input.role === 'director';
  const profileTarget = isTeamRole ? 'team profile' : 'NXT1 profile';
  const onboardingObjective = isTeamRole
    ? 'Collect and add or update all relevant team fields now (identity, schedule, roster context, recruiting updates, achievements, and recent news). Never invent or fabricate roster players; if source roster data is empty, skip roster writes and report that explicitly.'
    : 'Collect and add or update all relevant athlete fields now (bio, team context, position details, measurables, achievements, offers, and recent performance/news). Never invent or fabricate missing data.';
  const executionDirective =
    'Execute the sync immediately and write the updates directly to the target profile.';
  const targetDocType: 'user' | 'team' = isTeamRole && !!input.teamId ? 'team' : 'user';
  const targetDocId = targetDocType === 'team' ? input.teamId! : input.userId;
  const targetScopeId = normalizeScopeId(input.sport);

  try {
    // ─── Chunk into 2-account pairs (fan-out parallelism) ──────────────────────
    const CHUNK_SIZE = 2;
    const chunks: (typeof input.linkedAccounts)[] = [];
    for (let i = 0; i < input.linkedAccounts.length; i += CHUNK_SIZE) {
      chunks.push(input.linkedAccounts.slice(i, i + CHUNK_SIZE));
    }

    // ─── Create jobs for each chunk (each gets its own thread + operationId + sessionId) ──
    for (const chunk of chunks) {
      const operationId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      // Create a separate thread PER CHUNK so each job only sees its own prompts
      let chunkThreadId: string | undefined;
      if (chatService) {
        try {
          const chunkPlatforms = chunk.map((a) => a.platform).join(', ');
          const chunkPrompt = `Sync my connected accounts. Linked accounts in this job: ${chunkPlatforms}. Target profile: ${profileTarget}. ${onboardingObjective} ${executionDirective}`;
          const { thread } = await chatService.startConversation({
            userId: input.userId,
            prompt: chunkPrompt,
            category: 'analytics',
            origin: 'database_event',
          });
          chunkThreadId = thread.id;

          if (llmService) {
            try {
              const generatedTitle = await chatService.generateTitleFromPromptOnly(
                chunkPrompt,
                llmService
              );
              if (generatedTitle) {
                await chatService.applyGeneratedThreadTitle(
                  chunkThreadId,
                  input.userId,
                  chunkPrompt,
                  generatedTitle
                );
              }
            } catch (titleErr) {
              logger.warn('[Scrape] Failed to apply prompt-only thread title', {
                userId: input.userId,
                chunkIndex: chunks.indexOf(chunk) + 1,
                threadId: chunkThreadId,
                error: titleErr instanceof Error ? titleErr.message : String(titleErr),
              });
            }
          }

          logger.info('[Scrape] Chunk thread created', {
            userId: input.userId,
            chunkIndex: chunks.indexOf(chunk) + 1,
            threadId: chunkThreadId,
            platforms: chunkPlatforms,
          });
        } catch (err) {
          logger.warn('[Scrape] Failed to create chunk thread', {
            userId: input.userId,
            chunkIndex: chunks.indexOf(chunk) + 1,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Build intent + URL list for THIS chunk only
      const urlList = chunk
        .map((account) => `- ${account.platform}: ${account.profileUrl}`)
        .join('\n');
      const platformList = chunk.map((account) => account.platform).join(', ');
      const intent = `Sync my connected accounts. Linked accounts in this job: ${platformList}. Target profile: ${profileTarget}. ${onboardingObjective} ${executionDirective}\n\nAccounts to sync:\n${urlList}`;

      // Build connectedSourceTargets for THIS chunk only
      const chunkConnectedSourceTargets = chunk
        .map((account) => {
          const platform = account.platform.trim().toLowerCase();
          const profileUrl = account.profileUrl.trim();
          if (!platform || !profileUrl) return null;
          return {
            docType: targetDocType,
            docId: targetDocId,
            platform,
            profileUrl,
            scopeId: targetScopeId,
          } as const;
        })
        .filter((target): target is NonNullable<typeof target> => target !== null);

      const payload: AgentJobPayload = {
        operationId,
        userId: input.userId,
        intent,
        sessionId,
        origin: 'user',
        agent: 'data_coordinator',
        context: {
          origin: 'onboarding',
          step: 'link-sources',
          userRole: input.role,
          sport: input.sport,
          linkedAccounts: chunk.map((a) => ({
            platform: a.platform,
            url: a.profileUrl,
          })),
          connectedSourceTargets: chunkConnectedSourceTargets,
          connectedSourceTargetCount: chunkConnectedSourceTargets.length,
          connectedSourceTargetVersion: 1,
          ...(chunkThreadId ? { threadId: chunkThreadId } : {}),
          ...(input.teamId ? { teamId: input.teamId } : {}),
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        },
      };

      await repo.withDb(db).create(payload);
      await enqueueWithOutbox(db, payload, environment, queueService);
      operationIds.push(operationId);

      // Chunk-specific thread is already included in the context above
      // No need to patch separately

      logger.info('[Scrape] Linked account scrape job enqueued (chunked)', {
        userId: input.userId,
        operationId,
        chunkIndex: chunks.indexOf(chunk) + 1,
        chunkSize: chunk.length,
        platforms: chunk.map((a) => a.platform).join(', '),
        chunkThreadId,
      });
    }

    logger.info('[Scrape] All linked account scrape jobs enqueued', {
      userId: input.userId,
      operationIds,
      totalAccounts: input.linkedAccounts.length,
      jobCount: operationIds.length,
      chunksCreated: chunks.length,
      accountsPerChunk: CHUNK_SIZE,
    });

    return { operationIds };
  } catch (err) {
    logger.error('[Scrape] Failed to enqueue linked account scrape jobs', {
      userId: input.userId,
      enqueuedSoFar: operationIds.length,
      error: err instanceof Error ? err.message : String(err),
    });
    // Return partial results if at least one job enqueued successfully
    if (operationIds.length > 0) {
      return { operationIds };
    }
    return null;
  }
}
