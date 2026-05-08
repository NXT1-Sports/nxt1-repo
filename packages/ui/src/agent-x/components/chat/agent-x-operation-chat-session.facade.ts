import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import {
  sanitizeStorageUrlsFromText,
  type AgentMessage,
  type AgentYieldState,
  type AgentXAttachment,
} from '@nxt1/core';
import type {
  AgentXAskUserPayload,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXStreamMediaEvent,
  AgentXToolStep,
} from '@nxt1/core/ai';
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
  | 'cancelled'
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
  applyYieldState(params: {
    yieldState: AgentYieldState;
    source: string;
    operationId?: string;
  }): void;
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
  private static readonly ENQUEUE_WAITING_MESSAGE_ID = 'enqueue-waiting';
  private static readonly ENQUEUE_WAITING_MESSAGE_TEXT = 'Will let you know when complete.';
  private static readonly ENQUEUE_HEAVY_TOOL_NAME = 'enqueue_heavy_task';
  private static readonly ENQUEUE_HEAVY_STEP_LABEL = 'queueing background operation';

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
  private enqueueHeavySeenSinceLastCompletion = false;

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
    return attachmentSignature;
  }

  private inferMediaTypeFromUrl(url: string): 'image' | 'video' | null {
    const normalizedUrl = this.normalizeDetectedMediaUrl(url);
    const pathname = (() => {
      try {
        return new URL(normalizedUrl).pathname.toLowerCase();
      } catch {
        return normalizedUrl.toLowerCase();
      }
    })();

    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(pathname) || /\/images?\//i.test(pathname)) {
      return 'image';
    }
    if (
      /\.(m3u8|mov|mp4|m4v|webm|ogg|ogv)$/i.test(pathname) ||
      /\/videos?\//i.test(pathname) ||
      /videodelivery\.net\/|stream|cloudflare/i.test(normalizedUrl)
    ) {
      return 'video';
    }

    return null;
  }

  private normalizeDetectedMediaUrl(value: string): string {
    return value.trim().replace(/[),.;!?]+$/g, '');
  }

  private extractMediaUrlsFromText(content: string | undefined): string[] {
    if (!content) return [];

    const urls = new Set<string>();
    const matches = content.match(/https?:\/\/[^\s)\]"'<>]+/gi) ?? [];
    for (const match of matches) {
      const normalized = this.normalizeDetectedMediaUrl(match);
      if (!/^https?:\/\//i.test(normalized)) continue;
      if (!this.inferMediaTypeFromUrl(normalized)) continue;
      urls.add(normalized);
    }

    return [...urls];
  }

  private extractMediaUrlsFromResultData(resultData: AgentMessage['resultData']): string[] {
    if (!resultData) return [];

    const mediaUrls = new Set<string>();
    const pushUrl = (value: unknown): void => {
      if (typeof value !== 'string') return;
      const trimmed = this.normalizeDetectedMediaUrl(value);
      if (!/^https?:\/\//i.test(trimmed)) return;
      if (!this.inferMediaTypeFromUrl(trimmed)) return;
      mediaUrls.add(trimmed);
    };

    pushUrl(resultData['imageUrl']);
    pushUrl(resultData['videoUrl']);
    pushUrl(resultData['outputUrl']);

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

  /**
   * Assistant single-source media rendering: convert bare media URLs in prose
   * into markdown so chat bubbles render inline media consistently.
   */
  private promoteAssistantMediaUrlsToMarkdown(content: string): string {
    if (!content.trim()) return content;

    const urlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;
    return content.replace(urlPattern, (rawUrl, offset, source) => {
      const normalizedUrl = this.normalizeDetectedMediaUrl(rawUrl);
      const mediaType = this.inferMediaTypeFromUrl(normalizedUrl);
      if (!mediaType) return rawUrl;

      // Skip URLs already used as markdown link/image targets: ](url)
      const previousChar = offset > 0 ? source[offset - 1] : '';
      if (previousChar === '(') return rawUrl;

      return mediaType === 'video'
        ? `[View Video](${normalizedUrl})`
        : `![Generated Image](${normalizedUrl})`;
    });
  }

  private normalizeTypingAssistantMediaMarkdown(): void {
    this.messageFacade.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== 'typing') return message;
        const normalizedContent = this.promoteAssistantMediaUrlsToMarkdown(message.content);
        const normalizedParts = (message.parts ?? []).map((part) =>
          part.type === 'text'
            ? {
                type: 'text' as const,
                content: this.promoteAssistantMediaUrlsToMarkdown(part.content),
              }
            : part
        );
        const partsChanged =
          normalizedParts.length === (message.parts?.length ?? 0) &&
          normalizedParts.some((part, index) => part !== (message.parts ?? [])[index]);

        if (normalizedContent === message.content && !partsChanged) {
          return message;
        }

        return {
          ...message,
          content: normalizedContent,
          ...(normalizedParts.length > 0 ? { parts: normalizedParts } : {}),
        };
      })
    );
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
      url: this.normalizeDetectedMediaUrl(attachment.url),
      name: attachment.name,
      type: mappedType,
      ...(attachment.platform ? { platform: attachment.platform } : {}),
      ...(attachment.faviconUrl ? { faviconUrl: attachment.faviconUrl } : {}),
    };
  }

  private dedupeMessageAttachments(
    attachments: readonly NonNullable<OperationMessage['attachments']>[number][]
  ): NonNullable<OperationMessage['attachments']>[number][] {
    const seen = new Set<string>();

    return attachments.filter((attachment) => {
      const key = `${attachment.type}|${this.normalizeDetectedMediaUrl(attachment.url)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private stripPersistedAttachmentAnnotations(content: string): string {
    return content
      .replace(/\n\n\[Attached (?:file|video): .+/gs, '')
      .replace(/\n\n\[Connected sources available[^\]]*\]/gs, '')
      .replace(
        /\n\[Instruction: treat these as user-connected sources for this request; do not state they are missing\.\]/gs,
        ''
      )
      .trim();
  }

  private collectMessageMedia(message: AgentMessage): {
    attachments?: OperationMessage['attachments'];
  } {
    // Unified attachment model: backend populates attachments[] at save time.
    // Frontend simply reads attachments directly — no content scanning, no waterfall.
    const persistedAttachments = this.dedupeMessageAttachments(
      (message.attachments ?? []).map((attachment) =>
        this.mapPersistedAttachment(attachment as AgentXAttachment)
      )
    );

    return persistedAttachments.length > 0 ? { attachments: persistedAttachments } : {};
  }

  private stripDisplayedMediaUrlsFromContent(
    content: string,
    media: { attachments?: readonly MessageAttachment[] }
  ): string {
    const sanitizedContent = sanitizeStorageUrlsFromText(content, { normalizeWhitespace: false });
    const attachmentUrls = (media.attachments ?? [])
      .map((att) => att.url)
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map((url) => this.normalizeDetectedMediaUrl(url));
    if (!attachmentUrls.length) return content.trim();

    const urlSet = new Set(attachmentUrls);
    const lines = sanitizedContent.split('\n');

    const cleaned: string[] = [];
    for (const line of lines) {
      let nextLine = line;

      // Remove attachment URLs even when they appear inline, e.g.
      // "Generated Image: https://storage.googleapis.com/..."
      for (const url of attachmentUrls) {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        nextLine = nextLine.replace(new RegExp(escaped, 'gi'), '');
      }

      const trimmed = nextLine.trim();
      if (!trimmed) {
        cleaned.push('');
        continue;
      }

      if (urlSet.has(this.normalizeDetectedMediaUrl(trimmed))) {
        continue;
      }

      const isDanglingUrlLabel =
        /(?:(?:generated\s+)?(?:graphic|image|video|media)\s+url|generated\s+image)\s*:?$/i.test(
          trimmed
        );
      if (isDanglingUrlLabel) continue;
      cleaned.push(nextLine);
    }

    return cleaned
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private mergeLiveMediaIntoTypingMessage(media: AgentXStreamMediaEvent): void {
    this.messageFacade.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== 'typing') return message;

        // URL already present in content — nothing to do.
        if (message.content.includes(media.url)) return message;

        const mediaMarkdown =
          media.type === 'video'
            ? `\n\n[View Video](${media.url})`
            : `\n\n![Generated Image](${media.url})`;

        return {
          ...message,
          content: message.content + mediaMarkdown,
        };
      })
    );
  }

  /**
   * Build a markdown content suffix from replayed stream media events.
   * Used on rehydrate when the operation completed before this session connected.
   * URLs are appended as inline markdown so the chat bubble renders them directly.
   */
  private buildMediaContentSuffixFromReplayEvents(
    mediaEvents: readonly AgentXStreamMediaEvent[]
  ): string {
    if (!mediaEvents.length) return '';

    const seen = new Set<string>();
    const parts: string[] = [];

    for (const media of mediaEvents) {
      if (seen.has(media.url)) continue;
      seen.add(media.url);
      parts.push(
        media.type === 'video' ? `[View Video](${media.url})` : `![Generated Image](${media.url})`
      );
    }

    return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
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
   * Pair-by-arrival reorder.
   *
   * The backend stamps `assistant_final.createdAt` at completion time,
   * which can be LATER than a follow-up user message that was sent while
   * the previous response was still streaming (or paused). The thread
   * query sorts strictly by `createdAt`, so on rehydrate we get
   * [user1, user2, assistant1, assistant2] instead of the conversational
   * [user1, assistant1, user2, assistant2].
   *
   * This pass walks chronologically and attaches the Nth assistant row to
   * the Nth user row — falling back to the user with the fewest assistants
   * attached so far when more assistants exist than users (yield + final).
   *
   * Non-user/assistant rows pass through untouched. Orphan assistants
   * (none preceding user) are appended at their natural position.
   */
  private reorderTurnsByPairing(messages: readonly OperationMessage[]): OperationMessage[] {
    const result: OperationMessage[] = [];
    // Track each user's landing index in `result` and how many assistants
    // have been attached after it. A user's "block" occupies indices
    // [idx, idx + assistantCount].
    const userSlots: Array<{ idx: number; assistantCount: number }> = [];

    const attachAfter = (
      slot: { idx: number; assistantCount: number },
      msg: OperationMessage
    ): void => {
      const insertAt = slot.idx + 1 + slot.assistantCount;
      result.splice(insertAt, 0, msg);
      slot.assistantCount += 1;
      // Shift later user slots — their landing index moved by +1.
      for (const other of userSlots) {
        if (other !== slot && other.idx >= insertAt) other.idx += 1;
      }
    };

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push(msg);
        userSlots.push({ idx: result.length - 1, assistantCount: 0 });
        continue;
      }

      if (msg.role === 'assistant') {
        // Prefer the earliest user with zero assistants attached.
        let target = userSlots.find((s) => s.assistantCount === 0);
        if (!target && userSlots.length > 0) {
          // Otherwise attach to the user with the fewest assistants
          // (preferring earlier on ties — stable scan order does this).
          target = userSlots.reduce(
            (best, s) => (s.assistantCount < best.assistantCount ? s : best),
            userSlots[0]
          );
        }
        if (target) {
          attachAfter(target, msg);
        } else {
          // Orphan assistant (e.g. opening greeting before any user msg).
          result.push(msg);
        }
        continue;
      }

      result.push(msg);
    }

    return result;
  }

  /**
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
   * `assistant_yield` rows are suppressed here because the user-facing prompt
   * is rendered from the inline yield state/card instead of as a standalone
   * assistant prose bubble.
   */
  private resolveCanonicalAssistantRows(items: readonly AgentMessage[]): readonly AgentMessage[] {
    const isChatPrefixedOperationId = (value: string | undefined): boolean =>
      typeof value === 'string' && value.startsWith('chat-');

    // Build two sets upfront:
    //   assistantYieldOpIds — operationIds that have an assistant_yield row
    //   answeredYieldOpIds  — of those, which also have a user reply message
    // Used to (a) keep answered yield rows as resolved cards instead of
    // suppressing them, and (b) suppress the matching user reply bubble so it
    // doesn't appear as a separate message alongside the card.
    const assistantYieldOpIds = new Set<string>();
    for (const item of items) {
      if (
        item.semanticPhase === 'assistant_yield' &&
        typeof item.operationId === 'string' &&
        item.operationId.trim()
      ) {
        assistantYieldOpIds.add(item.operationId.trim());
      }
    }
    const answeredYieldOpIds = new Set<string>();
    for (const item of items) {
      if (
        item.role === 'user' &&
        typeof item.operationId === 'string' &&
        item.operationId.trim() &&
        assistantYieldOpIds.has(item.operationId.trim()) &&
        item.content?.trim()
      ) {
        answeredYieldOpIds.add(item.operationId.trim());
      }
    }

    // Interruption operations (ask_user / approval / pause) are active turns.
    // needs_input (ask_user): card-only replacement — suppress prior trajectory.
    // needs_approval: inline card alongside tool steps — keep prior trajectory.
    const yieldedOperationIds = new Set<string>();
    const inputYieldedOpIds = new Set<string>(); // needs_input only
    const approvalYieldedOpIds = new Set<string>(); // needs_approval only
    for (const item of items) {
      if (item.role !== 'assistant') continue;
      const opId = typeof item.operationId === 'string' ? item.operationId.trim() : '';
      if (!opId) continue;

      const semanticYield = item.semanticPhase === 'assistant_yield';
      const persistedYieldState = this.coercePersistedYieldState(item.resultData?.['yieldState']);
      // Raw reason: works without pendingToolCall so assistant_yield rows
      // written without the full yieldState shape are still classified.
      const rawYieldReason = (
        item.resultData?.['yieldState'] as Record<string, unknown> | undefined
      )?.['reason'];
      // Any 'confirmation' card = approval yield (no payload validation needed).
      const pendingApprovalCard = (item.parts ?? []).some(
        (part) => part.type === 'card' && part.card.type === 'confirmation'
      );
      const pendingAskUserCard = (item.parts ?? []).some(
        (part) => part.type === 'card' && part.card.type === 'ask_user'
      );

      if (semanticYield || persistedYieldState || pendingApprovalCard || pendingAskUserCard) {
        yieldedOperationIds.add(opId);
        // Classify as input-type ONLY when we have a positive confirmation that
        // this is a needs_input (ask_user) yield. Unknown reason (old sessions
        // written before reason storage) defaults to approval-type so that
        // pre-approval tool_call context is preserved on reload.
        const isConfirmedInput =
          !pendingApprovalCard &&
          (persistedYieldState?.reason === 'needs_input' || rawYieldReason === 'needs_input');
        if (isConfirmedInput) {
          inputYieldedOpIds.add(opId);
        } else {
          approvalYieldedOpIds.add(opId);
        }
      }
    }

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
        !finalOperationIds.has(item.operationId) &&
        !yieldedOperationIds.has(item.operationId)
      ) {
        const prev = toolCallLastSeen.get(item.operationId);
        if (prev) toolCallSuppressedIds.add(prev);
        toolCallLastSeen.set(item.operationId, item.id);
      }
    }

    // ── Pass 2b: collapse assistant_partial rows (no final exists) ────────
    // While a stream is still in flight, the backend periodically writes
    // assistant_partial snapshots to Firestore so the work survives a crash.
    // On a mid-stream refresh, no assistant_final exists yet to suppress these,
    // so multiple partials render as separate bubbles (same answer twice, etc.)
    // until the final lands and the user refreshes again. Keep only the LAST
    // partial per operationId so the user sees the latest persisted state.
    //
    // IMPORTANT INVARIANT:
    // If an operation has any assistant_partial row and no assistant_final,
    // UI must not render assistant_tool_call prose for that same operationId.
    // Partial is a superset snapshot and rendering both creates duplicate
    // assistant bubbles after thread re-entry.
    //
    // Regression guard:
    // - agent-x-operation-chat-session.facade.spec.ts
    //   "suppresses assistant_tool_call rows when assistant_partial exists..."
    const partialSuppressedIds = new Set<string>();
    const partialLastSeen = new Map<string, string>();
    const operationIdsWithPartialNoFinal = new Set<string>();
    for (const item of items) {
      if (
        item.role === 'assistant' &&
        item.semanticPhase === 'assistant_partial' &&
        item.operationId &&
        !finalOperationIds.has(item.operationId) &&
        !yieldedOperationIds.has(item.operationId)
      ) {
        operationIdsWithPartialNoFinal.add(item.operationId);
        const prev = partialLastSeen.get(item.operationId);
        if (prev) partialSuppressedIds.add(prev);
        partialLastSeen.set(item.operationId, item.id);
      }
    }

    // ── Pass 2c: collapse tool_call rows for completed approval ops ─────────
    // Approval flows accumulate tool_call rows before the yield point. When the
    // operation later completes (assistant_final exists), keep only the LAST
    // tool_call so pre-approval context renders as a single clean bubble above
    // the final message on session reload.
    const completedApprovalToolCallSuppressedIds = new Set<string>();
    {
      const lastSeenToolCall = new Map<string, string>(); // operationId → id of latest row
      for (const item of items) {
        if (
          item.role === 'assistant' &&
          item.semanticPhase === 'assistant_tool_call' &&
          item.operationId &&
          approvalYieldedOpIds.has(item.operationId) &&
          finalOperationIds.has(item.operationId)
        ) {
          const prev = lastSeenToolCall.get(item.operationId);
          if (prev) completedApprovalToolCallSuppressedIds.add(prev);
          lastSeenToolCall.set(item.operationId, item.id);
        }
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

    return items.filter((item, index) => {
      // Suppress user messages that are replies to an answered ask_user card.
      // Their content is shown inline as yieldResolvedText on the resolved
      // card bubble rather than as a separate standalone message.
      if (
        item.role === 'user' &&
        typeof item.operationId === 'string' &&
        answeredYieldOpIds.has(item.operationId.trim())
      ) {
        return false;
      }

      if (item.role !== 'assistant') return true;

      // Suppress `assistant_yield` rows from rendering. These are persisted
      // by the worker so the LLM has the prompt text in its context on
      // resume — they are *not* user-facing. The same prompt is already
      // shown inside the inline approval / ask-user card carried by the
      // assistant_partial row (or the synthetic yield bubble created by
      // applyPendingYieldState). Rendering this row produces a duplicate
      // "Review and approve…" prose bubble alongside the card.
      if (item.semanticPhase === 'assistant_yield') {
        const opId = typeof item.operationId === 'string' ? item.operationId.trim() : '';
        // Keep answered yield rows — they render as resolved ask_user cards on
        // reload so history shows the question+answer pair. Active (unanswered)
        // yield rows are still suppressed; the card is shown via applyPendingYieldState.
        return opId.length > 0 && answeredYieldOpIds.has(opId);
      }

      // ask_user (needs_input) operations render as card-only interruptions.
      // Suppress prior trajectory for input ops only.
      // needs_approval operations keep their tool steps visible alongside the card.
      if (item.operationId && inputYieldedOpIds.has(item.operationId)) {
        return false;
      }

      // When assistant_final exists for this operationId, keep only the final
      // row. Suppress everything else — including assistant_partial snapshots
      // and untagged trajectory rows written by ThreadMessageWriter — to
      // prevent duplicate bubbles with repeated media/cards.
      //
      // Exception: completed approval flows also keep the last tool_call row
      // so pre-approval context (search results, step summaries) remains visible
      // alongside the final completion message after session reload.
      if (item.operationId && finalOperationIds.has(item.operationId)) {
        if (approvalYieldedOpIds.has(item.operationId)) {
          return (
            item.semanticPhase === 'assistant_final' || item.semanticPhase === 'assistant_tool_call'
          );
        }
        return item.semanticPhase === 'assistant_final';
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
        !yieldedOperationIds.has(item.operationId) &&
        !finalOperationIds.has(item.operationId) &&
        (item.semanticPhase === 'assistant_tool_call' || !item.semanticPhase)
      ) {
        return false;
      }

      // Suppress all-but-last assistant_tool_call rows (no final path).
      if (toolCallSuppressedIds.has(item.id)) return false;

      // Suppress earlier tool_call rows for completed approval ops (keep only last).
      if (completedApprovalToolCallSuppressedIds.has(item.id)) return false;

      // If a partial snapshot exists for this in-flight operation (and no
      // final/yield exists), prefer partial over tool_call so only one
      // assistant bubble renders during rehydrate.
      // Do not remove without updating the regression test referenced above.
      //
      // Exception: approval flows carry an inline card on the partial row AND
      // a separate tool_call showing pre-approval context. Both must render,
      // so skip the partial-supersedes-tool_call rule for approval ops.
      if (
        item.semanticPhase === 'assistant_tool_call' &&
        item.operationId &&
        operationIdsWithPartialNoFinal.has(item.operationId) &&
        !approvalYieldedOpIds.has(item.operationId)
      ) {
        return false;
      }

      // Suppress all-but-last assistant_partial rows (no final path).
      if (partialSuppressedIds.has(item.id)) return false;

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

  private isChatOperationId(value: string | null | undefined): boolean {
    const trimmed = value?.trim();
    return typeof trimmed === 'string' && trimmed.startsWith('chat-');
  }

  /**
   * Enqueue jobs use bare UUID operation ids. /chat sessions use chat-prefixed ids.
   * Hold enqueue jobs until done so partial Firestore deltas never render as live chat.
   */
  private shouldHoldEnqueueUntilDone(operationId: string | null | undefined): boolean {
    return this.isFirestoreOperationId(operationId) && !this.isChatOperationId(operationId);
  }

  private upsertEnqueueWaitingMessage(): void {
    this.messageFacade.messages.update((messages) => {
      const withoutTyping = messages.filter((message) => message.id !== 'typing');
      const hasWaiting = withoutTyping.some(
        (message) => message.id === AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
      );
      if (hasWaiting) return withoutTyping;
      return [
        ...withoutTyping,
        {
          id: AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID,
          role: 'assistant',
          content: AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT,
          timestamp: new Date(),
          isTyping: false,
        },
      ];
    });
  }

  private upsertEnqueueWaitingMessageNonBlocking(): void {
    this.messageFacade.messages.update((messages) => {
      const hasWaiting = messages.some(
        (message) => message.id === AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
      );
      if (hasWaiting) return messages;
      return [
        ...messages,
        {
          id: AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID,
          role: 'assistant',
          content: AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT,
          timestamp: new Date(),
          isTyping: false,
        },
      ];
    });
  }

  private clearCancelledEnqueueMarkerForActiveThread(): void {
    const host = this.requireHost();
    const threadId = host.resolvedThreadId()?.trim() || host.threadId().trim();
    if (!threadId) return;
    this.operationEventService.clearEnqueueCancelled(threadId);
  }

  private markEnqueueHeavySeen(): void {
    this.enqueueHeavySeenSinceLastCompletion = true;
    this.clearCancelledEnqueueMarkerForActiveThread();
  }

  private consumeEnqueueHeavySeen(): boolean {
    const seen = this.enqueueHeavySeenSinceLastCompletion;
    this.enqueueHeavySeenSinceLastCompletion = false;
    return seen;
  }

  private markThreadAsEnqueueWaiting(): void {
    const host = this.requireHost();
    const threadId = host.resolvedThreadId()?.trim() || host.threadId().trim();
    if (!threadId) return;
    this.operationEventService.markEnqueueWaiting(threadId);
    this.operationEventService.emitOperationStatusUpdated(
      threadId,
      'in-progress',
      new Date().toISOString(),
      'enqueue'
    );
    host.setOperationStatus('processing');
  }

  private isEnqueueHeavyTaskStep(step: AgentXToolStep | null | undefined): boolean {
    if (!step || step.stageType !== 'tool') return false;
    if (step.status !== 'active' && step.status !== 'success') return false;

    const metadata = step.metadata as Record<string, unknown> | undefined;
    const metadataToolName =
      metadata && typeof metadata['toolName'] === 'string' ? metadata['toolName'] : null;
    if (metadataToolName === AgentXOperationChatSessionFacade.ENQUEUE_HEAVY_TOOL_NAME) {
      return true;
    }

    const normalizedLabel = step.label.trim().toLowerCase();
    return normalizedLabel.startsWith('queu') && normalizedLabel.includes('background operation');
  }

  private clearEnqueueWaitingMessage(): void {
    this.messageFacade.messages.update((messages) =>
      messages.filter(
        (message) => message.id !== AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
      )
    );
  }

  /**
   * Called by transport when enqueue-heavy tool execution completes.
   * Converts the transient typing row into the persistent enqueue waiting card.
   */
  handleEnqueueHeavyDone(): void {
    this.markThreadAsEnqueueWaiting();
    this.upsertEnqueueWaitingMessageNonBlocking();
  }
  /**
   * Transitions the enqueue-waiting card to a "stopped" visual state.
   * Called when the user taps the stop/cancel button while viewing an
   * in-progress background job. The card stays visible but shows a muted
   * stopped treatment instead of the animated spinner.
   *
   * Also persists the cancelled status so that on session re-entry,
   * we skip history loading and show only the cancelled card.
   *
   * ┌─ STATE PERSISTENCE FOR CANCELLED ENQUEUE JOBS ─────────────────┐
   * │ When user cancels:                                             │
   * │   1. markEnqueueStopped() sets operationStatus = 'cancelled'   │
   * │   2. Card marked with interruptedReason: 'cancelled'           │
   * │                                                                 │
   * │ When user re-enters thread:                                    │
   * │   1. initializeExistingThread() checks operationStatus         │
   * │   2. If status === 'cancelled':                                │
   * │      - Insert cancelled enqueue card with interruptedReason    │
   * │      - Skip loadThreadMessages() (prevents history reload)     │
   * │      - Return early (no streams/subscriptions)                 │
   * │   3. Result: Only cancelled card visible, full chat blocked    │
   * │                                                                 │
   * │ Why this works: operationStatus is stored in-memory per        │
   * │ session OR persisted to Firestore/component state depending    │
   * │ on host implementation. Either way, re-entry detects it.       │
   * └─────────────────────────────────────────────────────────────────┘
   */
  markEnqueueStopped(): void {
    const host = this.requireHost();
    const threadId = host.threadId().trim() || host.resolvedThreadId() || host.contextId().trim();

    const hasEnqueueWaitingCard = this.messageFacade
      .messages()
      .some(
        (message) => message.id === AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
      );

    const hasEnqueueWaitingMarker =
      !!threadId && !!this.operationEventService.getEnqueueWaitingEntry(threadId);

    // clearRealtimePipelines() is shared by /chat and /enqueue flows.
    // Only persist "Task stopped" enqueue state when enqueue waiting is active.
    if (!hasEnqueueWaitingCard && !hasEnqueueWaitingMarker) {
      return;
    }

    this.messageFacade.messages.update((messages) =>
      messages.map((message) =>
        message.id === AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
          ? { ...message, interruptedReason: 'cancelled' as const }
          : message
      )
    );
    // Persist cancelled status in component signal (survives within current session)
    host.setOperationStatus('cancelled');
    // Record operationId NOW while the host still has the correct Firestore context.
    // On re-entry, this is used to strip exactly the partial assistant rows that
    // belong to this cancelled job — nothing more, nothing less.
    const operationId = this.resolveFirestoreOperationId();
    if (threadId) {
      this.operationEventService.clearEnqueueWaiting(threadId);
      this.operationEventService.markEnqueueCancelled(threadId, operationId);
    }
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
    deltaWatermark?: { optimisticChars: number; confirmedChars: number } | null,
    options?: { holdUntilDone?: boolean; threadIdForCompletionRefresh?: string }
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

    const holdUntilDone = options?.holdUntilDone === true;

    if (
      !holdUntilDone &&
      !this.messageFacade.messages().some((message) => message.id === 'typing')
    ) {
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
    } else if (holdUntilDone) {
      this.upsertEnqueueWaitingMessage();
      host.loading.set(true);
      host.setActivityPhase(
        'waiting_delta',
        AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT
      );
    }

    host.setActiveFirestoreSub(
      this.operationEventService.subscribe(
        operationId,
        {
          onDelta: (text) => {
            if (holdUntilDone) return;
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
            if (holdUntilDone) return;
            this.messageFacade.flushPendingTypingDelta();
            if (!step.label.trim()) return;
            if (this.isEnqueueHeavyTaskStep(step)) {
              this.markEnqueueHeavySeen();
            }
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
            if (holdUntilDone) return;
            this.messageFacade.flushPendingTypingDelta();
            // Route the card through the canonical attach helper so confirmation
            // cards carrying a yieldState collapse onto the existing yield bubble
            // instead of rendering as a second approval card on the typing row
            // after a hard refresh (Firestore replays buffered card events from
            // seq 0; the thread metadata yield has already produced one card via
            // applyPendingYieldState → upsertInlineYieldMessage).
            this.messageFacade.attachStreamedCard(
              'typing',
              card,
              host.getCurrentOperationId() ?? operationId ?? host.contextId(),
              false
            );
          },
          onMedia: (media) => {
            if (holdUntilDone) return;
            this.mergeLiveMediaIntoTypingMessage(media);
          },
          onProgress: (event) => {
            if (holdUntilDone) return;
            const message = typeof event.message === 'string' ? event.message.trim() : '';
            if (!message) return;
            host.latestProgressLabel.set(message);
            host.markActivityPulse(message);
          },
          onDone: (event) => {
            if (holdUntilDone) {
              const refreshThreadId =
                options?.threadIdForCompletionRefresh?.trim() ||
                host.resolvedThreadId()?.trim() ||
                host.threadId().trim();

              this.clearEnqueueWaitingMessage();
              host.latestProgressLabel.set(null);
              host.setActivityPhase('completed');
              host.setOperationStatus('complete');
              this.operationEventService.emitOperationStatusUpdated(
                refreshThreadId || operationId,
                'complete',
                new Date().toISOString()
              );
              host.loading.set(false);
              host.getActiveFirestoreSub()?.unsubscribe();
              host.setActiveFirestoreSub(null);
              host.setStreamTurnWatermark(null);
              void this.haptics.notification('success');
              this.transportFacade.emitResponseCompleteOnce('firestore-done-enqueue');

              if (refreshThreadId) {
                void this.loadThreadMessages(refreshThreadId);
              }

              this.logger.info('Background enqueue operation completed; rendering final output', {
                operationId,
                refreshThreadId,
              });
              this.enqueueHeavySeenSinceLastCompletion = false;
              return;
            }
            this.messageFacade.flushPendingTypingDelta();
            host.latestProgressLabel.set(null);
            const shouldDeferToEnqueueWaiting =
              event.success !== false && this.consumeEnqueueHeavySeen();

            if (shouldDeferToEnqueueWaiting) {
              this.normalizeTypingAssistantMediaMarkdown();
              this.messageFacade.finalizeStreamedAssistantMessage({
                streamingId: 'typing',
                messageId: event.messageId,
                success: event.success,
                source: 'firestore-done-enqueue-waiting',
              });
              this.markThreadAsEnqueueWaiting();
              this.upsertEnqueueWaitingMessageNonBlocking();
              host.setActivityPhase(
                'waiting_delta',
                AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT
              );
              host.loading.set(true);
              host.getActiveFirestoreSub()?.unsubscribe();
              host.setActiveFirestoreSub(null);
              host.setStreamTurnWatermark(null);
              this.transportFacade.emitResponseCompleteOnce('firestore-done-enqueue-waiting');
              this.logger.info('Background enqueue deferred to waiting card (Firestore)', {
                operationId,
              });
              return;
            }

            host.setActivityPhase('completed');
            this.normalizeTypingAssistantMediaMarkdown();
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
            if (holdUntilDone) {
              this.clearEnqueueWaitingMessage();
              host.latestProgressLabel.set(null);
              host.setActivityPhase('failed', error);
              this.messageFacade.pushMessage({
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
              this.transportFacade.emitResponseCompleteOnce('firestore-error-enqueue');
              this.logger.error(
                'Background enqueue operation failed before completion',
                new Error(error),
                {
                  operationId,
                }
              );
              this.enqueueHeavySeenSinceLastCompletion = false;
              return;
            }
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
            this.enqueueHeavySeenSinceLastCompletion = false;
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
      const timelinePendingYieldState = persistedPendingYieldState
        ? null
        : this.extractLatestPendingYieldFromItems(items);
      this.logger.info('Resolved pending yield candidates during thread load', {
        threadId,
        contextId: host.contextId(),
        fromThreadMetadata: !!persistedPendingYieldState,
        fromTimelineFallback: !!timelinePendingYieldState,
      });

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

      // Pre-compute yield reply content for the mapping step so answered
      // assistant_yield rows get yieldResolvedText injected inline.
      const yieldReplyByOpId = new Map<string, string>();
      for (const item of items) {
        if (
          item.semanticPhase === 'assistant_yield' &&
          typeof item.operationId === 'string' &&
          item.operationId.trim()
        ) {
          const opId = item.operationId.trim();
          const reply = items.find(
            (r) => r.role === 'user' && r.operationId === opId && r.content?.trim()
          );
          if (reply?.content?.trim()) {
            yieldReplyByOpId.set(opId, reply.content.trim());
          }
        }
      }

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
                  : part.type === 'text' && message.role === 'assistant'
                    ? {
                        type: 'text' as const,
                        content: this.promoteAssistantMediaUrlsToMarkdown(part.content),
                      }
                    : part
            ) ?? [];

          // User messages: render uploaded files in the attachment strip and
          // strip their URLs from the prose content to avoid double-rendering.
          // Assistant messages: no attachment strip — media URLs stay in the
          // markdown content exactly as the worker wrote them.
          const persistedMedia = message.role === 'user' ? this.collectMessageMedia(message) : {};

          const cleanContent =
            message.role === 'user'
              ? this.stripDisplayedMediaUrlsFromContent(
                  this.stripPersistedAttachmentAnnotations(message.content),
                  persistedMedia
                )
              : this.promoteAssistantMediaUrlsToMarkdown(
                  this.stripPersistedAttachmentAnnotations(message.content)
                );

          // BUG FIX: Rehydration drops text when cards are present.
          // nxt1-chat-bubble overrides legacy layout to strictly loop over `parts` if any exist.
          // We must ensure `cleanContent` is injected as a 'text' part so it renders.
          //
          // ORDER: append AFTER existing parts (not prepend). The streaming
          // facade pushes the post-tool summary text to the end of `parts`
          // (after the success card), so the live layout reads as
          // text(early) → card → text(summary). When the worker persists
          // only the card into `parts` and stores the full content string
          // separately, prepending the text would flip the layout to
          // text → card on rehydrate. Appending preserves the live order.
          if (persistedParts.length > 0 && cleanContent.length > 0) {
            const hasTextPart = persistedParts.some((p) => p.type === 'text');
            if (!hasTextPart) {
              persistedParts = [
                ...persistedParts,
                { type: 'text' as const, content: cleanContent },
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

          const persistedYieldState = this.coercePersistedYieldStateFromMessage(
            message,
            persistedCards
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

          // For answered assistant_yield rows (kept by resolveCanonicalAssistantRows
          // when a user reply exists), force yieldCardState='resolved' and populate
          // yieldResolvedText from the reply so the card renders as answered on reload.
          const yieldRowOpId =
            typeof message.operationId === 'string' ? message.operationId.trim() : '';
          const yieldRowReplyText = yieldRowOpId ? yieldReplyByOpId.get(yieldRowOpId) : undefined;
          const effectiveYieldCardState: 'idle' | 'submitting' | 'resolved' | undefined =
            message.semanticPhase === 'assistant_yield' && yieldRowReplyText
              ? 'resolved'
              : persistedYieldCardState;
          const effectiveYieldResolvedText =
            message.semanticPhase === 'assistant_yield' && yieldRowReplyText
              ? yieldRowReplyText
              : persistedYieldResolvedText;
          const effectiveContent = message.semanticPhase === 'assistant_yield' ? '' : cleanContent;

          return {
            id: message.id ?? host.uid(),
            // Phase J (thread-as-truth): preserve role fidelity. The
            // chat session computed signal filters tool/system rows so
            // they don't render as visible bubbles — but they are kept
            // in the persisted feed so debugging/replay tooling can
            // surface them.
            role: message.role,
            operationId: typeof message.operationId === 'string' ? message.operationId : undefined,
            content: effectiveContent,
            timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
            ...(persistedSteps.length > 0 ? { steps: persistedSteps } : {}),
            ...(persistedParts.length > 0 ? { parts: persistedParts } : {}),
            ...(persistedCards.length > 0 ? { cards: persistedCards } : {}),
            ...(persistedYieldState ? { yieldState: persistedYieldState } : {}),
            ...(effectiveYieldCardState ? { yieldCardState: effectiveYieldCardState } : {}),
            ...(effectiveYieldResolvedText
              ? { yieldResolvedText: effectiveYieldResolvedText }
              : {}),
            ...persistedMedia,
          };
        });

      const dedupedMapped = this.dedupeConsecutiveAssistantMessages(mapped);
      const reorderedMapped = this.reorderTurnsByPairing(dedupedMapped);

      // Preserve any in-flight typing bubble across the persisted-history
      // replace. Without this, callers that synchronously inserted a typing
      // bubble (e.g. stream-registry rehydrate on session re-entry) would see
      // the bubble flash + disappear when this set() lands before the post-
      // load .then() can re-insert it. Persisted history never contains a
      // typing bubble, so this is purely additive.
      //
      // ALSO: drop any persisted assistant rows whose operationId matches the
      // live in-flight operation. Those are `assistant_partial` snapshots that
      // the backend writes periodically; the typing bubble already represents
      // the latest live content for that operation. Without this filter, the
      // partial renders ABOVE the typing bubble and the user sees the same
      // sentence twice until the stream completes (assistant_final) and
      // resolveCanonicalAssistantRows suppresses the partial on next reload.
      const existingMessages = this.messageFacade.messages();
      const existingTyping = existingMessages.find((m) => m.id === 'typing');
      const preservedInlineYieldRows = existingMessages.filter(
        (message) =>
          message.id !== 'typing' &&
          !!message.yieldState &&
          !reorderedMapped.some((persisted) => persisted.id === message.id)
      );
      // Note: no need to merge in-memory yieldCardState onto reloaded rows.
      // resolveExternalCardStateForMessage() in the template derives 'resolved' from the
      // message array itself (is there a user message after this index?) — the same way
      // normal chat works. Transient submitting/idle state is short-lived and doesn't
      // need to survive a history reload.
      let persistedRows = reorderedMapped;
      let preserveTyping = !!existingTyping;
      if (existingTyping) {
        const liveOperationId = this.streamRegistry.getOperationIdForThread(threadId);
        if (liveOperationId) {
          const rowsBeforeFilter = reorderedMapped.length;
          const assistantRowsForLiveOperation = reorderedMapped.filter(
            (m) => m.role === 'assistant' && m.operationId === liveOperationId
          ).length;

          persistedRows = reorderedMapped.filter((m) => {
            if (m.role !== 'assistant' || m.operationId !== liveOperationId) return true;

            // Keep interruption rows (ask_user/approval) for the live operation.
            // Dropping all assistant rows for the active operation causes the
            // pending action card to disappear on session re-entry.
            if (m.yieldState || this.messageHasYieldCard(m)) return true;

            return false;
          });

          const hasPersistedYieldAssistantForLiveOperation =
            this.hasYieldedAssistantRowForOperation(persistedRows, liveOperationId);
          if (hasPersistedYieldAssistantForLiveOperation) {
            preserveTyping = false;
          }

          this.logger.info('Applied live-operation assistant row filter during thread rehydrate', {
            threadId,
            contextId: host.contextId(),
            liveOperationId,
            rowsBeforeFilter,
            rowsAfterFilter: persistedRows.length,
            assistantRowsForLiveOperation,
            preserveTyping,
            hasPersistedYieldAssistantForLiveOperation,
          });
        }
      }
      this.messageFacade.messages.set(
        preserveTyping && existingTyping
          ? [...persistedRows, ...preservedInlineYieldRows, existingTyping]
          : [...persistedRows, ...preservedInlineYieldRows]
      );

      const enqueueWaitingEntry = this.operationEventService.getEnqueueWaitingEntry(threadId);
      if (enqueueWaitingEntry) {
        const latestAssistantTimestampMs = mapped
          .filter((message) => message.role === 'assistant')
          .reduce((latest, message) => Math.max(latest, message.timestamp.getTime()), 0);
        const waitingStillActive =
          latestAssistantTimestampMs <= enqueueWaitingEntry.queuedAt + 30_000;

        if (waitingStillActive) {
          this.upsertEnqueueWaitingMessage();
          host.setOperationStatus('processing');
          this.operationEventService.emitOperationStatusUpdated(
            threadId,
            'in-progress',
            new Date().toISOString(),
            'enqueue'
          );
        } else {
          this.operationEventService.clearEnqueueWaiting(threadId);
        }
      }

      const hasMatchingYieldMessage = (yieldState: AgentYieldState): boolean => {
        const incomingApprovalId = yieldState.approvalId?.trim() ?? '';
        const incomingToolCallId = yieldState.pendingToolCall?.toolCallId?.trim() ?? '';
        const incomingReason = yieldState.reason;
        const incomingOpId = this.resolveYieldOperationId(yieldState);

        return this.messageFacade.messages().some((message) => {
          const candidate = message.yieldState;
          if (!candidate) return false;

          const candidateApprovalId = candidate.approvalId?.trim() ?? '';
          if (
            incomingApprovalId &&
            candidateApprovalId &&
            incomingApprovalId === candidateApprovalId
          ) {
            return true;
          }

          const candidateToolCallId = candidate.pendingToolCall?.toolCallId?.trim() ?? '';
          if (
            incomingToolCallId &&
            candidateToolCallId &&
            incomingToolCallId === candidateToolCallId
          ) {
            return true;
          }

          return (
            candidate.reason === incomingReason && (message.operationId ?? '') === incomingOpId
          );
        });
      };

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
        if (!hasMatchingYieldMessage(persistedPendingYieldState)) {
          this.applyPendingYieldState(persistedPendingYieldState, threadId, 'thread-metadata');
        } else {
          this.logger.info(
            'Skipped applying thread-metadata yield: already present in mapped messages',
            {
              threadId,
              contextId: host.contextId(),
            }
          );
        }
      } else if (timelinePendingYieldState) {
        // Fallback: recover pending yield from persisted message rows when
        // thread-level `latestPausedYieldState` is missing/stale.
        if (!hasMatchingYieldMessage(timelinePendingYieldState)) {
          this.applyPendingYieldState(timelinePendingYieldState, threadId, 'timeline-fallback');
        } else {
          this.logger.info(
            'Skipped applying timeline-fallback yield: already present in mapped messages',
            {
              threadId,
              contextId: host.contextId(),
            }
          );
        }
      } else {
        // No persisted yield from thread metadata — sync any pre-existing active
        // yield that arrived via live SSE before this thread history load completed.
        const activeYield = host.activeYieldState();
        if (activeYield && !hasMatchingYieldMessage(activeYield)) {
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
      const hasPendingYieldInTimeline = reorderedMapped.some(
        (message) =>
          !!message.yieldState &&
          (message.yieldCardState === undefined || message.yieldCardState !== 'resolved')
      );
      if (
        host.getOperationStatus() === 'processing' &&
        hasAssistantReply &&
        !host.activeYieldState() &&
        !hasPendingYieldInTimeline
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

      if (host.getOperationStatus() === 'complete') {
        this.messageFacade.settleActiveToolSteps('success');
      } else if (host.getOperationStatus() === 'error' || host.getOperationStatus() === 'paused') {
        this.messageFacade.settleActiveToolSteps('error');
      }
      // awaiting_input / awaiting_approval: leave active steps unsettled.
      // The yield card owns the UI for this state; settling steps as 'error'
      // causes them to render as "cancelled" which is incorrect.

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

    // ┌─ CANCELLED ENQUEUE JOB ────────────────────────────────────────────────┐
    // │ Must check FIRST — before the snapshot block returns early.           │
    // │                                                                        │
    // │ Detection (root-level Set survives navigation/component-destroy):     │
    // │  1. operationEventService.isEnqueueCancelled(threadId)               │
    // │  2. host.getOperationStatus() === 'cancelled' (same-session fallback) │
    // │                                                                        │
    // │ Behaviour: Load the full thread history so the user sees their prior  │
    // │ messages, but strip any assistant rows that belong to this enqueue    │
    // │ operation (partial deltas/tool calls that never completed), then pin  │
    // │ the cancelled card as the final message. No streams are opened.       │
    // └────────────────────────────────────────────────────────────────────────┘
    const cancelledEntry = this.operationEventService.getEnqueueCancelledEntry(threadId);

    // Guard against stale markers accidentally persisted from /chat paths.
    if (cancelledEntry?.operationId && this.isChatOperationId(cancelledEntry.operationId)) {
      this.operationEventService.clearEnqueueCancelled(threadId);
    }

    const hasCancelledEnqueueMarker =
      !!cancelledEntry?.operationId && !this.isChatOperationId(cancelledEntry.operationId);

    const isCancelledEnqueue = hasCancelledEnqueueMarker;

    if (isCancelledEnqueue) {
      this.logger.info('Restoring cancelled enqueue — loading history with cancelled card', {
        contextId: host.contextId(),
        threadId,
      });

      // Retrieve what was stored at cancellation time: the operationId of the
      // cancelled job AND the timestamp. operationId is the authoritative
      // discriminator — it matches `message.operationId` on persisted rows.
      // cancelledAt is a fallback when operationId is unavailable (migrated entries).
      const storedOperationId = cancelledEntry?.operationId ?? null;
      const cancelledAt = cancelledEntry?.cancelledAt ?? 0;

      void this.loadThreadMessages(threadId).then(() => {
        this.messageFacade.messages.update((messages) => {
          // Remove the client-only enqueue waiting card if already present.
          const withoutCard = messages.filter(
            (m) => m.id !== AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
          );

          let beforeCard: typeof withoutCard;
          let afterCard: typeof withoutCard;

          if (storedOperationId) {
            // ── operationId path (precise) ──────────────────────────────────
            // Split at the FIRST assistant message that belongs to the cancelled
            // job. Everything before that index stays as-is (prior conversations).
            // The job's own assistant rows are stripped (replaced by the card).
            // Everything after those rows (post-cancel user messages + replies)
            // stays after the card.
            const firstOpIdx = withoutCard.findIndex(
              (m) => m.role === 'assistant' && m.operationId === storedOperationId
            );

            if (firstOpIdx === -1) {
              // No op rows found in history — card goes at end of existing messages.
              beforeCard = withoutCard;
              afterCard = [];
            } else {
              // Everything before the first op row.
              beforeCard = withoutCard.slice(0, firstOpIdx);
              // Skip all contiguous op rows, then collect the rest as afterCard.
              let idx = firstOpIdx;
              while (
                idx < withoutCard.length &&
                withoutCard[idx].operationId === storedOperationId
              ) {
                idx++;
              }
              afterCard = withoutCard.slice(idx);
            }
          } else if (cancelledAt > 0) {
            // ── timestamp fallback ──────────────────────────────────────────
            // Messages timestamped after the cancellation are post-cancel replies.
            beforeCard = withoutCard.filter(
              (m) => !m.timestamp || m.timestamp.getTime() <= cancelledAt
            );
            afterCard = withoutCard.filter(
              (m) => !!m.timestamp && m.timestamp.getTime() > cancelledAt
            );
          } else {
            // Fully migrated/unknown entry — all messages go before the card.
            beforeCard = withoutCard;
            afterCard = [];
          }
          // Keep the cancelled enqueue card pinned even when the user continues
          // the thread. This preserves stopped-job context and suppresses
          // cancelled enqueue output replay on follow-up and rehydrate.

          const cancelledCard: (typeof messages)[number] = {
            id: AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID,
            role: 'assistant',
            content: AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT,
            timestamp: new Date(cancelledAt || Date.now()),
            isTyping: false,
            interruptedReason: 'cancelled' as const,
          };

          return [...beforeCard, cancelledCard, ...afterCard];
        });
        host.loading.set(false);
      });
      return;
    }

    const snapshot = this.streamRegistry.claim(threadId, {
      onDelta: (text) => {
        // Mirror live transport: every delta is a pulse. The pulse handler
        // auto-promotes waiting_delta/connected/reconnecting -> streaming and
        // re-arms the gap timer so a quiet stretch flips back to waiting_delta.
        host.markActivityPulse();
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
        if (this.isEnqueueHeavyTaskStep(step)) {
          this.markEnqueueHeavySeen();
        }
        // Mirror live transport phase logic so the shimmer/loader behavior on
        // session re-entry matches first-watch streaming.
        if (step.status === 'active') {
          host.setActivityPhase('running_tool', step.label);
        } else if (
          step.stageType === 'tool' &&
          (step.status === 'success' || step.status === 'error')
        ) {
          // Tool finished: leave running_tool so waiting_delta shimmer can show
          // while the model computes the next assistant text delta.
          host.setActivityPhase('waiting_delta');
        } else {
          host.markActivityPulse();
        }
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
        // A card landing typically means a tool just emitted output; keep the
        // shimmer pulsed so it doesn't drop out before the next phase update.
        host.markActivityPulse();
        // Route through the canonical attach helper so confirmation cards
        // carrying a yieldState collapse onto the existing yield bubble
        // instead of stacking a duplicate approval card on the typing row
        // when the registry replays buffered events on session re-entry.
        this.messageFacade.attachStreamedCard(
          'typing',
          card,
          host.getCurrentOperationId() ?? host.contextId(),
          false
        );
      },
      onDone: (event) => {
        this.messageFacade.flushPendingTypingDelta();
        this.normalizeTypingAssistantMediaMarkdown();
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
        if ((event == null || event['success'] !== false) && this.consumeEnqueueHeavySeen()) {
          this.markThreadAsEnqueueWaiting();
          this.upsertEnqueueWaitingMessageNonBlocking();
        }
        host.setActivityPhase('completed');
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
        host.setActivityPhase('failed', error || null);
        host.loading.set(false);
        this.enqueueHeavySeenSinceLastCompletion = false;
        void this.haptics.notification('error');
      },
    });

    if (snapshot) {
      this.logger.info('Rehydrating from stream registry', {
        threadId,
        contentLength: snapshot.content.length,
        done: snapshot.done,
      });

      // Seed the activity phase immediately on re-entry so the shimmer shows
      // while we wait for the next stream callback. Without this, _activityPhase
      // stays 'idle' (the component default) and showThinking returns false even
      // though the stream is still running in the background.
      //
      // Use waiting_delta as the default because it always renders the shimmer,
      // even if the typing bubble already has visible text from earlier deltas.
      // The next real callback will move the phase forward naturally.
      if (!snapshot.done) {
        const activeStep = [...snapshot.steps].reverse().find((s) => s.status === 'active');
        if (activeStep) {
          host.setActivityPhase('running_tool', activeStep.label || null);
        } else {
          host.setActivityPhase('waiting_delta');
        }
        host.loading.set(true);

        // The shimmer template guard requires both an in-flight phase and a
        // typing bubble in the message list. Insert that bubble synchronously
        // on remount so the shimmer paints immediately, even during a silent
        // thinking gap before the next delta/step arrives.
        if (!this.messageFacade.messages().some((message) => message.id === 'typing')) {
          const snapshotCardsWithoutYield = snapshot.cards.filter(
            (card) => !this.isYieldRichCard(card)
          );
          const snapshotPartsWithoutYield = this.stripYieldCardsFromParts(snapshot.parts);
          this.messageFacade.messages.update((messages) => [
            ...messages,
            {
              id: 'typing',
              role: 'assistant',
              content: snapshot.content,
              timestamp: new Date(),
              isTyping: !snapshot.content,
              steps: snapshot.steps.length > 0 ? [...snapshot.steps] : undefined,
              cards:
                snapshotCardsWithoutYield.length > 0 ? [...snapshotCardsWithoutYield] : undefined,
              parts:
                snapshotPartsWithoutYield.length > 0 ? [...snapshotPartsWithoutYield] : undefined,
            },
          ]);

          this.replayYieldCardsIntoTypingRow(
            snapshot.cards,
            host.getCurrentOperationId() ?? host.contextId(),
            'stream-registry-snapshot'
          );
        }
      }

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
            //
            // IMPORTANT: loadThreadMessages applies promoteAssistantMediaUrlsToMarkdown to
            // assistant message content (bare URLs → markdown image/video syntax). The stream
            // registry stores raw SSE content (bare URLs unchanged). Normalize fresh.content
            // through the same promotion pipeline before comparing, or the strings will never
            // match and a duplicate bubble gets injected on every session re-entry.
            const normalizedFreshContent = this.normalizeMessageContent(
              this.promoteAssistantMediaUrlsToMarkdown(fresh.content)
            );
            const alreadyPresent = this.messageFacade
              .messages()
              .some(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  this.normalizeMessageContent(m.content) === normalizedFreshContent
              );
            if (!alreadyPresent) {
              const freshCardsWithoutYield = fresh.cards.filter(
                (card) => !this.isYieldRichCard(card)
              );
              const freshPartsWithoutYield = this.stripYieldCardsFromParts(fresh.parts);
              this.messageFacade.messages.update((messages) => [
                ...messages,
                {
                  id: host.uid(),
                  role: 'assistant',
                  content: fresh.content,
                  timestamp: new Date(),
                  isTyping: false,
                  steps: fresh.steps.length > 0 ? [...fresh.steps] : undefined,
                  cards:
                    freshCardsWithoutYield.length > 0 ? [...freshCardsWithoutYield] : undefined,
                  parts:
                    freshPartsWithoutYield.length > 0 ? [...freshPartsWithoutYield] : undefined,
                },
              ]);
            }
            host.loading.set(false);
            this.transportFacade.emitResponseCompleteOnce('stream-registry-rehydrate-done');
          }
          return;
        }

        if (fresh.content || fresh.steps.length || fresh.cards.length) {
          const liveOperationId = this.streamRegistry.getOperationIdForThread(threadId);
          if (
            liveOperationId &&
            this.hasYieldedAssistantRowForOperation(this.messageFacade.messages(), liveOperationId)
          ) {
            host.loading.set(false);
            return;
          }

          // Bug A: cancel any RAF-buffered delta that accumulated between claim() and
          // this bubble insert. fresh.content already has all content from the registry,
          // so the pending delta would be double-counted if the RAF fired after insertion.
          this.messageFacade.clearPendingTypingDelta();
          this.messageFacade.messages.update((messages) => {
            // Guard: if a finalized (non-typing) assistant message already has
            // this exact content, the operation completed before we arrived
            // here. Adding a second bubble would show the answer twice.
            // Normalize fresh.content through the same URL-promotion pipeline that
            // loadThreadMessages applies so bare-URL vs markdown-URL variants match.
            if (
              fresh.content?.trim() &&
              messages.some(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  this.normalizeMessageContent(m.content) ===
                    this.normalizeMessageContent(
                      this.promoteAssistantMediaUrlsToMarkdown(fresh.content)
                    )
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
                cards: fresh.cards.filter((card) => !this.isYieldRichCard(card)).length
                  ? [...fresh.cards.filter((card) => !this.isYieldRichCard(card))]
                  : undefined,
                parts: this.stripYieldCardsFromParts(fresh.parts).length
                  ? [...this.stripYieldCardsFromParts(fresh.parts)]
                  : undefined,
              },
            ];
          });

          this.replayYieldCardsIntoTypingRow(
            fresh.cards,
            host.getCurrentOperationId() ?? host.contextId(),
            'stream-registry-fresh-snapshot'
          );
        } else {
          // Race condition fix: loadThreadMessages calls messages.set() and
          // wipes the synchronous typing bubble we inserted before awaiting
          // history. When the snapshot is empty AND the stream is still
          // in-flight (no deltas yet), we MUST re-insert the placeholder
          // bubble — otherwise the shimmer template guard
          // (`@if (msg.id === 'typing' && showThinking())`) sees no bubble
          // and renders nothing while the model thinks silently.
          this.messageFacade.messages.update((messages) =>
            messages.some((m) => m.id === 'typing')
              ? messages
              : [
                  ...messages,
                  {
                    id: 'typing',
                    role: 'assistant',
                    content: '',
                    timestamp: new Date(),
                    isTyping: true,
                  },
                ]
          );
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

        // Always fetch stored state first — historical assistant replies from prior turns
        // must NOT block subscribing to the current in-flight operation. The done/in-flight
        // branches below correctly dedupe content for the current operationId.
        const stored = await this.operationEventService.getStoredEventState(operationId);
        const replayContentSuffix = this.buildMediaContentSuffixFromReplayEvents(stored.media);
        const holdEnqueueUntilDone = this.shouldHoldEnqueueUntilDone(operationId);

        if (stored.latestYieldState) {
          host.applyYieldState({
            yieldState: stored.latestYieldState,
            source: 'stored-state-rehydrate',
            operationId,
          });
        }

        if (stored.isDone) {
          this.clearEnqueueWaitingMessage();
          const alreadyHasAssistant = this.messageFacade
            .messages()
            .some(
              (message) =>
                !message.isTyping && message.role === 'assistant' && message.content?.trim()
            );
          // Normalize stored.content (raw Firestore event delta — bare URLs) through the
          // same URL-promotion pipeline that loadThreadMessages applies to assistant messages,
          // so bare-URL vs markdown-URL variants compare equal and we don't inject a duplicate.
          const normalizedStoredContent = this.normalizeMessageContent(
            this.promoteAssistantMediaUrlsToMarkdown(stored.content)
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
                  this.normalizeMessageContent(message.content) === normalizedStoredContent
              )
          ) {
            this.messageFacade.messages.update((messages) => [
              ...messages,
              {
                id: host.uid(),
                role: 'assistant',
                content: stored.content + replayContentSuffix,
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

        if (holdEnqueueUntilDone) {
          // Hide any partial assistant rows for this enqueue operation until completion.
          this.messageFacade.messages.update((messages) =>
            messages.filter(
              (message) =>
                !(
                  message.role === 'assistant' &&
                  message.operationId === operationId &&
                  !message.yieldState &&
                  !this.messageHasYieldCard(message)
                )
            )
          );
          this.upsertEnqueueWaitingMessage();
          host.setActivityPhase(
            'waiting_delta',
            AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT
          );
          host.loading.set(true);
          this.subscribeToFirestoreJobEvents(undefined, stored.maxSeq, undefined, {
            holdUntilDone: true,
            threadIdForCompletionRefresh: threadId,
          });
          return;
        }

        // Phase 5: use stored.parts directly — getStoredEventState now builds parts
        // in seq order (same merge logic as the SSE stream registry) so text, tools,
        // and cards are interleaved at their exact positions. No manual storedParts
        // construction here that would hardcode tools-first/text-last order.
        this.messageFacade.messages.update((messages) => {
          if (messages.some((message) => message.id === 'typing')) return messages;
          // Hard-refresh dedup: loadThreadMessages may have inserted persisted
          // assistant rows for the SAME in-flight operation (e.g. preamble-only
          // assistant_tool_call rows from earlier ReAct iterations). The typing
          // bubble we are about to insert already represents the full live state
          // (stored.content/steps/parts/cards from accumulated event log).
          // Without this filter the user sees the preamble twice — once in the
          // persisted bubble, once in the typing bubble — until assistant_final
          // lands and the next render suppresses the partial.
          const filtered = messages.filter(
            (m) => m.role !== 'assistant' || m.operationId !== operationId
          );
          return [
            ...filtered,
            {
              id: 'typing',
              role: 'assistant',
              content: stored.content + replayContentSuffix,
              timestamp: new Date(),
              isTyping: !stored.content,
              steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
              parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
              cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
            },
          ];
        });
        const activeStep = [...stored.steps].reverse().find((step) => step.status === 'active');
        if (activeStep) {
          host.setActivityPhase('running_tool', activeStep.label || null);
        } else {
          host.setActivityPhase('waiting_delta');
        }
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
      host.applyYieldState({
        yieldState: stored.latestYieldState,
        source: 'stored-state-pending',
        operationId,
      });
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

  private coercePersistedYieldStateFromMessage(
    message: AgentMessage,
    persistedCards: readonly AgentXRichCard[]
  ): AgentYieldState | null {
    const fromResultData = this.coercePersistedYieldState(message.resultData?.['yieldState']);
    if (fromResultData) return fromResultData;

    // Reconstruct yield state from persisted assistant_yield rows.
    // The worker saves content = promptToUser (the ask_user question) when the
    // agent pauses for input. No rich card payload is stored on this row, so
    // we build a minimal AgentYieldState from the content string.
    if (message.semanticPhase === 'assistant_yield' && message.content?.trim()) {
      const question = message.content.trim();
      const normalizedPrompt = question.toLowerCase();
      const looksLikeApprovalPrompt =
        normalizedPrompt.includes('review and approve') ||
        normalizedPrompt.includes('approve this') ||
        normalizedPrompt.includes('approval required');
      // Approval yields require structured payload (approvalId/actions). If we
      // coerce these prose prompts into needs_input, replay can show a random
      // ask-user card after completed turns.
      if (looksLikeApprovalPrompt) {
        return null;
      }
      const operationId = typeof message.operationId === 'string' ? message.operationId.trim() : '';
      const yieldedAt = message.createdAt ?? new Date().toISOString();
      const expiresAt = new Date(Date.parse(yieldedAt) + 24 * 60 * 60 * 1000).toISOString();
      return {
        reason: 'needs_input',
        promptToUser: question,
        agentId: message.agentId ?? 'router',
        messages: [],
        pendingToolCall: {
          toolName: 'ask_user',
          toolCallId: operationId
            ? `ask_user:${operationId}`
            : `ask_user:${message.id ?? 'unknown'}`,
          toolInput: { question, ...(operationId ? { operationId } : {}) },
        },
        yieldedAt,
        expiresAt,
      };
    }

    for (const card of persistedCards) {
      if (card.type === 'confirmation') {
        const payload = card.payload as Record<string, unknown> | undefined;
        const fromCard = this.coercePersistedYieldState(payload?.['yieldState']);
        if (fromCard) return fromCard;
      }

      if (card.type === 'ask_user') {
        const payload = card.payload as AgentXAskUserPayload | undefined;
        if (!payload) continue;

        const question = payload.question?.trim();
        if (!question) continue;

        const context = typeof payload.context === 'string' ? payload.context.trim() : '';
        const operationId =
          typeof payload.operationId === 'string' && payload.operationId.trim().length > 0
            ? payload.operationId.trim()
            : typeof message.operationId === 'string'
              ? message.operationId.trim()
              : '';
        const threadId = typeof payload.threadId === 'string' ? payload.threadId.trim() : '';
        const yieldedAt = message.createdAt ?? new Date().toISOString();
        const expiresAt = new Date(Date.parse(yieldedAt) + 24 * 60 * 60 * 1000).toISOString();

        return {
          reason: 'needs_input',
          promptToUser: context ? `${question}\n\n${context}` : question,
          agentId: message.agentId ?? card.agentId ?? 'router',
          messages: [],
          pendingToolCall: {
            toolName: 'ask_user',
            toolCallId: operationId ? `ask_user:${operationId}` : `ask_user:${message.id}`,
            toolInput: {
              question,
              ...(context ? { context } : {}),
              ...(operationId ? { operationId } : {}),
              ...(threadId ? { threadId } : {}),
            },
          },
          yieldedAt,
          expiresAt,
        };
      }
    }

    return null;
  }

  private extractLatestPendingYieldFromItems(
    items: readonly AgentMessage[]
  ): AgentYieldState | null {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.role !== 'assistant') continue;

      const persistedCards: AgentXRichCard[] =
        item.parts
          ?.filter(
            (part): part is Extract<AgentXMessagePart, { type: 'card' }> => part.type === 'card'
          )
          .map((part) => part.card) ?? [];

      const yieldState = this.coercePersistedYieldStateFromMessage(item, persistedCards);
      if (!yieldState) continue;

      const persistedYieldCardStateRaw = item.resultData?.['yieldCardState'];
      if (persistedYieldCardStateRaw === 'resolved') continue;

      return yieldState;
    }

    return null;
  }

  private applyPendingYieldState(
    yieldState: AgentYieldState,
    threadId: string,
    source: string
  ): void {
    const host = this.requireHost();
    const pendingStatus = this.inferOperationStatusFromYield(yieldState);
    host.applyYieldState({
      yieldState,
      source,
      operationId: this.resolveYieldOperationId(yieldState),
    });
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

  private isYieldRichCard(card: AgentXRichCard): boolean {
    if (card.type === 'ask_user') return true;
    if (card.type !== 'confirmation') return false;

    const payload = card.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') return false;

    if (typeof payload['approvalId'] === 'string' && payload['approvalId'].trim().length > 0) {
      return true;
    }

    return !!this.coercePersistedYieldState(payload['yieldState']);
  }

  private messageHasYieldCard(
    message: Pick<OperationMessage, 'cards' | 'parts'> | Pick<AgentMessage, 'cards' | 'parts'>
  ): boolean {
    const cardFromCards = (message.cards ?? []).some((card) => this.isYieldRichCard(card));
    if (cardFromCards) return true;

    return (message.parts ?? []).some(
      (part) => part.type === 'card' && this.isYieldRichCard(part.card)
    );
  }

  private hasYieldedAssistantRowForOperation(
    messages: readonly Pick<
      OperationMessage,
      'role' | 'operationId' | 'yieldState' | 'cards' | 'parts'
    >[],
    operationId: string
  ): boolean {
    return messages.some(
      (message) =>
        message.role === 'assistant' &&
        message.operationId === operationId &&
        (!!message.yieldState || this.messageHasYieldCard(message))
    );
  }

  private stripYieldCardsFromParts(parts: readonly AgentXMessagePart[]): AgentXMessagePart[] {
    return parts.filter((part) => part.type !== 'card' || !this.isYieldRichCard(part.card));
  }

  private replayYieldCardsIntoTypingRow(
    cards: readonly AgentXRichCard[],
    fallbackOperationId: string,
    source: string
  ): void {
    const yieldCards = cards.filter((card) => this.isYieldRichCard(card));
    if (!yieldCards.length) return;

    this.logger.info('Replaying yield cards from stream snapshot into canonical row', {
      source,
      fallbackOperationId,
      count: yieldCards.length,
      cardTypes: yieldCards.map((card) => card.type),
    });

    for (const card of yieldCards) {
      this.messageFacade.attachStreamedCard('typing', card, fallbackOperationId, false);
    }
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
