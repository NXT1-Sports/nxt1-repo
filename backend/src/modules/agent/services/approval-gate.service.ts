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

import type { AgentApprovalRequest, AgentApprovalStatus, AgentApprovalPolicy } from '@nxt1/core';
import { AGENT_APPROVAL_POLICIES } from '@nxt1/core';

export class ApprovalGateService {
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

    // TODO: Store in Firestore: approvalRequests/{request.id}
    // await firestore.collection('approvalRequests').doc(request.id).set(request);

    // TODO: Send push notification to user
    // await pushNotification.send(params.userId, {
    //   title: 'Agent X needs your approval',
    //   body: params.actionSummary,
    //   data: { approvalId: request.id, operationId: params.operationId },
    // });

    return request;
  }

  /**
   * Resolve an approval request (called when user taps Approve/Reject).
   *
   * @returns The updated approval request with resolved status.
   */
  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    resolvedBy: string
  ): Promise<AgentApprovalRequest> {
    // TODO: Fetch from Firestore
    // const doc = await firestore.collection('approvalRequests').doc(approvalId).get();
    // const request = doc.data() as AgentApprovalRequest;

    const updatedRequest: AgentApprovalRequest = {
      // ...request,
      id: approvalId,
      operationId: '',
      taskId: '',
      userId: resolvedBy,
      actionSummary: '',
      toolName: '',
      toolInput: {},
      createdAt: new Date().toISOString(),
      expiresInMs: 86_400_000,
      status: decision as AgentApprovalStatus,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    };

    // TODO: Update Firestore document
    // await firestore.collection('approvalRequests').doc(approvalId).update({
    //   status: decision,
    //   resolvedBy,
    //   resolvedAt: new Date().toISOString(),
    // });

    // TODO: If approved, resume the Worker Queue for this operation
    // if (decision === 'approved') {
    //   await agentQueue.resume(updatedRequest.operationId);
    // }

    // TODO: If rejected, mark the operation task as skipped/failed
    // if (decision === 'rejected') {
    //   await agentQueue.failTask(updatedRequest.operationId, updatedRequest.taskId);
    // }

    return updatedRequest;
  }

  /**
   * Check for expired approval requests and handle them.
   * Called by a periodic cron job (e.g., every hour).
   */
  async processExpiredApprovals(): Promise<{ expired: number; autoApproved: number }> {
    // TODO: Query Firestore for pending approvals past their expiry time
    // const expired = await firestore.collection('approvalRequests')
    //   .where('status', '==', 'pending')
    //   .where('createdAt', '<', cutoffTimestamp)
    //   .get();

    const expiredCount = 0;
    const autoApprovedCount = 0;

    // For each expired request:
    // 1. Check if the policy allows auto-approve on expiry
    // 2. If yes → mark as 'auto_approved' and resume worker
    // 3. If no → mark as 'expired' and fail the task

    // for (const doc of expired.docs) {
    //   const request = doc.data() as AgentApprovalRequest;
    //   const policy = this.getApprovalPolicy(request.toolName);
    //
    //   if (policy?.autoApproveOnExpiry) {
    //     await this.resolveApproval(request.id, 'approved', 'auto');
    //     autoApprovedCount++;
    //   } else {
    //     await doc.ref.update({ status: 'expired' });
    //     expiredCount++;
    //   }
    // }

    return { expired: expiredCount, autoApproved: autoApprovedCount };
  }
}
