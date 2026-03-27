/**
 * @fileoverview Approval Gate Service — Human-in-the-Loop (HITL)
 * @module @nxt1/backend/modules/agent/services
 *
 * The ApprovalGateService is an interceptor that sits between the Agent's
 * decision to call a tool and the actual tool execution.
 *
 * Flow:
 * ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
 * │ Agent decides │ ──► │ ApprovalGate     │ ──► │ Tool executes│
 * │ to call tool  │     │ (THIS FILE)      │     │ (if approved)│
 * └──────────────┘     └──────────────────┘     └──────────────┘
 *                              │
 *                              ▼ (if high-risk)
 *                     ┌──────────────────┐
 *                     │ Firestore doc    │
 *                     │ (approval req)   │
 *                     │       ↓          │
 *                     │ Push notification│
 *                     │ to user's phone  │
 *                     │       ↓          │
 *                     │ User taps        │
 *                     │ "Approve"/"Reject│
 *                     │       ↓          │
 *                     │ Worker resumes   │
 *                     └──────────────────┘
 *
 * Why this exists:
 * Agent X can draft emails, post to social media, and update profiles.
 * Without approval gates, the AI could send a terrible email to a D1 coach
 * and ruin the athlete's chances. HITL ensures the user has final say
 * over all high-stakes actions.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { AgentApprovalRequest, AgentApprovalStatus, AgentApprovalPolicy } from '@nxt1/core';
import { AGENT_APPROVAL_POLICIES, NOTIFICATION_TYPES } from '@nxt1/core';
import { dispatch } from '../../../services/notification.service.js';
import { logger } from '../../../utils/logger.js';

/** Firestore collection for approval request documents. */
const APPROVALS_COLLECTION = 'agentApprovalRequests' as const;

export class ApprovalGateService {
  constructor(private readonly db: Firestore) {}

  /**
   * Check whether a tool call requires user approval.
   * Called by the Worker/Agent right before executing a tool.
   *
   * @returns The approval policy if approval is required, or null if auto-approved.
   */
  getApprovalPolicy(toolName: string): AgentApprovalPolicy | null {
    const policy = AGENT_APPROVAL_POLICIES.find((p) => p.toolName === toolName);
    if (!policy || !policy.requiresApproval) return null;
    return policy;
  }

  /**
   * Create an approval request and pause the DAG.
   * Stores the request in Firestore so the frontend can render it and
   * sends a push notification to the user's device.
   *
   * @returns The created approval request (status = 'pending').
   */
  async requestApproval(params: {
    operationId: string;
    taskId: string;
    userId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    actionSummary: string;
    reasoning?: string;
    threadId?: string;
  }): Promise<AgentApprovalRequest> {
    const policy = this.getApprovalPolicy(params.toolName);

    const request: AgentApprovalRequest = {
      id: `approval_${crypto.randomUUID()}`,
      operationId: params.operationId,
      taskId: params.taskId,
      userId: params.userId,
      actionSummary: params.actionSummary,
      toolName: params.toolName,
      toolInput: params.toolInput,
      reasoning: params.reasoning,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresInMs: policy?.expiryMs ?? 86_400_000,
    };

    // Store in Firestore so the frontend can render and the resume route can read it
    await this.db
      .collection(APPROVALS_COLLECTION)
      .doc(request.id)
      .set({
        ...request,
        firestoreCreatedAt: FieldValue.serverTimestamp(),
      });

    logger.info('Approval request created', {
      approvalId: request.id,
      operationId: params.operationId,
      toolName: params.toolName,
      userId: params.userId,
    });

    // Send push notification via unified NotificationService
    try {
      await dispatch(this.db, {
        userId: params.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: 'Agent X needs your approval',
        body: params.actionSummary,
        deepLink: params.threadId
          ? `/agent-x?thread=${encodeURIComponent(params.threadId)}`
          : '/agent-x',
        data: {
          approvalId: request.id,
          operationId: params.operationId,
          toolName: params.toolName,
          ...(params.threadId ? { threadId: params.threadId } : {}),
        },
        source: { userName: 'Agent X' },
        priority: 'high',
      });
    } catch (notifyErr) {
      // Push is best-effort — don't fail the approval creation
      logger.warn('Failed to send approval push notification', {
        approvalId: request.id,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    return request;
  }

  /**
   * Resolve an approval request (called when user taps Approve/Reject).
   *
   * @returns The updated approval request with resolved status, or null if not found.
   */
  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    resolvedBy: string
  ): Promise<AgentApprovalRequest | null> {
    const docRef = this.db.collection(APPROVALS_COLLECTION).doc(approvalId);

    // Use a Firestore transaction to prevent TOCTOU races where two
    // concurrent resolution requests both read status === 'pending'.
    return this.db.runTransaction(async (txn) => {
      const doc = await txn.get(docRef);

      if (!doc.exists) {
        logger.warn('Approval request not found', { approvalId });
        return null;
      }

      const request = doc.data() as AgentApprovalRequest;

      // Ownership check: only the target user can resolve
      if (request.userId !== resolvedBy) {
        logger.warn('Approval ownership check failed', {
          approvalId,
          requestUserId: request.userId,
          resolvedBy,
        });
        return null;
      }

      // Prevent double-resolution (atomic within the transaction)
      if (request.status !== 'pending') {
        logger.warn('Approval already resolved', { approvalId, status: request.status });
        return request;
      }

      const now = new Date().toISOString();
      txn.update(docRef, {
        status: decision as AgentApprovalStatus,
        resolvedBy,
        resolvedAt: now,
      });

      logger.info('Approval resolved', {
        approvalId,
        decision,
        resolvedBy,
        operationId: request.operationId,
      });

      return {
        ...request,
        status: decision as AgentApprovalStatus,
        resolvedBy,
        resolvedAt: now,
      };
    });
  }

  /**
   * Get a pending approval request by ID.
   */
  async getApproval(approvalId: string): Promise<AgentApprovalRequest | null> {
    const doc = await this.db.collection(APPROVALS_COLLECTION).doc(approvalId).get();
    return doc.exists ? (doc.data() as AgentApprovalRequest) : null;
  }

  /**
   * Get all pending approvals for a user (for the approvals UI).
   */
  async getPendingApprovals(userId: string): Promise<AgentApprovalRequest[]> {
    const snapshot = await this.db
      .collection(APPROVALS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AgentApprovalRequest);
  }

  /**
   * Check for expired approval requests and handle them.
   * Called by a periodic cron job (e.g., every hour).
   */
  async processExpiredApprovals(): Promise<{ expired: number; autoApproved: number }> {
    const now = Date.now();
    const snapshot = await this.db
      .collection(APPROVALS_COLLECTION)
      .where('status', '==', 'pending')
      .get();

    let expiredCount = 0;
    let autoApprovedCount = 0;

    for (const doc of snapshot.docs) {
      const request = doc.data() as AgentApprovalRequest;
      const createdAtMs = new Date(request.createdAt).getTime();
      const expiresAtMs = createdAtMs + request.expiresInMs;

      if (now < expiresAtMs) continue; // Not yet expired

      const policy = this.getApprovalPolicy(request.toolName);

      if (policy?.autoApproveOnExpiry) {
        await doc.ref.update({
          status: 'auto_approved' satisfies AgentApprovalStatus,
          resolvedBy: 'auto',
          resolvedAt: new Date().toISOString(),
        });
        autoApprovedCount++;
        logger.info('Approval auto-approved on expiry', {
          approvalId: request.id,
          toolName: request.toolName,
        });
      } else {
        await doc.ref.update({
          status: 'expired' satisfies AgentApprovalStatus,
          resolvedAt: new Date().toISOString(),
        });
        expiredCount++;
        logger.info('Approval expired', {
          approvalId: request.id,
          toolName: request.toolName,
        });
      }
    }

    return { expired: expiredCount, autoApproved: autoApprovedCount };
  }
}
