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
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type {
  AgentApprovalReasonCode,
  AgentApprovalRequest,
  AgentApprovalStatus,
  AgentApprovalPolicy,
} from '@nxt1/core';
import { AGENT_APPROVAL_POLICIES, resolveAgentApprovalCopy } from '@nxt1/core';
import { dispatchAgentPush } from './agent-push-adapter.service.js';
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

const APPROVAL_RETENTION_TTL_DAYS = 30;

function approvalRecordTtlFromNow(days: number): FirebaseFirestore.Timestamp {
  return Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
}

export interface ApprovalRequirement {
  readonly policy: AgentApprovalPolicy;
  readonly reasonCode: AgentApprovalReasonCode;
  readonly actionSummary: string;
}

export class ApprovalGateService {
  constructor(private readonly db: Firestore) {}

  /**
   * Canonicalize a tool's input object before it is persisted in Firestore.
   *
   * The LLM sometimes generates aliased field names (e.g. `to` instead of
   * `toEmail`, `body` instead of `bodyHtml`). Stripping those down to the
   * single canonical field set keeps approval documents clean and ensures
   * the tool receives exactly what its Zod schema expects on resume.
   */
  private normalizeToolInput(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Record<string, unknown> {
    const collectUrlArray = (value: unknown): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim());
    };

    const firstString = (value: unknown): string | null => {
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
      if (Array.isArray(value)) {
        const candidate = value.find(
          (entry) => typeof entry === 'string' && entry.trim().length > 0
        );
        return typeof candidate === 'string' ? candidate.trim() : null;
      }
      return null;
    };

    const dedupe = (urls: readonly string[]): string[] => [...new Set(urls)];

    const isLikelyVideoUrl = (url: string): boolean => {
      const value = url.trim().toLowerCase();
      return (
        value.includes('/manifest/video.m3u8') || /\.(mp4|mov|m4v|webm|m3u8)(\?|#|$)/i.test(value)
      );
    };

    if (toolName === 'send_email') {
      return {
        userId: toolInput['userId'],
        toEmail: toolInput['toEmail'] ?? toolInput['to'],
        subject: toolInput['subject'],
        bodyHtml:
          toolInput['bodyHtml'] ??
          toolInput['body'] ??
          toolInput['bodyText'] ??
          toolInput['message'],
      };
    }

    if (toolName === 'batch_send_email') {
      const rawRecipients = Array.isArray(toolInput['recipients']) ? toolInput['recipients'] : [];
      const recipients = rawRecipients
        .map((recipient) => {
          if (typeof recipient === 'string') {
            return {
              toEmail: recipient,
              variables: {},
            };
          }

          if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
            return null;
          }

          const record = recipient as Record<string, unknown>;
          const variables =
            record['variables'] &&
            typeof record['variables'] === 'object' &&
            !Array.isArray(record['variables'])
              ? (record['variables'] as Record<string, unknown>)
              : {};

          return {
            toEmail: record['toEmail'] ?? record['to'],
            variables,
          };
        })
        .filter(
          (recipient): recipient is { toEmail: unknown; variables: Record<string, unknown> } =>
            recipient !== null
        );

      return {
        userId: toolInput['userId'],
        recipients,
        subjectTemplate: toolInput['subjectTemplate'] ?? toolInput['subject'],
        bodyHtmlTemplate:
          toolInput['bodyHtmlTemplate'] ??
          toolInput['bodyHtml'] ??
          toolInput['body'] ??
          toolInput['message'],
      };
    }

    if (toolName === 'write_team_post' || toolName === 'update_team_post') {
      const posts = Array.isArray(toolInput['posts']) ? toolInput['posts'] : [];
      const normalizedPosts = posts
        .map((post) => {
          if (!post || typeof post !== 'object' || Array.isArray(post)) return null;
          const p = post as Record<string, unknown>;

          const mediaUrls = dedupe([
            ...collectUrlArray(p['mediaUrls']),
            ...collectUrlArray(p['images']),
            ...collectUrlArray(p['imageUrls']),
            ...(firstString(p['videoUrl']) ? [firstString(p['videoUrl']) as string] : []),
            ...(firstString(p['video']) ? [firstString(p['video']) as string] : []),
          ]);

          const normalized: Record<string, unknown> = {
            ...(typeof p['type'] === 'string' ? { type: p['type'] } : {}),
            ...(typeof p['content'] === 'string' ? { content: p['content'] } : {}),
            ...(typeof p['title'] === 'string' ? { title: p['title'] } : {}),
            ...(typeof p['sportId'] === 'string' ? { sportId: p['sportId'] } : {}),
            ...(typeof p['isPinned'] === 'boolean' ? { isPinned: p['isPinned'] } : {}),
            ...(mediaUrls.length > 0 ? { mediaUrls } : {}),
          };

          return normalized;
        })
        .filter((post): post is Record<string, unknown> => post !== null);

      return {
        ...(typeof toolInput['teamId'] === 'string' ? { teamId: toolInput['teamId'] } : {}),
        ...(typeof toolInput['teamCode'] === 'string' ? { teamCode: toolInput['teamCode'] } : {}),
        posts: normalizedPosts,
      };
    }

    if (toolName === 'write_timeline_post' || toolName === 'update_timeline_post') {
      const rawImages = dedupe([
        ...collectUrlArray(toolInput['images']),
        ...collectUrlArray(toolInput['mediaUrls']),
        ...collectUrlArray(toolInput['imageUrls']),
      ]);

      const explicitVideoUrl =
        firstString(toolInput['videoUrl']) || firstString(toolInput['video']) || null;

      const images = rawImages.filter((url) => !isLikelyVideoUrl(url));
      const inferredVideoFromImages = rawImages.find((url) => isLikelyVideoUrl(url)) ?? null;
      const videoUrl = explicitVideoUrl ?? inferredVideoFromImages;

      return {
        ...(typeof toolInput['userId'] === 'string' ? { userId: toolInput['userId'] } : {}),
        ...(typeof toolInput['content'] === 'string' ? { content: toolInput['content'] } : {}),
        ...(typeof toolInput['type'] === 'string' ? { type: toolInput['type'] } : {}),
        ...(typeof toolInput['visibility'] === 'string'
          ? { visibility: toolInput['visibility'] }
          : {}),
        ...(typeof toolInput['teamId'] === 'string' ? { teamId: toolInput['teamId'] } : {}),
        ...(typeof toolInput['sportId'] === 'string' ? { sportId: toolInput['sportId'] } : {}),
        ...(images.length > 0 ? { images } : {}),
        ...(videoUrl ? { videoUrl } : {}),
      };
    }

    return toolInput;
  }

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

    const normalizedIncomingInput = this.normalizeToolInput(toolName, toolInput);
    const normalizedApprovedInput = this.normalizeToolInput(toolName, approval.toolInput);

    return (
      approval.userId === userId &&
      approval.toolName === toolName &&
      (approval.status === 'approved' || approval.status === 'auto_approved') &&
      isDeepStrictEqual(normalizedApprovedInput, normalizedIncomingInput)
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
    const normalizedInput = this.normalizeToolInput(params.toolName, params.toolInput);
    const requirement = this.getApprovalRequirement(params.toolName, normalizedInput);
    const policy = requirement?.policy ?? this.getApprovalPolicy(params.toolName);
    const fallbackCopy = resolveAgentApprovalCopy({
      toolName: params.toolName,
      toolInput: normalizedInput,
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
      ...(params.threadId ? { threadId: params.threadId } : {}),
      actionSummary: approvalCopy.actionSummary,
      reasonCode: approvalCopy.reasonCode,
      toolName: params.toolName,
      toolInput: normalizedInput,
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
        expiresAt: approvalRecordTtlFromNow(APPROVAL_RETENTION_TTL_DAYS),
        firestoreCreatedAt: FieldValue.serverTimestamp(),
        expiryPushSent: false,
      });

    logger.info('Approval request created', {
      approvalId: request.id,
      operationId: params.operationId,
      toolName: params.toolName,
      userId: params.userId,
    });

    // Send push notification via unified NotificationService
    try {
      await dispatchAgentPush(this.db, {
        kind: 'agent_needs_approval',
        userId: params.userId,
        operationId: params.operationId,
        threadId: params.threadId,
        approvalId: request.id,
        toolName: params.toolName,
        reason: 'needs_approval',
        title: fallbackCopy.notificationTitle,
        body: fallbackCopy.notificationBody,
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

  /**
   * Scan for pending approvals expiring within `thresholdMs` that have NOT yet
   * received an expiry warning push. Dispatches a push and marks them so the
   * cron does not fire again for the same approval.
   *
   * @param thresholdMs - Window before expiry in ms (default: 5 minutes).
   */
  async notifyExpiringSoon(thresholdMs = 300_000): Promise<{ notified: number }> {
    const now = Date.now();
    const snapshot = await this.db
      .collection(APPROVALS_COLLECTION)
      .where('status', '==', 'pending')
      .where('expiryPushSent', '==', false)
      .get();

    let notified = 0;

    for (const doc of snapshot.docs) {
      const request = doc.data() as AgentApprovalRequest & { expiryPushSent?: boolean };

      // Skip if already marked (handles race between concurrent cron invocations)
      if (request.expiryPushSent) continue;

      const createdAtMs = new Date(request.createdAt).getTime();
      const expiresAtMs = createdAtMs + request.expiresInMs;
      const remaining = expiresAtMs - now;

      // Only notify when within threshold and not already expired
      if (remaining <= 0 || remaining > thresholdMs) continue;

      const mins = Math.max(1, Math.round(remaining / 60_000));
      const copy = resolveAgentApprovalCopy({
        toolName: request.toolName,
        toolInput: request.toolInput as Record<string, unknown>,
      });

      try {
        await dispatchAgentPush(this.db, {
          kind: 'agent_approval_expiring_soon',
          userId: request.userId,
          operationId: request.operationId,
          threadId: request.threadId,
          approvalId: request.id,
          toolName: request.toolName,
          title: 'Approval Expiring Soon',
          body: `Your approval for "${copy.actionSummary}" expires in ${mins} minute${mins === 1 ? '' : 's'}.`,
          remainingMs: remaining,
        });

        // Mark so this approval is not notified again
        await doc.ref.update({ expiryPushSent: true });
        notified++;

        logger.info('Approval expiry push sent', {
          approvalId: request.id,
          toolName: request.toolName,
          remainingMs: remaining,
        });
      } catch (notifyErr) {
        logger.warn('Failed to send approval expiry push', {
          approvalId: request.id,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }

    return { notified };
  }

  // ── Session-Level Trust Grants ────────────────────────────────────────────

  private static readonly TRUST_GRANTS_COLLECTION = 'AgentSessionTrustGrants' as const;
  private static readonly SESSION_TRUST_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

  /**
   * Check whether the user has an active session trust grant for the given
   * tool's `sessionTrustGroup`. If a valid grant exists, the tool may be
   * auto-approved without showing the approval card.
   */
  async hasActiveTrustGrant(userId: string, sessionId: string, toolName: string): Promise<boolean> {
    const policy = this.getApprovalPolicy(toolName);
    if (!policy?.sessionTrustGroup) return false;

    const now = new Date().toISOString();
    const snapshot = await this.db
      .collection(ApprovalGateService.TRUST_GRANTS_COLLECTION)
      .where('userId', '==', userId)
      .where('sessionId', '==', sessionId)
      .where('trustGroup', '==', policy.sessionTrustGroup)
      .where('expiresAt', '>', now)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Write a session trust grant for the tool's `sessionTrustGroup`.
   * Called after the user approves an action and checks "Trust for this session".
   * The grant is valid for 2 hours from creation.
   *
   * @returns The created `AgentSessionTrustGrant`, or null when the tool has
   *          no `sessionTrustGroup` (e.g. critical-risk tools are not eligible).
   */
  async grantSessionTrust(
    userId: string,
    sessionId: string,
    toolName: string
  ): Promise<import('@nxt1/core').AgentSessionTrustGrant | null> {
    const policy = this.getApprovalPolicy(toolName);
    if (!policy?.sessionTrustGroup) return null;

    // Critical-risk tools are never eligible for session trust.
    if (policy.riskLevel === 'critical') return null;

    const now = Date.now();
    const grant: import('@nxt1/core').AgentSessionTrustGrant = {
      id: `grant_${crypto.randomUUID()}`,
      userId,
      sessionId,
      trustGroup: policy.sessionTrustGroup,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ApprovalGateService.SESSION_TRUST_TTL_MS).toISOString(),
    };

    await this.db
      .collection(ApprovalGateService.TRUST_GRANTS_COLLECTION)
      .doc(grant.id)
      .set({
        ...grant,
        firestoreCreatedAt: FieldValue.serverTimestamp(),
        // Firestore TTL field so old grants are garbage-collected automatically.
        ttlExpiresAt: Timestamp.fromMillis(now + ApprovalGateService.SESSION_TRUST_TTL_MS),
      });

    logger.info('Session trust grant created', {
      grantId: grant.id,
      userId,
      sessionId,
      trustGroup: policy.sessionTrustGroup,
      toolName,
    });

    return grant;
  }

  /**
   * Revoke all session trust grants for the given user + session.
   * Called on session end or when the user explicitly revokes trust.
   */
  async revokeSessionTrust(userId: string, sessionId: string): Promise<{ revoked: number }> {
    const snapshot = await this.db
      .collection(ApprovalGateService.TRUST_GRANTS_COLLECTION)
      .where('userId', '==', userId)
      .where('sessionId', '==', sessionId)
      .get();

    const batch = this.db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    logger.info('Session trust grants revoked', { userId, sessionId, revoked: snapshot.size });
    return { revoked: snapshot.size };
  }
}
