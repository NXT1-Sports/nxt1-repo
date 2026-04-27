/**
 * @fileoverview Agent Job <-> Thread Link Reconciliation Service
 *
 * Repairs missing Firestore `AgentJobs.threadId` links using MongoDB
 * `agentMessages.operationId -> threadId` mappings.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { AgentMessageModel } from '../../../models/agent/agent-message.model.js';
import { logger } from '../../../utils/logger.js';

const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_MESSAGE_SCAN_LIMIT = 5_000;
const DEFAULT_REPAIR_LIMIT = 500;
const DEFAULT_BATCH_SIZE = 200;

type CandidateLink = {
  readonly operationId: string;
  readonly threadId: string;
  readonly userId: string;
  readonly createdAt: string;
};

export interface LinkReconciliationOptions {
  readonly lookbackDays?: number;
  readonly messageScanLimit?: number;
  readonly repairLimit?: number;
  readonly batchSize?: number;
  readonly repairMismatchedThreadId?: boolean;
}

export interface LinkReconciliationResult {
  readonly scannedMessages: number;
  readonly candidateLinks: number;
  readonly jobDocsChecked: number;
  readonly repaired: number;
  readonly skippedMissingJob: number;
  readonly skippedMissingThreadOnCandidate: number;
  readonly skippedAlreadyLinked: number;
  readonly skippedUserMismatch: number;
  readonly skippedMismatchedThreadId: number;
  readonly hitRepairLimit: boolean;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  const parsed = Math.floor(value as number);
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size) as T[]);
  }
  return chunks;
}

export class AgentLinkReconciliationService {
  async reconcileJobThreadLinks(
    db: Firestore,
    options: LinkReconciliationOptions = {}
  ): Promise<LinkReconciliationResult> {
    const lookbackDays = clampInt(options.lookbackDays, DEFAULT_LOOKBACK_DAYS, 1, 90);
    const messageScanLimit = clampInt(
      options.messageScanLimit,
      DEFAULT_MESSAGE_SCAN_LIMIT,
      100,
      20_000
    );
    const repairLimit = clampInt(options.repairLimit, DEFAULT_REPAIR_LIMIT, 1, 5_000);
    const batchSize = clampInt(options.batchSize, DEFAULT_BATCH_SIZE, 20, 300);
    const repairMismatchedThreadId = options.repairMismatchedThreadId === true;

    const cutoffIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const recentMessages = await AgentMessageModel.find({
      role: 'assistant',
      operationId: { $exists: true, $type: 'string', $ne: '' },
      createdAt: { $gte: cutoffIso },
    })
      .select('operationId threadId userId createdAt')
      .sort({ createdAt: -1 })
      .limit(messageScanLimit)
      .lean()
      .exec();

    const operationToCandidate = new Map<string, CandidateLink>();
    let skippedMissingThreadOnCandidate = 0;

    for (const doc of recentMessages) {
      const operationId = typeof doc.operationId === 'string' ? doc.operationId.trim() : '';
      if (!operationId || operationToCandidate.has(operationId)) continue;

      const threadId = typeof doc.threadId === 'string' ? doc.threadId.trim() : '';
      const userId = typeof doc.userId === 'string' ? doc.userId.trim() : '';

      if (!threadId || !userId) {
        skippedMissingThreadOnCandidate += 1;
        continue;
      }

      operationToCandidate.set(operationId, {
        operationId,
        threadId,
        userId,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : '',
      });
    }

    const operationIds = [...operationToCandidate.keys()];
    const refChunks = chunkArray(
      operationIds.map((operationId) => db.collection('AgentJobs').doc(operationId)),
      batchSize
    );

    let repaired = 0;
    let jobDocsChecked = 0;
    let skippedMissingJob = 0;
    let skippedAlreadyLinked = 0;
    let skippedUserMismatch = 0;
    let skippedMismatchedThreadId = 0;
    let hitRepairLimit = false;

    for (const refChunk of refChunks) {
      if (repaired >= repairLimit) {
        hitRepairLimit = true;
        break;
      }

      const snapshots = await db.getAll(...refChunk);

      for (const snap of snapshots) {
        if (repaired >= repairLimit) {
          hitRepairLimit = true;
          break;
        }

        jobDocsChecked += 1;
        if (!snap.exists) {
          skippedMissingJob += 1;
          continue;
        }

        const data = snap.data() as Record<string, unknown>;
        const candidate = operationToCandidate.get(snap.id);
        if (!candidate) continue;

        const jobUserId = typeof data['userId'] === 'string' ? (data['userId'] as string) : '';
        if (!jobUserId || jobUserId !== candidate.userId) {
          skippedUserMismatch += 1;
          continue;
        }

        const existingThreadId =
          typeof data['threadId'] === 'string' ? (data['threadId'] as string).trim() : '';
        if (existingThreadId === candidate.threadId) {
          skippedAlreadyLinked += 1;
          continue;
        }

        if (existingThreadId && !repairMismatchedThreadId) {
          skippedMismatchedThreadId += 1;
          continue;
        }

        await snap.ref.update({
          threadId: candidate.threadId,
          updatedAt: new Date(),
        });
        repaired += 1;
      }
    }

    const result: LinkReconciliationResult = {
      scannedMessages: recentMessages.length,
      candidateLinks: operationToCandidate.size,
      jobDocsChecked,
      repaired,
      skippedMissingJob,
      skippedMissingThreadOnCandidate,
      skippedAlreadyLinked,
      skippedUserMismatch,
      skippedMismatchedThreadId,
      hitRepairLimit,
    };

    logger.info('Agent job-thread reconciliation completed', {
      lookbackDays,
      messageScanLimit,
      repairLimit,
      batchSize,
      repairMismatchedThreadId,
      ...result,
    });

    return result;
  }
}
