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
  /** Operation IDs for enqueued jobs (one per linked-account chunk). */
  readonly operationIds: readonly string[];
  /** First operation thread, retained for older clients that only understand one thread. */
  readonly threadId?: string;
  /** Exact operation-to-thread mappings for each chunked scrape job. */
  readonly operations: readonly {
    readonly operationId: string;
    readonly threadId?: string;
    readonly platforms: readonly string[];
  }[];
}

type ScrapeLinkedAccountOperation = ScrapeLinkedAccountsResult['operations'][number];

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
  const operations: ScrapeLinkedAccountOperation[] = [];
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

    // ─── Create ONE shared thread for the entire scrape session ────────────
    // Professional-app pattern: a single conversation row in the sidebar
    // regardless of how many fan-out chunk operations run underneath.
    // Chunks 2..N are tagged with parentOperationId so downstream surfaces
    // can treat them as child operations of the first chunk.
    const allPlatforms = input.linkedAccounts
      .map((a) => a.platform.trim())
      .filter(Boolean)
      .join(', ');
    const sharedPrompt = `Sync my connected accounts (${allPlatforms}). Target profile: ${profileTarget}. ${onboardingObjective} ${executionDirective}`;

    let sharedThreadId: string | undefined;
    if (chatService) {
      try {
        const { thread } = await chatService.startConversation({
          userId: input.userId,
          prompt: sharedPrompt,
          category: 'analytics',
          origin: 'database_event',
        });
        sharedThreadId = thread.id;

        if (llmService) {
          try {
            const generatedTitle = await chatService.generateTitleFromPromptOnly(
              sharedPrompt,
              llmService
            );
            if (generatedTitle) {
              await chatService.applyGeneratedThreadTitle(
                sharedThreadId,
                input.userId,
                sharedPrompt,
                generatedTitle
              );
            }
          } catch (titleErr) {
            logger.warn('[Scrape] Failed to apply prompt-only thread title', {
              userId: input.userId,
              threadId: sharedThreadId,
              error: titleErr instanceof Error ? titleErr.message : String(titleErr),
            });
          }
        }

        logger.info('[Scrape] Shared scrape thread created', {
          userId: input.userId,
          threadId: sharedThreadId,
          platforms: allPlatforms,
          chunkCount: chunks.length,
        });
      } catch (err) {
        logger.warn('[Scrape] Failed to create shared scrape thread', {
          userId: input.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let parentScrapeOperationId: string | undefined;

    // ─── Create jobs for each chunk (each gets its own operationId + sessionId) ──
    // All chunks share the same threadId. Chunks 2..N are children of chunk 1.
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const operationId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const platforms = chunk.map((account) => account.platform.trim()).filter(Boolean);
      const chunkThreadId = sharedThreadId;
      const isChildChunk = chunkIndex > 0;

      // Build intent + URL list for THIS chunk only
      const urlList = chunk
        .map((account) => `- ${account.platform}: ${account.profileUrl}`)
        .join('\n');
      const platformList = platforms.join(', ');
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
          ...(isChildChunk && parentScrapeOperationId
            ? { parentOperationId: parentScrapeOperationId }
            : {}),
          ...(input.teamId ? { teamId: input.teamId } : {}),
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        },
      };

      await repo.withDb(db).create(payload);
      await enqueueWithOutbox(db, payload, environment, queueService);
      operationIds.push(operationId);
      if (!parentScrapeOperationId) {
        parentScrapeOperationId = operationId;
      }
      operations.push({
        operationId,
        platforms,
        ...(chunkThreadId ? { threadId: chunkThreadId } : {}),
      });

      // Chunk-specific thread is already included in the context above
      // No need to patch separately

      logger.info('[Scrape] Linked account scrape job enqueued (chunked)', {
        userId: input.userId,
        operationId,
        chunkIndex: chunkIndex + 1,
        chunkSize: chunk.length,
        platforms: platformList,
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

    return {
      operationIds,
      operations,
      ...(operations[0]?.threadId ? { threadId: operations[0].threadId } : {}),
    };
  } catch (err) {
    logger.error('[Scrape] Failed to enqueue linked account scrape jobs', {
      userId: input.userId,
      enqueuedSoFar: operationIds.length,
      error: err instanceof Error ? err.message : String(err),
    });
    // Return partial results if at least one job enqueued successfully
    if (operationIds.length > 0) {
      return {
        operationIds,
        operations,
        ...(operations[0]?.threadId ? { threadId: operations[0].threadId } : {}),
      };
    }
    return null;
  }
}
