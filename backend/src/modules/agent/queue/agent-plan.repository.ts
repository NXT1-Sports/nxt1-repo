import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type {
  AgentOperationResult,
  AgentSavedPlanStatus,
  AgentTask,
  AgentTaskStatus,
} from '@nxt1/core';
import { logger } from '../../../utils/logger.js';
import { sanitizeForFirestore } from './job.repository.js';

const COLLECTION = 'AgentPlans' as const;
const JOB_COLLECTION = 'AgentJobs' as const;

export interface AgentPlanDocument {
  readonly planId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly originOperationId: string;
  readonly approvedExecutionOperationId?: string;
  readonly supersededByPlanId?: string;
  readonly version: number;
  readonly status: AgentSavedPlanStatus;
  readonly summary: string;
  readonly planHash: string;
  readonly tasks: readonly AgentTask[];
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly updatedAt?: string;
}

export interface CreatePlanDraftInput {
  readonly planId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly originOperationId: string;
  readonly version?: number;
  readonly status?: AgentSavedPlanStatus;
  readonly summary: string;
  readonly planHash: string;
  readonly tasks: readonly AgentTask[];
  readonly environment?: 'staging' | 'production';
}

export interface RevisePlanDraftInput {
  readonly existingPlan: AgentPlanDocument;
  readonly originOperationId: string;
  readonly summary: string;
  readonly planHash: string;
  readonly tasks: readonly AgentTask[];
  readonly environment?: 'staging' | 'production';
}

export class AgentPlanRepository {
  constructor(
    private readonly db: Firestore = getFirestore(),
    private readonly stagingDb?: Firestore
  ) {}

  async createDraft(input: CreatePlanDraftInput): Promise<AgentPlanDocument> {
    const now = new Date().toISOString();
    const doc: AgentPlanDocument = {
      planId: input.planId,
      userId: input.userId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      originOperationId: input.originOperationId,
      version: input.version ?? 1,
      status: input.status ?? 'draft',
      summary: input.summary,
      planHash: input.planHash,
      tasks: input.tasks,
      createdAt: now,
      updatedAt: now,
    };

    const firestore = this.getDb(input.environment);
    await firestore.collection(COLLECTION).doc(input.planId).set(sanitizeForFirestore(doc));
    await firestore
      .collection(JOB_COLLECTION)
      .doc(input.originOperationId)
      .set(
        sanitizeForFirestore({
          planId: input.planId,
          planStatus: doc.status,
          updatedAt: now,
        }),
        { merge: true }
      );

    return doc;
  }

  async getLatestRevisableByThread(
    userId: string,
    threadId: string,
    environment?: 'staging' | 'production'
  ): Promise<AgentPlanDocument | null> {
    const snapshot = await this.getDb(environment)
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('threadId', '==', threadId)
      .limit(25)
      .get();

    if (snapshot.empty) return null;

    const revisableStatuses: readonly AgentSavedPlanStatus[] = [
      'draft',
      'approved',
      'awaiting_approval',
    ];

    const candidates = snapshot.docs
      .map((doc) => doc.data() as AgentPlanDocument)
      .filter((plan) => revisableStatuses.includes(plan.status));

    if (candidates.length === 0) return null;

    return candidates.sort((a, b) => {
      const aTs = Date.parse(a.updatedAt ?? a.createdAt);
      const bTs = Date.parse(b.updatedAt ?? b.createdAt);
      return Number.isFinite(bTs) && Number.isFinite(aTs) ? bTs - aTs : 0;
    })[0] as AgentPlanDocument;
  }

  async reviseDraft(input: RevisePlanDraftInput): Promise<AgentPlanDocument> {
    const now = new Date().toISOString();
    const previousVersion = Number.isFinite(input.existingPlan.version)
      ? input.existingPlan.version
      : 1;
    const doc: AgentPlanDocument = {
      planId: input.existingPlan.planId,
      userId: input.existingPlan.userId,
      ...(input.existingPlan.threadId ? { threadId: input.existingPlan.threadId } : {}),
      originOperationId: input.originOperationId,
      version: previousVersion + 1,
      status: 'draft',
      summary: input.summary,
      planHash: input.planHash,
      tasks: input.tasks,
      createdAt: input.existingPlan.createdAt,
      updatedAt: now,
    };

    const firestore = this.getDb(input.environment);
    await firestore.collection(COLLECTION).doc(doc.planId).set(sanitizeForFirestore(doc));
    await firestore
      .collection(JOB_COLLECTION)
      .doc(input.originOperationId)
      .set(
        sanitizeForFirestore({
          planId: doc.planId,
          planStatus: doc.status,
          updatedAt: now,
        }),
        { merge: true }
      );

    return doc;
  }

  async getById(
    planId: string,
    environment?: 'staging' | 'production'
  ): Promise<AgentPlanDocument | null> {
    const snapshot = await this.getDb(environment).collection(COLLECTION).doc(planId).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as AgentPlanDocument;
  }

  async updateApprovalStatus(input: {
    readonly planId: string;
    readonly status: Extract<AgentSavedPlanStatus, 'approved' | 'cancelled' | 'superseded'>;
    readonly executionOperationId?: string;
    readonly supersededByPlanId?: string;
    readonly environment?: 'staging' | 'production';
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.getDb(input.environment)
      .collection(COLLECTION)
      .doc(input.planId)
      .set(
        sanitizeForFirestore({
          status: input.status,
          updatedAt: now,
          ...(input.status === 'approved' ? { approvedAt: now } : {}),
          ...(input.executionOperationId
            ? { approvedExecutionOperationId: input.executionOperationId }
            : {}),
          ...(input.supersededByPlanId ? { supersededByPlanId: input.supersededByPlanId } : {}),
        }),
        { merge: true }
      );
  }

  async markExecuting(input: {
    readonly planId: string;
    readonly executionOperationId: string;
    readonly environment?: 'staging' | 'production';
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.getDb(input.environment)
      .collection(COLLECTION)
      .doc(input.planId)
      .set(
        sanitizeForFirestore({
          status: 'executing' satisfies AgentSavedPlanStatus,
          approvedExecutionOperationId: input.executionOperationId,
          approvedAt: now,
          updatedAt: now,
        }),
        { merge: true }
      );
  }

  async syncExecutionSnapshot(input: {
    readonly planId: string;
    readonly tasks: readonly AgentTask[];
    readonly environment?: 'staging' | 'production';
    readonly executionOperationId?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.getDb(input.environment)
      .collection(COLLECTION)
      .doc(input.planId)
      .set(
        sanitizeForFirestore({
          tasks: input.tasks,
          updatedAt: now,
          status: derivePlanStatus(input.tasks),
          ...(input.executionOperationId
            ? { approvedExecutionOperationId: input.executionOperationId }
            : {}),
        }),
        { merge: true }
      );
  }

  async markTerminal(input: {
    readonly planId: string;
    readonly status: Extract<AgentSavedPlanStatus, 'completed' | 'failed'>;
    readonly tasks: readonly AgentTask[];
    readonly environment?: 'staging' | 'production';
    readonly executionOperationId?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.getDb(input.environment)
      .collection(COLLECTION)
      .doc(input.planId)
      .set(
        sanitizeForFirestore({
          status: input.status,
          tasks: input.tasks,
          updatedAt: now,
          ...(input.executionOperationId
            ? { approvedExecutionOperationId: input.executionOperationId }
            : {}),
        }),
        { merge: true }
      );
  }

  private getDb(environment?: 'staging' | 'production'): Firestore {
    if (environment === 'staging' && this.stagingDb) {
      return this.stagingDb;
    }
    return this.db;
  }
}

export function buildPlanTaskSnapshot(input: {
  readonly task: AgentTask;
  readonly result?: AgentOperationResult;
  readonly status?: AgentTaskStatus;
  readonly statusNote?: string;
}): AgentTask {
  const now = new Date().toISOString();
  return {
    ...input.task,
    status: input.status ?? input.task.status,
    ...(input.result?.summary ? { resultSummary: input.result.summary } : {}),
    ...(input.result?.data ? { result: input.result.data } : {}),
    ...(input.result?.artifacts ? { artifacts: input.result.artifacts } : {}),
    ...(input.statusNote ? { statusNote: input.statusNote } : {}),
    ...(input.status === 'failed' || input.status === 'blocked'
      ? { error: input.statusNote ?? input.task.error }
      : {}),
    updatedAt: now,
  };
}

function derivePlanStatus(tasks: readonly AgentTask[]): AgentSavedPlanStatus {
  if (tasks.some((task) => task.status === 'failed' || task.status === 'blocked')) {
    return 'failed';
  }
  if (tasks.some((task) => task.status === 'awaiting_tool_approval')) {
    return 'awaiting_approval';
  }
  if (tasks.every((task) => task.status === 'completed' || task.status === 'skipped')) {
    return 'completed';
  }
  if (tasks.some((task) => task.status === 'in_progress')) {
    return 'executing';
  }
  if (tasks.some((task) => task.status === 'pending')) {
    return 'approved';
  }
  logger.warn('[AgentPlanRepository] Falling back to approved plan status', {
    taskStatuses: tasks.map((task) => task.status),
  });
  return 'approved';
}
