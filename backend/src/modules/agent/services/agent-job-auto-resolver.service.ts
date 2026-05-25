import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload } from '@nxt1/core';
import { enqueueWithOutbox, OUTBOX_COLLECTION } from '../queue/outbox.service.js';
import type { AgentJobDocument, AgentJobRepository } from '../queue/job.repository.js';
import type { AgentQueueService } from '../queue/queue.service.js';
import {
  isAgentJobResolutionEmailEnabled,
  sendAgentJobResolutionEmail,
} from '../../../services/communications/agent-job-resolution-email.service.js';

export type AgentJobAutoResolveType =
  | 'openrouter_insufficient_credits'
  | 'job_timeout'
  | 'playbook_generation_unavailable';

const AGENT_JOB_AUTO_RESOLVE_TYPES = new Set<string>([
  'openrouter_insufficient_credits',
  'job_timeout',
  'playbook_generation_unavailable',
]);

export interface AgentJobAutoResolverOptions {
  readonly limit?: number;
  readonly lookbackDays?: number;
  readonly maxAttempts?: number;
  readonly environment?: 'staging' | 'production';
}

export interface AgentJobAutoResolverResult {
  readonly scanned: number;
  readonly eligible: number;
  readonly enqueued: number;
  readonly resolved: number;
  readonly failed: number;
  readonly skipped: number;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_LOOKBACK_DAYS = 21;
const DEFAULT_MAX_ATTEMPTS = 1;

export function classifyAgentJobAutoResolveType(
  error: string | null | undefined
): AgentJobAutoResolveType | null {
  const normalized = error?.trim().toLowerCase() ?? '';
  if (!normalized) return null;

  if (
    normalized.includes('openrouter streaming error 402') &&
    normalized.includes('insufficient credits')
  ) {
    return 'openrouter_insufficient_credits';
  }

  if (normalized.includes('job timed out') || normalized.includes('timed out')) {
    return 'job_timeout';
  }

  if (normalized.includes('playbook generation unavailable')) {
    return 'playbook_generation_unavailable';
  }

  return null;
}

function isAgentJobAutoResolveType(value: unknown): value is AgentJobAutoResolveType {
  return typeof value === 'string' && AGENT_JOB_AUTO_RESOLVE_TYPES.has(value);
}

export function buildAgentJobRetryPayload(params: {
  replayPayload: AgentJobPayload;
  originalOperationId: string;
  autoResolveType: AgentJobAutoResolveType;
  attempt: number;
}): AgentJobPayload {
  const context = { ...(params.replayPayload.context ?? {}) };
  delete context['idempotencyKey'];

  return {
    ...params.replayPayload,
    operationId: randomUUID(),
    sessionId: randomUUID(),
    context: {
      ...context,
      skipBilling: true,
      platformSponsoredRetry: true,
      rerunOfOperationId: params.originalOperationId,
      autoResolveType: params.autoResolveType,
      autoResolveAttempt: params.attempt,
      autoResolvedAt: new Date().toISOString(),
    },
  };
}

function isWithinLookback(createdAt: AgentJobDocument['createdAt'], lookbackDays: number): boolean {
  const createdAtMs = createdAt?.toMillis?.() ?? 0;
  if (createdAtMs <= 0) return false;
  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return createdAtMs >= cutoffMs;
}

export class AgentJobAutoResolverService {
  constructor(
    private readonly db: Firestore,
    private readonly queueService: AgentQueueService,
    private readonly jobRepository: AgentJobRepository
  ) {}

  async resolveFailedJobs(
    options: AgentJobAutoResolverOptions = {}
  ): Promise<AgentJobAutoResolverResult> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const environment = options.environment ?? 'production';

    const snapshot = await this.db
      .collection('AgentJobs')
      .where('status', '==', 'failed')
      .limit(limit)
      .get();

    let eligible = 0;
    let enqueued = 0;
    let resolved = 0;
    let failed = 0;
    let skipped = 0;

    for (const doc of snapshot.docs) {
      const job = doc.data() as AgentJobDocument;

      if (!isWithinLookback(job.createdAt, lookbackDays)) {
        skipped += 1;
        continue;
      }

      const autoResolveType = isAgentJobAutoResolveType(job.autoResolveType)
        ? job.autoResolveType
        : classifyAgentJobAutoResolveType(job.error ?? null);
      if (!autoResolveType) {
        skipped += 1;
        continue;
      }

      if (job.autoResolveStatus === 'resolved' || job.autoResolveStatus === 'retry_claimed') {
        if (job.autoResolveStatus === 'resolved') {
          await this.sendResolutionEmailIfNeeded(doc.ref, job);
        }
        skipped += 1;
        continue;
      }

      if (job.autoResolveStatus === 'retry_enqueued' && job.autoResolveRerunOperationId) {
        const rerunJob = await this.jobRepository.getById(job.autoResolveRerunOperationId);
        if (!rerunJob) {
          skipped += 1;
          continue;
        }

        if (rerunJob.status === 'completed') {
          await doc.ref.set(
            {
              autoResolveStatus: 'resolved',
              autoResolvedAt: FieldValue.serverTimestamp(),
              autoResolveError: null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          await this.sendResolutionEmailIfNeeded(doc.ref, job, rerunJob.operationId);
          resolved += 1;
          continue;
        }

        if (rerunJob.status === 'failed') {
          await doc.ref.set(
            {
              autoResolveStatus: 'retry_failed',
              autoResolveError: rerunJob.error ?? 'Automatic retry failed.',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          failed += 1;
          continue;
        }

        skipped += 1;
        continue;
      }

      const replayPayload = await this.resolveReplayPayload(job);
      if (!replayPayload) {
        await doc.ref.set(
          {
            autoResolveStatus: 'retry_failed',
            autoResolveType,
            autoResolveError: 'Replay payload missing for automatic retry.',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        failed += 1;
        continue;
      }

      const attempt = await this.claimRetryAttempt(doc.ref, autoResolveType, maxAttempts);
      if (attempt === null) {
        skipped += 1;
        continue;
      }

      eligible += 1;

      const retryPayload = buildAgentJobRetryPayload({
        replayPayload,
        originalOperationId: job.operationId,
        autoResolveType,
        attempt,
      });

      try {
        await this.jobRepository.create(retryPayload);
        await this.enqueueRetryPayload(retryPayload, environment);

        await doc.ref.set(
          {
            autoResolveStatus: 'retry_enqueued',
            autoResolveType,
            autoResolveAttempts: attempt,
            autoResolveLastAttemptAt: FieldValue.serverTimestamp(),
            autoResolveRerunOperationId: retryPayload.operationId,
            autoResolveError: null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        enqueued += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await doc.ref.set(
          {
            autoResolveStatus: 'retry_failed',
            autoResolveType,
            autoResolveError: message,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        failed += 1;
      }
    }

    return {
      scanned: snapshot.size,
      eligible,
      enqueued,
      resolved,
      failed,
      skipped,
    };
  }

  private async resolveReplayPayload(job: AgentJobDocument): Promise<AgentJobPayload | null> {
    if (job.replayPayload) return job.replayPayload;

    const outbox = await this.db.collection(OUTBOX_COLLECTION).doc(job.operationId).get();
    const payload = outbox.get('payload');
    if (isAgentJobPayload(payload)) return payload;

    const playbookPayload = buildPlaybookReplayPayloadFromJob(job);
    if (playbookPayload) return playbookPayload;

    return null;
  }

  private async enqueueRetryPayload(
    payload: AgentJobPayload,
    environment: 'staging' | 'production'
  ): Promise<void> {
    if (isPlaybookGenerationPayload(payload)) {
      await this.queueService.enqueuePlaybookGeneration(
        {
          operationId: payload.operationId,
          userId: payload.userId,
          skipBilling: true,
        },
        environment
      );
      return;
    }

    await enqueueWithOutbox(this.db, payload, environment, this.queueService);
  }

  private async sendResolutionEmailIfNeeded(
    ref: FirebaseFirestore.DocumentReference,
    job: AgentJobDocument,
    rerunOperationId?: string | null
  ): Promise<void> {
    if (!isAgentJobResolutionEmailEnabled()) return;

    const claimed = await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return false;

      const data = snapshot.data() as Partial<AgentJobDocument> | undefined;
      if (data?.autoResolveStatus !== 'resolved') return false;
      if (
        data.autoResolutionEmailStatus === 'sent' ||
        data.autoResolutionEmailStatus === 'sending'
      ) {
        return false;
      }

      tx.set(
        ref,
        {
          autoResolutionEmailStatus: 'sending',
          autoResolutionEmailError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return true;
    });

    if (!claimed) return;

    try {
      const result = await sendAgentJobResolutionEmail({
        db: this.db,
        userId: job.userId,
        operationId: job.operationId,
        rerunOperationId: rerunOperationId ?? job.autoResolveRerunOperationId ?? null,
        intent: job.intent,
      });

      await ref.set(
        {
          autoResolutionEmailStatus: result === 'sent' ? 'sent' : 'skipped',
          ...(result === 'sent'
            ? { autoResolutionEmailSentAt: FieldValue.serverTimestamp() }
            : { autoResolutionEmailError: result }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ref.set(
        {
          autoResolutionEmailStatus: 'failed',
          autoResolutionEmailFailedAt: FieldValue.serverTimestamp(),
          autoResolutionEmailError: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  private async claimRetryAttempt(
    ref: FirebaseFirestore.DocumentReference,
    autoResolveType: AgentJobAutoResolveType,
    maxAttempts: number
  ): Promise<number | null> {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return null;

      const data = snapshot.data() as Partial<AgentJobDocument> | undefined;
      if (data?.status !== 'failed') return null;
      if (
        data.autoResolveStatus === 'retry_claimed' ||
        data.autoResolveStatus === 'retry_enqueued' ||
        data.autoResolveStatus === 'resolved'
      ) {
        return null;
      }

      const attempts = data.autoResolveAttempts ?? 0;
      if (attempts >= maxAttempts) return null;

      const nextAttempt = attempts + 1;
      tx.set(
        ref,
        {
          autoResolveStatus: 'retry_claimed',
          autoResolveType,
          autoResolveAttempts: nextAttempt,
          autoResolveLastAttemptAt: FieldValue.serverTimestamp(),
          autoResolveError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return nextAttempt;
    });
  }
}

function isAgentJobPayload(value: unknown): value is AgentJobPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<AgentJobPayload>;
  return (
    typeof payload.operationId === 'string' &&
    typeof payload.userId === 'string' &&
    typeof payload.intent === 'string' &&
    typeof payload.sessionId === 'string' &&
    typeof payload.origin === 'string'
  );
}

function isPlaybookGenerationPayload(payload: AgentJobPayload): boolean {
  const context = payload.context ?? {};
  return (
    context['mode'] === 'playbook' ||
    payload.agent === 'strategy_coordinator' ||
    payload.intent.trim().toLowerCase() === 'generate weekly playbook'
  );
}

function buildPlaybookReplayPayloadFromJob(job: AgentJobDocument): AgentJobPayload | null {
  const intent = job.intent?.trim() ?? '';
  if (!intent) return null;

  const looksLikePlaybook =
    intent.toLowerCase() === 'generate weekly playbook' ||
    job.autoResolveType === 'playbook_generation_unavailable';
  if (!looksLikePlaybook) return null;

  return {
    operationId: job.operationId,
    userId: job.userId,
    intent,
    sessionId: randomUUID(),
    origin: isAgentJobOrigin(job.origin) ? job.origin : 'user',
    agent: 'strategy_coordinator',
    context: {
      mode: 'playbook',
    },
  };
}

function isAgentJobOrigin(value: unknown): value is AgentJobPayload['origin'] {
  return (
    value === 'user' ||
    value === 'system_cron' ||
    value === 'database_event' ||
    value === 'webhook' ||
    value === 'agent_chain'
  );
}
