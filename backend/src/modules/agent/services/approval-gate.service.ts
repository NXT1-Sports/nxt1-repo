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

import { isDeepStrictEqual } from 'node:util';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  AgentApprovalReasonCode,
  AgentApprovalRequest,
  AgentApprovalStatus,
  AgentApprovalPolicy,
} from '@nxt1/core';
import { AGENT_APPROVAL_POLICIES, NOTIFICATION_TYPES, resolveAgentApprovalCopy } from '@nxt1/core';
import { dispatch } from '../../../services/communications/notification.service.js';
import { getAgentAnalyticsGate } from './agent-analytics-gate.js';
import { logger } from '../../../utils/logger.js';

/** Firestore collection for approval request documents. */
const APPROVALS_COLLECTION = 'AgentApprovalRequests' as const;

const LIVE_VIEW_DESTRUCTIVE_KEYWORDS =
  /\b(submit|send|confirm|purchase|buy|place\s+order|delete|remove|pay|checkout|sign\s+up|register|apply|publish|post|transfer|authorize|approve)\b/i;

const LIVE_VIEW_APPROVAL_POLICY: AgentApprovalPolicy = {
  toolName: 'interact_with_live_view',
  requiresApproval: true,
  autoApproveOnExpiry: false,
  expiryMs: 86_400_000,
  riskLevel: 'high',
};

export interface ApprovalRequirement {
  readonly policy: AgentApprovalPolicy;
  readonly reasonCode: AgentApprovalReasonCode;
  readonly actionSummary: string;
}

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
   * Determine whether a specific tool invocation requires approval.
   * Some tools always require approval (`send_email`), while others only
   * require approval conditionally (for example destructive live-view actions).
   */
  getApprovalRequirement(
    toolName: string,
    toolInput: Record<string, unknown>
  ): ApprovalRequirement | null {
    const staticPolicy = this.getApprovalPolicy(toolName);
    if (staticPolicy) {
      const copy = resolveAgentApprovalCopy({
        toolName,
        toolInput,
      });
      return {
        policy: staticPolicy,
        reasonCode: copy.reasonCode,
        actionSummary: copy.actionSummary,
      };
    }

    if (toolName === 'interact_with_live_view') {
      const prompt = typeof toolInput['prompt'] === 'string' ? toolInput['prompt'].trim() : '';
      if (!prompt || !LIVE_VIEW_DESTRUCTIVE_KEYWORDS.test(prompt)) {
        return null;
      }

      const copy = resolveAgentApprovalCopy({
        toolName,
        toolInput,
      });
      return {
        policy: LIVE_VIEW_APPROVAL_POLICY,
        reasonCode: copy.reasonCode,
        actionSummary: copy.actionSummary,
      };
    }

    return null;
  }

  /**
   * Verify that an approval has already been granted for the exact pending tool call.
   */
  async isApprovalGranted(
    approvalId: string,
    userId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<boolean> {
    const approval = await this.getApproval(approvalId);
    if (!approval) return false;

    return (
      approval.userId === userId &&
      approval.toolName === toolName &&
      (approval.status === 'approved' || approval.status === 'auto_approved') &&
      isDeepStrictEqual(approval.toolInput, toolInput)
    );
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
    const requirement = this.getApprovalRequirement(params.toolName, params.toolInput);
    const policy = requirement?.policy ?? this.getApprovalPolicy(params.toolName);
    const fallbackCopy = resolveAgentApprovalCopy({
      toolName: params.toolName,
      toolInput: params.toolInput,
    });
    const approvalCopy = requirement ?? {
      policy: policy ?? LIVE_VIEW_APPROVAL_POLICY,
      reasonCode: fallbackCopy.reasonCode,
      actionSummary: fallbackCopy.actionSummary,
    };

    const request: AgentApprovalRequest = {
      id: `approval_${crypto.randomUUID()}`,
      operationId: params.operationId,
      taskId: params.taskId,
      userId: params.userId,
      actionSummary: approvalCopy.actionSummary,
      reasonCode: approvalCopy.reasonCode,
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

    // Track the approval-pending event in the user's analytics record (fire-and-forget)
    getAgentAnalyticsGate().trackApprovalRequested({
      userId: params.userId,
      operationId: params.operationId,
      toolName: params.toolName,
      threadId: params.threadId,
    });

    // Send push notification via unified NotificationService
    try {
      await dispatch(this.db, {
        userId: params.userId,
        type: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
        title: fallbackCopy.notificationTitle,
        body: fallbackCopy.notificationBody,
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

      // Track the approval decision in the user's analytics record (fire-and-forget)
      getAgentAnalyticsGate().trackApprovalResolved({
        userId: request.userId,
        operationId: request.operationId,
        toolName: request.toolName,
        decision,
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
