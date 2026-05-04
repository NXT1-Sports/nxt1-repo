import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import type { AgentMessage, AgentYieldState, AgentXAttachment } from '@nxt1/core';
import type { AgentXRichCard, AgentXStreamMediaEvent, AgentXToolStep } from '@nxt1/core/ai';
import { AgentXStreamRegistryService } from '../../services/agent-x-stream-registry.service';
import {
  AgentXOperationEventService,
  type OperationEventSubscription,
} from '../../services/agent-x-operation-event.service';
import { AgentXService } from '../../services/agent-x.service';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import type {
  MessageAttachment,
  PendingFile,
  OperationMessage,
} from './agent-x-operation-chat.models';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import {
  AgentXOperationChatTransportFacade,
  type StreamTurnWatermark,
} from './agent-x-operation-chat-transport.facade';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';

type OperationStatus =
  | 'processing'
  | 'complete'
  | 'error'
  | 'paused'
  | 'awaiting_input'
  | 'awaiting_approval'
  | null;

export interface AgentXOperationChatSessionFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly threadId: () => string;
  readonly resumeOperationId: () => string;
  readonly initialMessage: () => string;
  readonly initialFiles: () => readonly PendingFile[];
  readonly errorMessage: () => string | null;
  readonly threadMode: WritableSignal<boolean>;
  readonly inputValue: WritableSignal<string>;
  readonly loading: WritableSignal<boolean>;
  readonly latestProgressLabel: WritableSignal<string | null>;
  readonly resolvedThreadId: WritableSignal<string | null>;
  readonly activeYieldState: WritableSignal<AgentYieldState | null>;
  readonly yieldResolved: WritableSignal<boolean>;
  setActivityPhase(
    phase:
      | 'idle'
      | 'sending'
      | 'connected'
      | 'streaming'
      | 'running_tool'
      | 'waiting_delta'
      | 'reconnecting'
      | 'paused'
      | 'awaiting_input'
      | 'awaiting_approval'
      | 'completed'
      | 'failed'
      | 'cancelled',
    label?: string | null
  ): void;
  markActivityPulse(label?: string | null): void;
  getOperationStatus(): OperationStatus;
  setOperationStatus(status: OperationStatus): void;
  getCurrentOperationId(): string | null;
  setCurrentOperationId(operationId: string | null): void;
  getActiveStream(): AbortController | null;
  setActiveStream(controller: AbortController | null): void;
  getActiveFirestoreSub(): OperationEventSubscription | null;
  setActiveFirestoreSub(subscription: OperationEventSubscription | null): void;
  getShadowFirestoreSub(): OperationEventSubscription | null;
  setShadowFirestoreSub(subscription: OperationEventSubscription | null): void;
  getStreamTurnWatermark(): StreamTurnWatermark | null;
  setStreamTurnWatermark(watermark: StreamTurnWatermark | null): void;
  hasUserSent(): boolean;
  markUserMessageSent(): void;
  send(options?: {
    text?: string;
    selectedAction?: { action: string; toolName: string; label?: string } | null;
    preserveDraft?: boolean;
  }): Promise<void>;
  attachToResumedOperation(params: {
    operationId: string;
    threadId?: string;
    afterSeq?: number;
  }): Promise<void>;
  uid(): string;
}

@Injectable()
export class AgentXOperationChatSessionFacade {
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatSession');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);
  private readonly streamRegistry = inject(AgentXStreamRegistryService);
  private readonly operationEventService = inject(AgentXOperationEventService);
  private readonly agentXService = inject(AgentXService);
  private readonly messageFacade = inject(AgentXOperationChatMessageFacade);
  private readonly transportFacade = inject(AgentXOperationChatTransportFacade);
  private readonly attachmentsFacade = inject(AgentXOperationChatAttachmentsFacade);

  readonly initialMessageSent = signal(false);

  private host: AgentXOperationChatSessionFacadeHost | null = null;

  private normalizeMessageContent(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private stepSignature(steps: readonly AgentXToolStep[] | undefined): string {
    if (!steps || steps.length === 0) return '';
    return steps.map((step) => `${step.id}|${step.label}|${step.status}`).join('||');
  }

  private cardSignature(cards: readonly AgentXRichCard[] | undefined): string {
    if (!cards || cards.length === 0) return '';
    return cards.map((card) => JSON.stringify(card)).join('||');
  }

  private mediaSignature(message: OperationMessage): string {
    const attachmentSignature = (message.attachments ?? [])
      .map((attachment) => `${attachment.type}|${attachment.url}`)
      .sort()
      .join('||');
    return `${message.imageUrl ?? ''}|${message.videoUrl ?? ''}|${attachmentSignature}`;
  }

  private inferMediaTypeFromUrl(url: string): 'image' | 'video' | null {
    const lowerUrl = url.toLowerCase();
    if (/(\.png|\.jpe?g|\.gif|\.webp|\.avif|\.bmp|\.svg)(?:\?|#|$)/i.test(lowerUrl)) {
      return 'image';
    }
    if (
      /(\.mp4|\.mov|\.m4v|\.webm|\.avi|\.mkv|\.m3u8)(?:\?|#|$)/i.test(lowerUrl) ||
      /videodelivery\.net\//i.test(lowerUrl)
    ) {
      return 'video';
    }

    return null;
  }

  private extractMediaUrlsFromResultData(resultData: AgentMessage['resultData']): string[] {
    if (!resultData) return [];

    const mediaUrls = new Set<string>();
    const pushUrl = (value: unknown): void => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!/^https?:\/\//i.test(trimmed)) return;
      mediaUrls.add(trimmed);
    };

    for (const key of ['persistedMediaUrls', 'mediaUrls', 'imageUrls', 'videoUrls'] as const) {
      const value = resultData[key];
      if (!Array.isArray(value)) continue;
      for (const url of value) pushUrl(url);
    }

    const files = resultData['files'];
    if (Array.isArray(files)) {
      for (const file of files) {
        if (!file || typeof file !== 'object') continue;
        const record = file as Record<string, unknown>;
        pushUrl(record['url']);
        pushUrl(record['downloadUrl']);
      }
    }

    return [...mediaUrls];
  }

  private mapPersistedAttachment(attachment: AgentXAttachment): {
    url: string;
    name: string;
    type: 'image' | 'video' | 'doc' | 'app';
    platform?: string;
    faviconUrl?: string;
  } {
    const mappedType: 'image' | 'video' | 'doc' | 'app' =
      attachment.type === 'image'
        ? 'image'
        : attachment.type === 'video'
          ? 'video'
          : attachment.type === 'app'
            ? 'app'
            : 'doc';

    return {
      url: attachment.url,
      name: attachment.name,
      type: mappedType,
      ...(attachment.platform ? { platform: attachment.platform } : {}),
      ...(attachment.faviconUrl ? { faviconUrl: attachment.faviconUrl } : {}),
    };
  }

  private collectMessageMedia(message: AgentMessage): {
    imageUrl?: string;
    videoUrl?: string;
    attachments?: OperationMessage['attachments'];
  } {
    const explicitImageUrl =
      typeof message.resultData?.['imageUrl'] === 'string'
        ? (message.resultData['imageUrl'] as string)
        : undefined;
    const explicitVideoUrl =
      typeof message.resultData?.['videoUrl'] === 'string'
        ? (message.resultData['videoUrl'] as string)
        : typeof message.resultData?.['outputUrl'] === 'string'
          ? (message.resultData['outputUrl'] as string)
          : undefined;

    const persistedAttachments = (message.attachments ?? []).map((attachment) =>
      this.mapPersistedAttachment(attachment as AgentXAttachment)
    );
    const attachmentKeySet = new Set(
      persistedAttachments.map((attachment) => `${attachment.type}|${attachment.url}`)
    );

    const resultDataAttachments = this.extractMediaUrlsFromResultData(message.resultData)
      .map((url, index) => {
        const mediaType = this.inferMediaTypeFromUrl(url);
        if (!mediaType) return null;
        return {
          url,
          name:
            mediaType === 'video' ? `media-video-${index + 1}.mp4` : `media-image-${index + 1}.jpg`,
          type: mediaType,
        } as const;
      })
      .filter(
        (attachment): attachment is { url: string; name: string; type: 'image' | 'video' } =>
          attachment !== null
      )
      .filter((attachment) => {
        const key = `${attachment.type}|${attachment.url}`;
        if (attachmentKeySet.has(key)) return false;
        attachmentKeySet.add(key);
        return true;
      });

    const attachments = [...persistedAttachments, ...resultDataAttachments];
    const firstImageUrl =
      explicitImageUrl ?? attachments.find((attachment) => attachment.type === 'image')?.url;
    const firstVideoUrl =
      explicitVideoUrl ?? attachments.find((attachment) => attachment.type === 'video')?.url;

    return {
      ...(firstImageUrl ? { imageUrl: firstImageUrl } : {}),
      ...(firstVideoUrl ? { videoUrl: firstVideoUrl } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  }

  private mergeLiveMediaIntoTypingMessage(media: AgentXStreamMediaEvent): void {
    this.messageFacade.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== 'typing') return message;

        const mediaType: 'image' | 'video' = media.type === 'video' ? 'video' : 'image';
        const existingAttachments = [...(message.attachments ?? [])];
        const alreadyPresent = existingAttachments.some(
          (attachment) => attachment.url === media.url && attachment.type === mediaType
        );
        const newAttachment: MessageAttachment = {
          url: media.url,
          type: mediaType,
          name: mediaType === 'video' ? 'stream-video.mp4' : 'stream-image.jpg',
        };
        const nextAttachments = alreadyPresent
          ? existingAttachments
          : [...existingAttachments, newAttachment];

        return {
          ...message,
          ...(mediaType === 'image' && !message.imageUrl ? { imageUrl: media.url } : {}),
          ...(mediaType === 'video' && !message.videoUrl ? { videoUrl: media.url } : {}),
          ...(nextAttachments.length > 0 ? { attachments: nextAttachments } : {}),
        };
      })
    );
  }

  private dedupeConsecutiveAssistantMessages(
    messages: readonly OperationMessage[]
  ): OperationMessage[] {
    const deduped: OperationMessage[] = [];

    for (const message of messages) {
      const previous = deduped[deduped.length - 1];
      if (!previous) {
        deduped.push(message);
        continue;
      }

      if (message.role !== 'assistant' || previous.role !== 'assistant') {
        deduped.push(message);
        continue;
      }

      const sameOperation = (message.operationId ?? '') === (previous.operationId ?? '');
      const sameContent =
        this.normalizeMessageContent(message.content) ===
        this.normalizeMessageContent(previous.content);
      const sameSteps = this.stepSignature(message.steps) === this.stepSignature(previous.steps);
      const sameCards = this.cardSignature(message.cards) === this.cardSignature(previous.cards);
      const sameMedia = this.mediaSignature(message) === this.mediaSignature(previous);

      if (sameOperation && sameContent && sameSteps && sameCards && sameMedia) {
        continue;
      }

      deduped.push(message);
    }

    return deduped;
  }

  /**
   * Phase-aware projection: given the raw persisted rows for a thread,
   * suppress `assistant_partial` rows for any `operationId` that already
   * has an `assistant_final` row.
   *
   * Also handles **legacy rows** (written before `semanticPhase` was added)
   * via a richness-based heuristic: when multiple untagged assistant rows
   * share the same `operationId`, only the richest one is kept. "Richness" is
   * ranked as: has resultData > has steps > has toolCalls > longest content.
   * The richest row is always the final persist (worker writes it last with full
   * metadata); the earlier partial-snapshot row has none of those fields.
   *
   * This is the root fix for the pause/resume double-bubble bug:
   *   1. Job pauses  → worker writes partial snapshot (no steps/resultData)
   *   2. User resumes → job completes → worker writes final row (full metadata)
   *   3. On next thread load both rows existed → two visible bubbles ← FIXED HERE
   *
   * `assistant_yield` rows are never suppressed — they carry distinct
   * user-facing prompts that the user must respond to.
   */
  private resolveCanonicalAssistantRows(items: readonly AgentMessage[]): readonly AgentMessage[] {
    const isChatPrefixedOperationId = (value: string | undefined): boolean =>
      typeof value === 'string' && value.startsWith('chat-');

    // ── Pass 1: phase-tagged rows (new writes) ────────────────────────────
    const finalOperationIds = new Set<string>();
    let lastBareFinalIndex = -1;
    items.forEach((item, index) => {
      if (
        item.role === 'assistant' &&
        item.semanticPhase === 'assistant_final' &&
        item.operationId
      ) {
        finalOperationIds.add(item.operationId);
        if (!isChatPrefixedOperationId(item.operationId)) {
          lastBareFinalIndex = Math.max(lastBareFinalIndex, index);
        }
      }
    });

    // ── Pass 2: collapse assistant_tool_call rows (no final exists) ───────
    // When no assistant_final exists for an operationId, keep only the LAST
    // assistant_tool_call row per operationId. Earlier turns represent abandoned
    // ReAct iterations and must not render as separate bubbles on replay.
    // Items arrive in chronological order, so walking forward gives last-wins.
    const toolCallSuppressedIds = new Set<string>();
    const toolCallLastSeen = new Map<string, string>(); // operationId → id of latest row
    for (const item of items) {
      if (
        item.role === 'assistant' &&
        item.semanticPhase === 'assistant_tool_call' &&
        item.operationId &&
        !finalOperationIds.has(item.operationId)
      ) {
        const prev = toolCallLastSeen.get(item.operationId);
        if (prev) toolCallSuppressedIds.add(prev);
        toolCallLastSeen.set(item.operationId, item.id);
      }
    }

    // ── Pass 3: legacy rows (no semanticPhase) ───────────────────────────
    // Collect operationIds that appear on multiple untagged assistant rows.
    const legacyMultiMap = new Map<string, AgentMessage[]>();
    for (const item of items) {
      if (
        item.role === 'assistant' &&
        !item.semanticPhase &&
        item.operationId &&
        !finalOperationIds.has(item.operationId)
      ) {
        const bucket = legacyMultiMap.get(item.operationId) ?? [];
        bucket.push(item);
        legacyMultiMap.set(item.operationId, bucket);
      }
    }

    // For each legacy operationId with >1 rows, pick the richest one to keep.
    const legacySuppressedIds = new Set<string>();
    for (const [, bucket] of legacyMultiMap) {
      if (bucket.length < 2) continue;
      const richest = bucket.reduce((best, candidate) => {
        return this.assistantRowRichness(candidate) >= this.assistantRowRichness(best)
          ? candidate
          : best;
      });
      for (const row of bucket) {
        if (row.id !== richest.id) legacySuppressedIds.add(row.id);
      }
    }

    if (
      finalOperationIds.size === 0 &&
      toolCallSuppressedIds.size === 0 &&
      legacySuppressedIds.size === 0
    )
      return items;

    return items.filter((item, index) => {
      if (item.role !== 'assistant') return true;

      const hasRenderableCard =
        (item.cards?.length ?? 0) > 0 ||
        (item.parts?.some((part) => part.type === 'card') ?? false);

      // When assistant_final exists for this operationId, keep only the final
      // row and any yield rows (user-facing yield prompts). Suppress everything
      // else — including assistant_partial snapshots and untagged trajectory
      // rows written by ThreadMessageWriter — to prevent duplicate bubbles.
      if (item.operationId && finalOperationIds.has(item.operationId)) {
        return (
          item.semanticPhase === 'assistant_final' ||
          item.semanticPhase === 'assistant_yield' ||
          hasRenderableCard
        );
      }

      // Pause/resume cross-operation collapse:
      // parent operation ids are `chat-*` while resumed child operations use
      // bare UUID ids. When a later bare-UUID final exists, suppress stale
      // parent assistant trajectory rows so only the resumed final bubble remains.
      if (
        lastBareFinalIndex >= 0 &&
        index < lastBareFinalIndex &&
        item.operationId &&
        isChatPrefixedOperationId(item.operationId) &&
        !finalOperationIds.has(item.operationId) &&
        (item.semanticPhase === 'assistant_tool_call' || !item.semanticPhase) &&
        !hasRenderableCard
      ) {
        return false;
      }

      // Suppress all-but-last assistant_tool_call rows (no final path).
      if (toolCallSuppressedIds.has(item.id)) return false;

      // Suppress non-richest legacy duplicates (untagged rows with no final).
      if (legacySuppressedIds.has(item.id)) return false;
      return true;
    });
  }

  /** Numeric richness score for a persisted assistant row. Higher = better. */
  private assistantRowRichness(msg: AgentMessage): number {
    let score = 0;
    if (msg.resultData && Object.keys(msg.resultData).length > 0) score += 1000;
    if ((msg.steps?.length ?? 0) > 0) score += 100 * (msg.steps?.length ?? 0);
    if ((msg.toolCalls?.length ?? 0) > 0) score += 50 * (msg.toolCalls?.length ?? 0);
    if ((msg.parts?.length ?? 0) > 0) score += 20 * (msg.parts?.length ?? 0);
    score += Math.min(msg.content?.length ?? 0, 500);
    return score;
  }

  configure(host: AgentXOperationChatSessionFacadeHost): void {
    this.host = host;
  }

  initializeAfterView(): void {
    const host = this.requireHost();
    const threadId = host.threadId().trim();
    if (threadId) {
      this.initializeExistingThread(threadId);
      return;
    }

    if (host.getOperationStatus() === 'error') {
      host.threadMode.set(true);
      this.injectFailureMessage();
      return;
    }

    if (
      host.contextId().trim() &&
      host.contextType() === 'operation' &&
      host.getOperationStatus() === 'processing'
    ) {
      host.threadMode.set(true);
      this.subscribeToFirestoreJobEvents();
      return;
    }

    if (host.initialFiles().length > 0) {
      this.attachmentsFacade.pendingFiles.set([...host.initialFiles()]);
    }

    if (host.resumeOperationId().trim()) {
      void host.attachToResumedOperation({
        operationId: host.resumeOperationId().trim(),
        threadId: threadId || undefined,
        afterSeq: 0,
      });
      return;
    }

    if (host.initialMessage().trim() && !this.initialMessageSent()) {
      this.initialMessageSent.set(true);
      setTimeout(() => {
        const initialMessage = host.initialMessage().trim();
        if (!initialMessage) return;
        if (host.inputValue().trim().length > 0) {
          return;
        }
        void host.send({ text: initialMessage, preserveDraft: true });
      }, 150);
    }
  }

  handleDestroy(): void {
    const host = this.requireHost();
    this.messageFacade.clearPendingTypingDelta();

    const threadId = host.resolvedThreadId();
    if (threadId) {
      this.streamRegistry.detach(threadId);
    }

    // Preserve any in-flight pre-thread stream regardless of contextType.
    // 'command' sessions (the most common case) also have active streams
    // that must survive component destroy so the shell can reconnect them
    // once onThread resolves the threadId (via AgentXService.pendingResolvedOp).
    const shouldPreservePreThreadStream = !threadId && host.getActiveStream() !== null;

    if (
      !shouldPreservePreThreadStream &&
      (!threadId || !this.streamRegistry.hasActiveStream(threadId))
    ) {
      host.getActiveStream()?.abort();
    } else if (shouldPreservePreThreadStream) {
      this.logger.info('Preserving pre-thread stream during component destroy', {
        contextId: host.contextId(),
        contextType: host.contextType(),
      });
    }

    host.setActiveStream(null);
    host.getActiveFirestoreSub()?.unsubscribe();
    host.setActiveFirestoreSub(null);
    host.getShadowFirestoreSub()?.unsubscribe();
    host.setShadowFirestoreSub(null);
  }

  resolveActiveThreadId(): string | null {
    const host = this.requireHost();
    const threadId = host.resolvedThreadId() ?? host.threadId().trim();
    return threadId && threadId.length > 0 ? threadId : null;
  }

  isFirestoreOperationId(value: string | null | undefined): value is string {
    const trimmed = value?.trim();
    if (!trimmed) return false;
    const bare = trimmed.startsWith('chat-') ? trimmed.slice(5) : trimmed;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bare);
  }

  resolveFirestoreOperationId(): string | null {
    const host = this.requireHost();
    const candidates = [
      host.getCurrentOperationId(),
      host.resumeOperationId().trim() || null,
      host.contextId().trim() || null,
    ];

    for (const candidate of candidates) {
      if (this.isFirestoreOperationId(candidate)) return candidate;
    }

    return null;
  }

  subscribeToFirestoreJobEvents(
    explicitOperationId?: string,
    startAfterSeq?: number,
    deltaWatermark?: { optimisticChars: number; confirmedChars: number } | null
  ): void {
    const host = this.requireHost();
    const operationId = explicitOperationId ?? host.contextId();
    if (!operationId?.trim() || host.getActiveFirestoreSub()) return;
    // Bug C: prevent a Firestore subscription from opening alongside an active SSE
    // stream registry entry — both would write to the same typing bubble simultaneously.
    const resolvedThreadId = host.resolvedThreadId();
    if (resolvedThreadId && this.streamRegistry.hasActiveStream(resolvedThreadId)) return;

    this.transportFacade.beginResponseTurn('firestore-subscribe');

    this.logger.info('Attaching Firestore job event listener for background operation', {
      operationId,
      startAfterSeq,
    });
    this.breadcrumb.trackStateChange('operation-chat:firestore-subscribe', {
      operationId,
      startAfterSeq,
    });

    if (!this.messageFacade.messages().some((message) => message.id === 'typing')) {
      host.loading.set(true);
      host.setActivityPhase('reconnecting', 'Reconnecting...');
      this.messageFacade.messages.update((messages) => [
        ...messages,
        {
          id: 'typing',
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isTyping: true,
        },
      ]);
    }

    host.setActiveFirestoreSub(
      this.operationEventService.subscribe(
        operationId,
        {
          onDelta: (text) => {
            host.markActivityPulse();
            if (deltaWatermark) {
              const start = deltaWatermark.confirmedChars;
              deltaWatermark.confirmedChars += text.length;
              if (deltaWatermark.confirmedChars <= deltaWatermark.optimisticChars) {
                return;
              }
              const skipChars = Math.max(0, deltaWatermark.optimisticChars - start);
              const tail = skipChars > 0 ? text.slice(skipChars) : text;
              if (tail.length > 0) {
                deltaWatermark.optimisticChars += tail.length;
                this.messageFacade.queueTypingDelta(tail);
              }
              return;
            }
            this.messageFacade.queueTypingDelta(text);
          },
          onStep: (step) => {
            this.messageFacade.flushPendingTypingDelta();
            if (!step.label.trim()) return;
            if (step.status === 'active') {
              // Pass the step label so a stale generic gap label
              // ("Working on next step...") doesn't outlive the tool start.
              host.setActivityPhase('running_tool', step.label);
            } else if (
              step.stageType === 'tool' &&
              (step.status === 'success' || step.status === 'error')
            ) {
              // Tool finished: leave running_tool so waiting_delta shimmer can show
              // while the model computes the next assistant text delta.
              host.setActivityPhase('waiting_delta');
            } else {
              // Keep streaming state stable for non-active step updates.
              // Waiting+immediate-pulse causes a visible loader flash.
              host.markActivityPulse();
            }
            this.messageFacade.messages.update((messages) =>
              messages.map((message) => {
                if (message.id !== 'typing') return message;
                const previousSteps = message.steps ?? [];
                const stepIndex = previousSteps.findIndex((candidate) => candidate.id === step.id);
                const nextSteps =
                  stepIndex >= 0
                    ? previousSteps.map((candidate, index) =>
                        index === stepIndex ? step : candidate
                      )
                    : [...previousSteps, step];
                return {
                  ...message,
                  steps: nextSteps,
                  parts: this.messageFacade.withUpsertedToolStepPart(message.parts, step),
                };
              })
            );
          },
          onCard: (card) => {
            this.messageFacade.flushPendingTypingDelta();
            this.messageFacade.messages.update((messages) =>
              messages.map((message) => {
                if (message.id !== 'typing') return message;
                const nextParts = [...(message.parts ?? [])];
                nextParts.push({ type: 'card', card });
                return {
                  ...message,
                  cards: [...(message.cards ?? []), card],
                  parts: nextParts,
                };
              })
            );
          },
          onMedia: (media) => {
            this.mergeLiveMediaIntoTypingMessage(media);
          },
          onProgress: (event) => {
            const message = typeof event.message === 'string' ? event.message.trim() : '';
            if (!message) return;
            host.latestProgressLabel.set(message);
            host.markActivityPulse(message);
          },
          onDone: (event) => {
            this.messageFacade.flushPendingTypingDelta();
            host.latestProgressLabel.set(null);
            host.setActivityPhase('completed');
            this.messageFacade.finalizeStreamedAssistantMessage({
              streamingId: 'typing',
              messageId: event.messageId,
              success: event.success,
              source: 'firestore-done',
            });
            host.loading.set(false);
            host.getActiveFirestoreSub()?.unsubscribe();
            host.setActiveFirestoreSub(null);
            host.setStreamTurnWatermark(null);
            void this.haptics.notification('success');
            this.transportFacade.emitResponseCompleteOnce('firestore-done');
            this.logger.info('Background job stream complete (Firestore)', { operationId });
          },
          onError: (error) => {
            host.latestProgressLabel.set(null);
            host.setActivityPhase('failed', error);
            this.messageFacade.replaceTyping({
              id: host.uid(),
              role: 'assistant',
              content: error || 'Something went wrong. Please try again.',
              timestamp: new Date(),
              error: true,
            });
            host.loading.set(false);
            host.getActiveFirestoreSub()?.unsubscribe();
            host.setActiveFirestoreSub(null);
            host.setStreamTurnWatermark(null);
            void this.haptics.notification('error');
            this.logger.error('Background job stream error (Firestore)', new Error(error), {
              operationId,
            });
            this.transportFacade.emitResponseCompleteOnce('firestore-error');
          },
        },
        startAfterSeq !== undefined ? { startAfterSeq } : undefined
      )
    );
  }

  async loadThreadMessages(threadId: string): Promise<void> {
    const host = this.requireHost();
    host.loading.set(true);
    this.logger.info('Loading operation thread', { threadId, contextId: host.contextId() });

    try {
      const { messages: items, latestPausedYieldState } =
        await this.agentXService.getPersistedThreadMessages(threadId);
      const persistedPendingYieldState = this.coercePersistedYieldState(latestPausedYieldState);

      if (!items.length) {
        this.logger.warn('Operation thread returned no messages — preserving local state', {
          threadId,
          contextId: host.contextId(),
          hasPersistedYield: !!persistedPendingYieldState,
          localMessageCount: this.messageFacade.messages().length,
        });

        if (persistedPendingYieldState) {
          this.applyPendingYieldState(
            persistedPendingYieldState,
            threadId,
            'thread-metadata-empty'
          );
          return;
        }

        if (host.getOperationStatus() === 'error') {
          this.injectFailureMessage();
        }
        return;
      }

      // Phase K (single-bubble guarantee): resolve the canonical set of rows
      // before mapping. Suppresses assistant_partial rows when assistant_final
      // exists for the same operationId (pause/resume double-bubble fix).
      const canonicalItems = this.resolveCanonicalAssistantRows(items);

      const mapped: OperationMessage[] = canonicalItems
        // Phase J (thread-as-truth): tool/system rows are persisted
        // for backend replay only — they must not render as chat
        // bubbles. Filter them out at the boundary.
        .filter(
          (message): message is typeof message & { role: 'user' | 'assistant' } =>
            message.role === 'user' || message.role === 'assistant'
        )
        // P1: skip empty assistant rows (no content, no parts, no steps, no resultData).
        // These arise when the LLM emits an empty turn before a tool call — harmless
        // for backend replay but must not render as blank bubbles in the chat UI.
        .filter((message) => {
          if (message.role !== 'assistant') return true;
          return (
            (message.content ?? '').trim().length > 0 ||
            (message.parts?.length ?? 0) > 0 ||
            (message.steps?.length ?? 0) > 0 ||
            (!!message.resultData && Object.keys(message.resultData).length > 0)
          );
        })
        .map((message) => {
          const persistedSteps: AgentXToolStep[] = (message.steps ?? []).filter(
            (step): step is AgentXToolStep =>
              typeof step.label === 'string' &&
              step.label.trim().length > 0 &&
              step.stageType === 'tool'
          );

          let persistedParts =
            message.parts?.map((part) =>
              part.type === 'tool-steps'
                ? {
                    type: 'tool-steps' as const,
                    steps: part.steps.filter(
                      (step): step is AgentXToolStep =>
                        typeof step.label === 'string' &&
                        step.label.trim().length > 0 &&
                        step.stageType === 'tool'
                    ),
                  }
                : part.type === 'card'
                  ? {
                      type: 'card' as const,
                      card: {
                        ...part.card,
                        agentId:
                          typeof (part.card as { agentId?: unknown }).agentId === 'string'
                            ? (part.card as { agentId: AgentXRichCard['agentId'] }).agentId
                            : 'router',
                      },
                    }
                  : part
            ) ?? [];

          const cleanContent = message.content
            .replace(/\n\n\[Attached (?:file|video): .+/gs, '')
            .trim();

          // BUG FIX: Rehydration drops text when cards are present.
          // nxt1-chat-bubble overrides legacy layout to strictly loop over `parts` if any exist.
          // We must ensure `cleanContent` is injected as a 'text' part so it renders.
          if (persistedParts.length > 0 && cleanContent.length > 0) {
            const hasTextPart = persistedParts.some((p) => p.type === 'text');
            if (!hasTextPart) {
              persistedParts = [
                { type: 'text' as const, content: cleanContent },
                ...persistedParts,
              ];
            }
          }

          // Derive the `cards` array from card-type parts so render methods
          // that read `message.cards` directly (messageCardsForBubble,
          // executionPlanCard, etc.) work correctly on reload — not just
          // during the live stream where cards are pushed to both arrays.
          const persistedCards: AgentXRichCard[] = persistedParts
            .filter((part): part is { type: 'card'; card: AgentXRichCard } => part.type === 'card')
            .map((part) => part.card);

          const persistedMedia = this.collectMessageMedia(message);

          const persistedYieldState = this.coercePersistedYieldState(
            message.resultData?.['yieldState']
          );
          const persistedYieldCardStateRaw = message.resultData?.['yieldCardState'];
          const persistedYieldCardState =
            persistedYieldCardStateRaw === 'idle' ||
            persistedYieldCardStateRaw === 'submitting' ||
            persistedYieldCardStateRaw === 'resolved'
              ? persistedYieldCardStateRaw
              : undefined;
          const persistedYieldResolvedText =
            typeof message.resultData?.['yieldResolvedText'] === 'string'
              ? (message.resultData['yieldResolvedText'] as string)
              : undefined;

          return {
            id: message.id ?? host.uid(),
            // Phase J (thread-as-truth): preserve role fidelity. The
            // chat session computed signal filters tool/system rows so
            // they don't render as visible bubbles — but they are kept
            // in the persisted feed so debugging/replay tooling can
            // surface them.
            role: message.role,
            operationId: typeof message.operationId === 'string' ? message.operationId : undefined,
            content: cleanContent,
            timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
            ...(persistedSteps.length > 0 ? { steps: persistedSteps } : {}),
            ...(persistedParts.length > 0 ? { parts: persistedParts } : {}),
            ...(persistedCards.length > 0 ? { cards: persistedCards } : {}),
            ...(persistedYieldState ? { yieldState: persistedYieldState } : {}),
            ...(persistedYieldCardState ? { yieldCardState: persistedYieldCardState } : {}),
            ...(persistedYieldResolvedText
              ? { yieldResolvedText: persistedYieldResolvedText }
              : {}),
            ...persistedMedia,
          };
        });

      const dedupedMapped = this.dedupeConsecutiveAssistantMessages(mapped);
      this.messageFacade.messages.set(dedupedMapped);

      const latestMessageOperationId = [...canonicalItems]
        .reverse()
        .map((message) =>
          typeof message.operationId === 'string' ? message.operationId.trim() : ''
        )
        .find((id) => this.isFirestoreOperationId(id));
      if (latestMessageOperationId) {
        host.setCurrentOperationId(latestMessageOperationId);
      }

      if (persistedPendingYieldState) {
        // applyPendingYieldState already calls upsertInlineYieldMessage internally
        // with the correct operationId — do NOT call it again or a second message
        // with a different operationId would create a duplicate action card.
        this.applyPendingYieldState(persistedPendingYieldState, threadId, 'thread-metadata');
      } else {
        // No persisted yield from thread metadata — sync any pre-existing active
        // yield that arrived via live SSE before this thread history load completed.
        const activeYield = host.activeYieldState();
        if (activeYield) {
          this.messageFacade.upsertInlineYieldMessage(
            activeYield,
            host.getCurrentOperationId() ?? host.contextId()
          );
        }
      }

      const hadUser = dedupedMapped.some((message) => message.role === 'user');
      if (hadUser && !host.hasUserSent()) {
        host.markUserMessageSent();
      }

      this.logger.info('Operation thread loaded', {
        threadId,
        contextId: host.contextId(),
        messageCount: dedupedMapped.length,
      });

      const hasAssistantReply = mapped.some(
        (message) => message.role === 'assistant' && message.content?.trim()
      );
      if (
        host.getOperationStatus() === 'processing' &&
        hasAssistantReply &&
        !host.activeYieldState()
      ) {
        // ── Mongo-authoritative fast path ──────────────────────────────────
        // If any canonical row carries assistant_final the operation has
        // completed, regardless of what Firestore says for the stored
        // operationId. This covers parent/child approval flows where the
        // parent ends at awaiting_approval (no `done` in Firestore for it)
        // but the child wrote assistant_final to MongoDB.
        const hasMongoFinal = canonicalItems.some(
          (item) => item.role === 'assistant' && item.semanticPhase === 'assistant_final'
        );
        if (hasMongoFinal) {
          host.setOperationStatus('complete');
          this.operationEventService.emitOperationStatusUpdated(
            threadId,
            'complete',
            new Date().toISOString()
          );
          this.logger.info('Reconciled operation to complete from Mongo assistant_final', {
            threadId,
            contextId: host.contextId(),
          });
        } else {
          // ── Firestore fallback: check stored lifecycle state ──────────────
          let pendingYieldState: AgentYieldState | null = null;
          let latestLifecycleStatus:
            | 'queued'
            | 'running'
            | 'paused'
            | 'awaiting_input'
            | 'awaiting_approval'
            | 'complete'
            | 'failed'
            | 'cancelled'
            | null = null;

          const operationId = this.resolveFirestoreOperationId();
          if (operationId) {
            const stored = await this.operationEventService.getStoredEventState(operationId);
            pendingYieldState = stored.latestYieldState;
            latestLifecycleStatus = stored.latestLifecycleStatus;
          }

          if (pendingYieldState) {
            this.applyPendingYieldState(pendingYieldState, threadId, 'firestore-fallback');
          } else if (latestLifecycleStatus) {
            const reconciledStatus =
              latestLifecycleStatus === 'queued' || latestLifecycleStatus === 'running'
                ? 'processing'
                : latestLifecycleStatus === 'failed'
                  ? 'error'
                  : latestLifecycleStatus === 'cancelled'
                    ? 'complete'
                    : latestLifecycleStatus;

            host.setOperationStatus(reconciledStatus);
            this.operationEventService.emitOperationStatusUpdated(
              threadId,
              latestLifecycleStatus,
              new Date().toISOString()
            );

            this.logger.info('Reconciled operation status from stored lifecycle state', {
              threadId,
              contextId: host.contextId(),
              lifecycleStatus: latestLifecycleStatus,
              reconciledStatus,
            });
          } else {
            // No persisted lifecycle/yield evidence found yet. Keep processing so
            // the upstream middle shimmer remains visible while waiting for more events.
            this.logger.info('Keeping operation in processing while awaiting upstream events', {
              threadId,
              contextId: host.contextId(),
            });
          }
        }
      }

      if (
        host.getOperationStatus() === 'complete' ||
        (host.getOperationStatus() !== 'processing' && hasAssistantReply)
      ) {
        this.messageFacade.settleActiveToolSteps('success');
      } else if (
        host.getOperationStatus() === 'error' ||
        host.getOperationStatus() === 'paused' ||
        host.getOperationStatus() === 'awaiting_input' ||
        host.getOperationStatus() === 'awaiting_approval'
      ) {
        this.messageFacade.settleActiveToolSteps('error');
      }

      if (host.getOperationStatus() === 'error') {
        this.injectFailureMessage();
      }
    } catch (error) {
      this.logger.error('Failed to load operation thread', error, {
        threadId,
        contextId: host.contextId(),
      });
      this.messageFacade.pushMessage({
        id: host.uid(),
        role: 'assistant',
        content: 'Failed to load this conversation. You can still continue here.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      host.loading.set(false);
    }
  }

  private initializeExistingThread(threadId: string): void {
    const host = this.requireHost();
    host.threadMode.set(true);
    host.resolvedThreadId.set(threadId);

    const snapshot = this.streamRegistry.claim(threadId, {
      onDelta: (text) => {
        this.messageFacade.queueTypingDelta(text);
      },
      onThinking: (content) => {
        this.messageFacade.messages.update((messages) =>
          messages.map((message) => {
            if (message.id !== 'typing') return message;
            const prevParts = message.parts ?? [];
            const last = prevParts[prevParts.length - 1];
            const nextParts =
              last?.type === 'thinking'
                ? [
                    ...prevParts.slice(0, -1),
                    { type: 'thinking' as const, content: last.content + content },
                  ]
                : [...prevParts, { type: 'thinking' as const, content }];
            return { ...message, parts: nextParts };
          })
        );
      },
      onStep: (step) => {
        this.messageFacade.flushPendingTypingDelta();
        if (!step.label.trim()) return;
        this.messageFacade.messages.update((messages) =>
          messages.map((message) => {
            if (message.id !== 'typing') return message;
            const previousSteps = message.steps ?? [];
            const stepIndex = previousSteps.findIndex((candidate) => candidate.id === step.id);
            const nextSteps =
              stepIndex >= 0
                ? previousSteps.map((candidate, index) => (index === stepIndex ? step : candidate))
                : [...previousSteps, step];
            return {
              ...message,
              steps: nextSteps,
              parts: this.messageFacade.withUpsertedToolStepPart(message.parts, step),
            };
          })
        );
      },
      onCard: (card) => {
        this.messageFacade.flushPendingTypingDelta();
        this.messageFacade.messages.update((messages) =>
          messages.map((message) => {
            if (message.id !== 'typing') return message;
            const nextParts = [...(message.parts ?? [])];
            nextParts.push({ type: 'card', card });
            return {
              ...message,
              cards: [...(message.cards ?? []), card],
              parts: nextParts,
            };
          })
        );
      },
      onDone: (event) => {
        this.messageFacade.flushPendingTypingDelta();
        this.messageFacade.finalizeStreamedAssistantMessage({
          streamingId: 'typing',
          messageId:
            event != null && typeof event['messageId'] === 'string'
              ? event['messageId']
              : undefined,
          success:
            event != null && typeof event['success'] === 'boolean' ? event['success'] : undefined,
          source: 'stream-registry-done',
        });
        host.loading.set(false);
        void this.haptics.notification('success');
        this.transportFacade.emitResponseCompleteOnce('stream-registry-done');
      },
      onError: (error) => {
        this.messageFacade.replaceTyping({
          id: host.uid(),
          role: 'assistant',
          content: error || 'Something went wrong. Please try again.',
          timestamp: new Date(),
          error: true,
        });
        host.loading.set(false);
        void this.haptics.notification('error');
      },
    });

    if (snapshot) {
      this.logger.info('Rehydrating from stream registry', {
        threadId,
        contentLength: snapshot.content.length,
        done: snapshot.done,
      });

      void this.loadThreadMessages(threadId).then(() => {
        const fresh = this.streamRegistry.getSnapshot(threadId);
        if (!fresh) return;

        if (fresh.done) {
          if (fresh.error) {
            this.messageFacade.messages.update((messages) => [
              ...messages,
              {
                id: host.uid(),
                role: 'assistant',
                content: fresh.error || 'Something went wrong.',
                timestamp: new Date(),
                error: true,
              },
            ]);
          } else if (fresh.content) {
            // Bug B: stream completed while loadThreadMessages was in-flight.
            // finalizeStreamedAssistantMessage was a no-op (no typing bubble existed yet).
            // Inject the final response now if Firestore history hasn't caught up.
            const alreadyPresent = this.messageFacade
              .messages()
              .some(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  this.normalizeMessageContent(m.content) ===
                    this.normalizeMessageContent(fresh.content)
              );
            if (!alreadyPresent) {
              this.messageFacade.messages.update((messages) => [
                ...messages,
                {
                  id: host.uid(),
                  role: 'assistant',
                  content: fresh.content,
                  timestamp: new Date(),
                  isTyping: false,
                  steps: fresh.steps.length > 0 ? [...fresh.steps] : undefined,
                  cards: fresh.cards.length > 0 ? [...fresh.cards] : undefined,
                  parts: fresh.parts.length > 0 ? [...fresh.parts] : undefined,
                },
              ]);
            }
            host.loading.set(false);
            this.transportFacade.emitResponseCompleteOnce('stream-registry-rehydrate-done');
          }
          return;
        }

        if (fresh.content || fresh.steps.length || fresh.cards.length) {
          // Bug A: cancel any RAF-buffered delta that accumulated between claim() and
          // this bubble insert. fresh.content already has all content from the registry,
          // so the pending delta would be double-counted if the RAF fired after insertion.
          this.messageFacade.clearPendingTypingDelta();
          this.messageFacade.messages.update((messages) => {
            // Guard: if a finalized (non-typing) assistant message already has
            // this exact content, the operation completed before we arrived
            // here. Adding a second bubble would show the answer twice.
            if (
              fresh.content?.trim() &&
              messages.some(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  m.content?.trim() === fresh.content.trim()
              )
            ) {
              return messages;
            }

            // Guard: never add a second typing bubble.
            if (messages.some((m) => m.id === 'typing')) return messages;

            return [
              ...messages,
              {
                id: 'typing',
                role: 'assistant',
                content: fresh.content,
                timestamp: new Date(),
                isTyping: !fresh.content,
                steps: fresh.steps.length > 0 ? [...fresh.steps] : undefined,
                cards: fresh.cards.length > 0 ? [...fresh.cards] : undefined,
                parts: fresh.parts.length > 0 ? [...fresh.parts] : undefined,
              },
            ];
          });
        }
        host.loading.set(true);
      });
      return;
    }

    if (
      host.contextId().trim() &&
      host.contextType() === 'operation' &&
      host.getOperationStatus() === 'processing'
    ) {
      const operationId = this.resolveFirestoreOperationId();
      void this.loadThreadMessages(threadId).then(async () => {
        if (!operationId) {
          this.logger.warn('Skipping Firestore operation rehydrate: no valid operationId', {
            contextId: host.contextId(),
            threadId,
          });
          return;
        }

        const hasAssistantReply = this.messageFacade
          .messages()
          .some(
            (message) =>
              !message.isTyping && message.role === 'assistant' && message.content?.trim()
          );

        if (hasAssistantReply) {
          this.logger.info('Thread already has assistant reply — skipping Firestore subscribe', {
            operationId,
          });
          return;
        }

        const stored = await this.operationEventService.getStoredEventState(operationId);

        if (stored.latestYieldState) {
          host.activeYieldState.set(stored.latestYieldState);
          host.yieldResolved.set(false);
          this.messageFacade.upsertInlineYieldMessage(stored.latestYieldState, operationId);
        }

        if (stored.isDone) {
          const alreadyHasAssistant = this.messageFacade
            .messages()
            .some(
              (message) =>
                !message.isTyping && message.role === 'assistant' && message.content?.trim()
            );
          if (
            !alreadyHasAssistant &&
            stored.content &&
            !this.messageFacade
              .messages()
              .some(
                (message) =>
                  message.role === 'assistant' &&
                  !message.isTyping &&
                  this.normalizeMessageContent(message.content) ===
                    this.normalizeMessageContent(stored.content)
              )
          ) {
            this.messageFacade.messages.update((messages) => [
              ...messages,
              {
                id: host.uid(),
                role: 'assistant',
                content: stored.content,
                timestamp: new Date(),
                isTyping: false,
                steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
                parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
                cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
              },
            ]);
          }
          host.setOperationStatus('complete');
          this.operationEventService.emitOperationStatusUpdated(
            host.threadId().trim() || operationId,
            'complete',
            new Date().toISOString()
          );
          return;
        }

        // Phase 5: use stored.parts directly — getStoredEventState now builds parts
        // in seq order (same merge logic as the SSE stream registry) so text, tools,
        // and cards are interleaved at their exact positions. No manual storedParts
        // construction here that would hardcode tools-first/text-last order.
        this.messageFacade.messages.update((messages) => {
          if (messages.some((message) => message.id === 'typing')) return messages;
          return [
            ...messages,
            {
              id: 'typing',
              role: 'assistant',
              content: stored.content,
              timestamp: new Date(),
              isTyping: !stored.content,
              steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
              parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
              cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
            },
          ];
        });
        host.loading.set(true);
        this.subscribeToFirestoreJobEvents(undefined, stored.maxSeq);
      });
      return;
    }

    void this.loadThreadMessages(threadId).then(async () => {
      const pendingStatus =
        host.getOperationStatus() === 'paused' ||
        host.getOperationStatus() === 'awaiting_input' ||
        host.getOperationStatus() === 'awaiting_approval';
      const operationId = this.resolveFirestoreOperationId();
      if (!pendingStatus || !operationId) return;

      const stored = await this.operationEventService.getStoredEventState(operationId);
      if (!stored.latestYieldState) return;

      host.activeYieldState.set(stored.latestYieldState);
      host.yieldResolved.set(false);
      this.messageFacade.upsertInlineYieldMessage(stored.latestYieldState, operationId);
    });
  }

  private inferOperationStatusFromYield(
    yieldState: AgentYieldState
  ): 'paused' | 'awaiting_input' | 'awaiting_approval' {
    if (yieldState.reason === 'needs_approval') return 'awaiting_approval';
    if (yieldState.pendingToolCall?.toolName === 'resume_paused_operation') return 'paused';
    return 'awaiting_input';
  }

  private coercePersistedYieldState(value: unknown): AgentYieldState | null {
    if (!value || typeof value !== 'object') return null;

    const candidate = value as Partial<AgentYieldState>;
    if (typeof candidate.reason !== 'string') return null;
    if (!candidate.pendingToolCall || typeof candidate.pendingToolCall.toolName !== 'string') {
      return null;
    }

    return candidate as AgentYieldState;
  }

  private applyPendingYieldState(
    yieldState: AgentYieldState,
    threadId: string,
    source: string
  ): void {
    const host = this.requireHost();
    const pendingStatus = this.inferOperationStatusFromYield(yieldState);
    host.activeYieldState.set(yieldState);
    host.yieldResolved.set(false);
    this.messageFacade.upsertInlineYieldMessage(
      yieldState,
      this.resolveYieldOperationId(yieldState)
    );
    host.setOperationStatus(pendingStatus);

    this.logger.info('Applied pending yield state on thread load', {
      threadId,
      contextId: host.contextId(),
      source,
      pendingStatus,
      reason: yieldState.reason,
      toolName: yieldState.pendingToolCall?.toolName,
    });
  }

  private resolveYieldOperationId(yieldState?: AgentYieldState | null): string {
    const host = this.requireHost();
    const toolInputOperationId =
      yieldState?.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : null;

    const candidates = [
      toolInputOperationId,
      host.getCurrentOperationId()?.trim() || undefined,
      host.resumeOperationId().trim() || undefined,
      this.resolveFirestoreOperationId() ?? undefined,
      host.contextId().trim() || undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (this.isFirestoreOperationId(candidate)) return candidate;
    }

    return candidates.find((candidate): candidate is string => !!candidate) ?? host.contextId();
  }

  private injectFailureMessage(): void {
    const host = this.requireHost();
    const reason = host.errorMessage() || 'an unexpected error';
    this.messageFacade.pushMessage({
      id: host.uid(),
      role: 'assistant',
      content:
        `This operation was unable to complete due to ${reason}.\n\n` +
        `You can retry below, or dismiss and start a new request.`,
      timestamp: new Date(),
      error: true,
    });
  }

  private requireHost(): AgentXOperationChatSessionFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatSessionFacade used before configure()');
    }

    return this.host;
  }
}
