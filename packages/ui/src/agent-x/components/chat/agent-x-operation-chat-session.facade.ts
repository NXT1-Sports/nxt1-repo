import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import {
  sanitizeStorageUrlsFromText,
  type AgentMessage,
  type AgentYieldState,
  type AgentXAttachment,
  AgentXAskUserPayload,
  type AgentXEffortLevel,
  type AgentXExecutionMode,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXSelectedContext,
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
import { stripDistilledSectionTransitionLines } from './agent-x-operation-chat.utils';
import { AgentXOperationChatMessageFacade } from './agent-x-operation-chat-message.facade';
import { AgentXOperationChatTransportFacade } from './agent-x-operation-chat-transport.facade';
import { AgentXOperationChatAttachmentsFacade } from './agent-x-operation-chat-attachments.facade';

// const VIDEO_ATTACHMENT_THUMBNAIL_MAX_EDGE_PX = 320;

// function resolveThumbnailDimensions(
//   sourceWidth: number,
//   sourceHeight: number
// ): {
//   readonly width: number;
//   readonly height: number;
// } {
//   const safeWidth = Math.max(1, Math.round(sourceWidth) || 320);
//   const safeHeight = Math.max(1, Math.round(sourceHeight) || 180);
//   const maxEdge = Math.max(safeWidth, safeHeight);

//   if (maxEdge <= VIDEO_ATTACHMENT_THUMBNAIL_MAX_EDGE_PX) {
//     return {
//       width: safeWidth,
//       height: safeHeight,
//     };
//   }

//   const scale = VIDEO_ATTACHMENT_THUMBNAIL_MAX_EDGE_PX / maxEdge;
//   return {
//     width: Math.max(1, Math.round(safeWidth * scale)),
//     height: Math.max(1, Math.round(safeHeight * scale)),
//   };
// }

function storageObjectPathFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/\/o\/(.+)$/);
      return match?.[1] ? decodeURIComponent(match[1]).replace(/^\/+/, '') : null;
    }

    if (hostname === 'storage.googleapis.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts.length >= 2 ? decodeURIComponent(parts.slice(1).join('/')) : null;
    }

    if (hostname.endsWith('.storage.googleapis.com')) {
      return decodeURIComponent(parsed.pathname).replace(/^\/+/, '') || null;
    }
  } catch {
    return null;
  }

  return null;
}

function mediaDirectoryKeyFromUrl(value: string): string | null {
  const objectPath = storageObjectPathFromUrl(value);
  if (!objectPath) return null;
  const lastSlash = objectPath.lastIndexOf('/');
  return lastSlash > 0 ? objectPath.slice(0, lastSlash).toLowerCase() : null;
}

function shareStorageMediaDirectory(leftUrl: string, rightUrl: string): boolean {
  const leftDirectory = mediaDirectoryKeyFromUrl(leftUrl);
  const rightDirectory = mediaDirectoryKeyFromUrl(rightUrl);
  return !!leftDirectory && leftDirectory === rightDirectory;
}

function isStorageVideoDirectoryImage(url: string): boolean {
  const directory = mediaDirectoryKeyFromUrl(url);
  return !!directory && /(?:^|\/)video$/.test(directory);
}

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
  readonly initialExecutionMode: () => AgentXExecutionMode;
  readonly initialEffortLevel: () => AgentXEffortLevel;
  readonly draftOnlyOnOpen: () => boolean;
  readonly initialFiles: () => readonly PendingFile[];
  readonly initialSelectedContexts: () => readonly AgentXSelectedContext[];
  readonly initialConnectedSources: () => readonly {
    platform: string;
    profileUrl: string;
    faviconUrl?: string;
  }[];
  readonly autoSendOnOpen: () => boolean;
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
  hasUserSent(): boolean;
  markUserMessageSent(): void;
  send(options?: {
    text?: string;
    executionMode?: AgentXExecutionMode;
    effortLevel?: AgentXEffortLevel;
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
  readonly historyHydrating = signal(false);

  private host: AgentXOperationChatSessionFacadeHost | null = null;
  private historyBackfillRunId = 0;
  private readonly storedEventReconcileStartedAt = new Map<string, number>();
  private readonly normalizeTypingAssistantMediaMarkdownAfterFlush = (): void => {
    this.normalizeTypingAssistantMediaMarkdown();
  };

  private normalizeMessageContent(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private agentMessageDisplayText(message: {
    readonly content?: string;
    readonly parts?: readonly AgentXMessagePart[];
  }): string {
    const partText = (message.parts ?? [])
      .filter((part): part is Extract<AgentXMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.content.trim())
      .filter((value) => value.length > 0)
      .join('\n\n')
      .trim();

    return partText || (message.content ?? '');
  }

  /**
   * Returns true when the error string represents a client-side connectivity
   * failure (SSE stall, network drop, stream cut) rather than a real backend
   * error.  Used to decide whether to fall back to Firestore instead of
   * showing the raw technical message to the user.
   *
   * Covers browser Fetch API errors, iOS WebKit / NSURLError strings, Android
   * OkHttp errors, and generic network / abort patterns so that any transport
   * layer failure gets routed to the Firestore fallback rather than rendered
   * as an error bubble in the chat.
   */
  private isClientSideConnectivityError(error: string): boolean {
    const lower = (error ?? '').toLowerCase();
    return (
      // Generic stream / SSE patterns
      lower.includes('stall') ||
      lower.includes('sse') ||
      lower.includes('unexpected eof') ||
      lower.includes('unexpected end') ||
      lower.includes('stream ended') ||
      // Generic network patterns
      lower.includes('network') ||
      lower.includes('connection') ||
      // iOS WebKit / NSURLError — thrown when the OS kills the SSE connection
      // while the app is backgrounded (e.g. "Load failed", "The network
      // connection was lost.", "Request failed").
      lower.includes('load failed') ||
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      // iOS NSURLErrorCancelled / Android cancelled requests
      lower.includes('cancelled') ||
      lower.includes('canceled') ||
      // Browser Fetch API generic failure
      lower.includes('failed to fetch') ||
      // Chromium net error codes (e.g. "net::ERR_INTERNET_DISCONNECTED")
      lower.includes('net::err_') ||
      // AbortError from AbortController or iOS-side abort
      lower.includes('abort')
    );
  }

  /**
   * Returns true when the operation is still "active" — i.e. it could still
   * produce more output or is waiting for user input/approval.  This covers
   * all non-terminal statuses so that connectivity failures in any yield or
   * pause state trigger a Firestore fallback instead of an error bubble.
   */
  private isActiveOperation(): boolean {
    const status = this.requireHost().getOperationStatus();
    return (
      status === 'processing' ||
      status === 'paused' ||
      status === 'awaiting_input' ||
      status === 'awaiting_approval'
    );
  }

  /**
   * Freeze a persisted operation's tool steps for display on reload. Any step
   * still marked `active`/`pending` from an operation that is no longer the
   * live one is collapsed to `success` so it renders frozen instead of
   * spinning as if it were still running.
   */
  private freezeInterruptedToolSteps(steps: readonly AgentXToolStep[]): AgentXToolStep[] {
    return steps.map((step) =>
      step.status === 'active' || step.status === 'pending'
        ? { ...step, status: 'success' as const }
        : { ...step }
    );
  }

  private stepSignature(steps: readonly AgentXToolStep[] | undefined): string {
    if (!steps || steps.length === 0) return '';
    return steps.map((step) => `${step.id}|${step.label}|${step.status}`).join('||');
  }

  private messageToolSteps(message: {
    readonly steps?: readonly AgentXToolStep[];
    readonly parts?: readonly AgentXMessagePart[];
  }): readonly AgentXToolStep[] {
    const steps: AgentXToolStep[] = [...(message.steps ?? [])];
    for (const part of message.parts ?? []) {
      if (part.type === 'tool-steps') steps.push(...part.steps);
    }
    return steps;
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

  private normalizeReplayOperationId(value: string | null | undefined): string {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return '';
    if (!trimmed.startsWith('chat-')) return trimmed;

    const bare = trimmed.slice(5);
    return this.isFirestoreOperationId(bare) ? bare : trimmed;
  }

  private sameReplayOperation(
    left: string | null | undefined,
    right: string | null | undefined
  ): boolean {
    const normalizedLeft = this.normalizeReplayOperationId(left);
    const normalizedRight = this.normalizeReplayOperationId(right);
    return !!normalizedLeft && normalizedLeft === normalizedRight;
  }

  private shouldDropLiveReplayAssistantRow(
    message: OperationMessage,
    replay: {
      readonly operationIds: ReadonlySet<string>;
      readonly content: string;
      readonly steps: readonly AgentXToolStep[];
    }
  ): boolean {
    if (message.id === 'typing') return true;
    if (message.role !== 'assistant') return false;
    if (message.yieldState || this.messageHasYieldCard(message)) return false;

    const messageContent = this.normalizeMessageContent(this.agentMessageDisplayText(message));
    const replayContent = this.normalizeMessageContent(replay.content);
    if (messageContent && replayContent) {
      if (messageContent === replayContent) return true;
      if (messageContent.length >= 24 && replayContent.includes(messageContent)) return true;
      if (replayContent.length >= 24 && messageContent.includes(replayContent)) return true;
    }

    const messageSteps = this.stepSignature(this.messageToolSteps(message));
    const replaySteps = this.stepSignature(replay.steps);
    if (messageSteps && messageSteps === replaySteps) return true;

    const replayOperationIds = new Set(
      [...replay.operationIds].map((operationId) => this.normalizeReplayOperationId(operationId))
    );
    const messageOperationId = this.normalizeReplayOperationId(message.operationId);
    return (
      !!messageOperationId &&
      replayOperationIds.has(messageOperationId) &&
      message.semanticPhase !== 'assistant_tool_call'
    );
  }

  private shouldDropPersistedRowForActiveTyping(
    message: OperationMessage,
    params: {
      readonly liveOperationId: string;
      readonly existingTyping: OperationMessage;
      readonly replayOperationIds: ReadonlySet<string>;
    }
  ): boolean {
    if (
      this.shouldDropLiveReplayAssistantRow(message, {
        operationIds: params.replayOperationIds,
        content: this.agentMessageDisplayText(params.existingTyping),
        steps: this.messageToolSteps(params.existingTyping),
      })
    ) {
      return true;
    }

    if (message.role !== 'assistant' || message.operationId !== params.liveOperationId) {
      return false;
    }
    if (message.semanticPhase === 'assistant_tool_call') return false;

    // Keep interruption rows (ask_user/approval) for the live operation.
    // Dropping all assistant rows for the active operation causes the
    // pending action card to disappear on session re-entry.
    if (message.yieldState || this.messageHasYieldCard(message)) return false;

    return true;
  }

  private shouldPreserveTypingAfterThreadReload(
    existingTyping: OperationMessage,
    persistedRows: readonly OperationMessage[],
    liveOperationId: string | null
  ): boolean {
    const typingOperationId = existingTyping.operationId?.trim() ?? '';
    const operationIds = new Set(
      [liveOperationId?.trim() ?? '', typingOperationId].filter((value) => value.length > 0)
    );

    if (operationIds.size === 0) return true;

    const hasPersistedFinalForTyping = persistedRows.some(
      (message) =>
        message.role === 'assistant' &&
        message.semanticPhase === 'assistant_final' &&
        typeof message.operationId === 'string' &&
        operationIds.has(message.operationId.trim())
    );

    return !hasPersistedFinalForTyping;
  }
  private inferMediaTypeFromUrl(url: string): 'image' | 'video' | 'doc' | null {
    const normalizedUrl = this.normalizeDetectedMediaUrl(url);
    const parsed = (() => {
      try {
        return new URL(normalizedUrl);
      } catch {
        return null;
      }
    })();
    const pathname = parsed?.pathname.toLowerCase() ?? normalizedUrl.toLowerCase();
    const hostname = parsed?.hostname.toLowerCase() ?? '';

    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(pathname) || /\/images?\//i.test(pathname)) {
      return 'image';
    }
    if (
      /\.(m3u8|mov|mp4|m4v|webm|ogg|ogv)$/i.test(pathname) ||
      hostname === 'watch.cloudflarestream.com' ||
      hostname === 'iframe.videodelivery.net' ||
      hostname.endsWith('.videodelivery.net') ||
      hostname.endsWith('.cloudflarestream.com')
    ) {
      return 'video';
    }

    // Firebase Storage / GCS: encoded paths have %2F separators instead of /
    // so literal /video/ won't match — check the full URL string
    const lowerUrl = normalizedUrl.toLowerCase();
    if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(lowerUrl)) {
      if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#%]|$)/i.test(lowerUrl)) return 'image';
      if (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#%]|$)/i.test(lowerUrl)) return 'video';
      if (/(?:\/|%2F)videos?(?:\/|%2F)/i.test(lowerUrl)) return 'video';
      if (/(?:\/|%2F)images?(?:\/|%2F)/i.test(lowerUrl)) return 'image';
    }

    if (
      /\/media-proxy\/export\//i.test(pathname) ||
      /\.(pdf|csv|txt|docx?|xlsx?|pptx?|rtf|zip|json)(?:[?#%]|$)/i.test(lowerUrl) ||
      /(?:[?&]mime=)(?:application%2Fpdf|application\/pdf|text%2Fcsv|text\/csv|text%2Fplain|text\/plain|application%2Fzip|application\/zip|application%2Fjson|application\/json|application%2Fmsword|application\/msword|application%2Fvnd(?:\.|%2E)[^&\s]+)/i.test(
        lowerUrl
      )
    ) {
      return 'doc';
    }

    return null;
  }

  private normalizeDetectedMediaUrl(value: string): string {
    return value.trim().replace(/[),.;!?]+$/g, '');
  }

  /**
   * Assistant single-source media rendering: convert bare media URLs in prose
   * into markdown so chat bubbles render inline media consistently.
   */
  private mediaThumbnailLookup(
    attachments: readonly NonNullable<OperationMessage['attachments']>[number][] | undefined
  ): Map<string, string> {
    const lookup = new Map<string, string>();
    const attachmentList = attachments ?? [];
    const videoAttachments = attachmentList.filter((attachment) => attachment.type === 'video');
    const registerThumbnail = (
      videoUrl: string,
      thumbnailUrl: string,
      options: { readonly overwrite?: boolean } = {}
    ): void => {
      const urlKeys = this.mediaUrlLookupKeys(videoUrl);
      for (const key of urlKeys) {
        if (options.overwrite || !lookup.has(key)) lookup.set(key, thumbnailUrl);
      }
    };

    for (const attachment of videoAttachments) {
      if (attachment.type !== 'video' || !attachment.thumbnailUrl) continue;
      registerThumbnail(attachment.url, attachment.thumbnailUrl, { overwrite: true });
    }

    const fallbackThumbnailImages = attachmentList.filter((attachment) => {
      if (attachment.type !== 'image' || !attachment.url) return false;
      const label = `${attachment.name ?? ''} ${attachment.url}`;
      return (
        /(?:thumb|thumbnail|poster|preview|cover|graphic|title[-_\s]?card|intro|generated)/i.test(
          label
        ) || isStorageVideoDirectoryImage(attachment.url)
      );
    });

    if (fallbackThumbnailImages.length > 0) {
      videoAttachments
        .filter((attachment) => !attachment.thumbnailUrl)
        .forEach((attachment, index) => {
          const sameDirectoryFallback = fallbackThumbnailImages.find((image) =>
            shareStorageMediaDirectory(image.url, attachment.url)
          );
          const fallback =
            sameDirectoryFallback ??
            fallbackThumbnailImages[index] ??
            (fallbackThumbnailImages.length === 1 ? fallbackThumbnailImages[0] : undefined);
          if (!fallback) return;
          registerThumbnail(attachment.url, fallback.url);
        });
    } else if (videoAttachments.length === 1) {
      const singleImage = attachmentList.find(
        (attachment) => attachment.type === 'image' && !!attachment.url
      );
      const singleVideo = videoAttachments[0];
      if (singleImage && singleVideo && !singleVideo.thumbnailUrl) {
        registerThumbnail(singleVideo.url, singleImage.url);
      }
    }
    return lookup;
  }

  private mediaUrlLookupKeys(value: string): string[] {
    const normalized = this.normalizeDetectedMediaUrl(value).replace(/#poster=.*/i, '');
    const keys = new Set<string>();
    if (normalized) keys.add(normalized);

    try {
      const parsed = new URL(normalized);
      parsed.hash = '';
      keys.add(parsed.toString());

      if (/(?:firebasestorage|storage)\.googleapis\.com/i.test(parsed.hostname)) {
        keys.add(`${parsed.origin}${parsed.pathname}`);
        const storageObjectPath = storageObjectPathFromUrl(normalized);
        if (storageObjectPath) keys.add(`storage:${storageObjectPath.toLowerCase()}`);
      }
    } catch {
      // Ignore malformed URLs; the normalized raw key above is still useful.
    }

    return [...keys];
  }

  private thumbnailForMediaUrl(value: string, lookup: ReadonlyMap<string, string>): string | null {
    for (const key of this.mediaUrlLookupKeys(value)) {
      const thumbnail = lookup.get(key);
      if (thumbnail) return thumbnail;
    }
    return null;
  }

  private appendPosterFragment(url: string, thumbnailUrl: string | null): string {
    if (!this.isRenderableThumbnailUrl(thumbnailUrl) || /#poster=/i.test(url)) return url;
    return `${url}#poster=${this.encodeMarkdownUrlFragmentValue(thumbnailUrl)}`;
  }

  private buildVideoMarkdownLink(url: string, thumbnailUrl: string | null): string {
    const renderableUrl = this.appendPosterFragment(
      this.normalizeDetectedMediaUrl(url),
      thumbnailUrl
    );
    return `[View Video](${renderableUrl})`;
  }

  private encodeMarkdownUrlFragmentValue(value: string): string {
    return encodeURIComponent(value).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }

  private isRenderableThumbnailUrl(url: string | null | undefined): url is string {
    const normalized = url?.trim();
    if (!normalized || normalized.length > 8192) return false;
    if (/^data:image\//i.test(normalized)) return true;
    if (!/^https:\/\//i.test(normalized)) return false;

    try {
      const parsed = new URL(normalized);
      if (/(?:storage|firebasestorage)\.googleapis\.com/i.test(parsed.hostname)) {
        const decodedPath = decodeURIComponent(parsed.pathname);
        return /\.(?:png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(decodedPath);
      }
      return true;
    } catch {
      return false;
    }
  }

  private promoteAssistantMediaUrlsToMarkdown(
    content: string,
    media?: { attachments?: OperationMessage['attachments'] },
    options: { readonly requireTrailingBoundary?: boolean; readonly deferImages?: boolean } = {}
  ): string {
    if (!content.trim()) return content;

    const thumbnailLookup = this.mediaThumbnailLookup(media?.attachments);
    const urlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;
    return content.replace(urlPattern, (rawUrl, offset, source) => {
      const normalizedUrl = this.normalizeDetectedMediaUrl(rawUrl);
      const mediaType = this.inferMediaTypeFromUrl(normalizedUrl);
      if (!mediaType) return rawUrl;
      if (options.deferImages && mediaType === 'image') return rawUrl;
      if (
        options.requireTrailingBoundary &&
        this.shouldDeferStreamingMediaUrlPromotion(rawUrl, offset, source)
      ) {
        return rawUrl;
      }
      const thumbnailUrl =
        mediaType === 'video' ? this.thumbnailForMediaUrl(normalizedUrl, thumbnailLookup) : null;
      const renderableUrl =
        mediaType === 'video'
          ? this.appendPosterFragment(normalizedUrl, thumbnailUrl)
          : normalizedUrl;

      // Skip URLs already used as markdown link/image targets: ](url)
      const previousChar = offset > 0 ? source[offset - 1] : '';
      if (previousChar === '(') return renderableUrl;

      return mediaType === 'video'
        ? `[View Video](${renderableUrl})`
        : mediaType === 'image'
          ? `![Generated Image](${renderableUrl})`
          : `[Open File](${renderableUrl})`;
    });
  }

  private shouldDeferStreamingMediaUrlPromotion(
    rawUrl: string,
    offset: number,
    source: string
  ): boolean {
    const rawEnd = offset + rawUrl.length;
    return rawEnd >= source.length;
  }

  private promoteAssistantMediaPartsToMarkdown(
    parts: readonly AgentXMessagePart[],
    media?: { attachments?: OperationMessage['attachments'] }
  ): AgentXMessagePart[] {
    const thumbnailLookup = this.mediaThumbnailLookup(media?.attachments);

    return parts.map((part) => {
      if (part.type === 'text') {
        return {
          type: 'text' as const,
          content: this.promoteAssistantMediaUrlsToMarkdown(part.content, media),
        };
      }

      if (part.type === 'video') {
        const thumbnailUrl =
          part.thumbnailUrl?.trim() || this.thumbnailForMediaUrl(part.url, thumbnailLookup);
        return {
          type: 'text' as const,
          content: this.buildVideoMarkdownLink(part.url, thumbnailUrl),
        };
      }

      return part;
    });
  }

  private normalizeTypingAssistantMediaMarkdown(options: { readonly final?: boolean } = {}): void {
    const final = options.final === true;

    this.messageFacade.messages.update((messages) =>
      messages.map((message) => {
        if (message.id !== 'typing') return message;
        const normalizedContent = this.promoteAssistantMediaUrlsToMarkdown(
          message.content,
          message,
          { deferImages: !final, requireTrailingBoundary: !final }
        );
        const normalizedParts = (message.parts ?? []).map((part) =>
          part.type === 'text'
            ? {
                type: 'text' as const,
                content: this.promoteAssistantMediaUrlsToMarkdown(part.content, message, {
                  deferImages: !final,
                  requireTrailingBoundary: !final,
                }),
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
    id?: string;
    url: string;
    name: string;
    type: 'image' | 'video' | 'doc' | 'app' | 'context';
    storagePath?: string;
    thumbnailUrl?: string;
    platform?: string;
    faviconUrl?: string;
  } {
    const normalizedUrl = this.normalizeDetectedMediaUrl(attachment.url);
    const inferredMediaType = this.inferMediaTypeFromUrl(normalizedUrl);
    const isSelectedContextAttachment =
      attachment.mimeType === 'application/x-selected-context' ||
      normalizedUrl.startsWith('context://');
    const mappedType: 'image' | 'video' | 'doc' | 'app' | 'context' =
      attachment.type === 'image'
        ? 'image'
        : attachment.type === 'video' && inferredMediaType === 'video'
          ? 'video'
          : isSelectedContextAttachment && inferredMediaType === 'video'
            ? 'video'
            : isSelectedContextAttachment && inferredMediaType === 'image'
              ? 'image'
              : isSelectedContextAttachment
                ? 'context'
                : attachment.type === 'app'
                  ? 'app'
                  : /^https?:\/\//i.test(normalizedUrl) && attachment.type === 'video'
                    ? 'app'
                    : 'doc';

    return {
      id: attachment.id,
      url: normalizedUrl,
      name: attachment.name,
      type: mappedType,
      ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
      ...(attachment.thumbnailUrl ? { thumbnailUrl: attachment.thumbnailUrl } : {}),
      ...(isSelectedContextAttachment
        ? { contextSource: attachment.platform }
        : attachment.platform
          ? { platform: attachment.platform }
          : {}),
      ...(attachment.faviconUrl ? { faviconUrl: attachment.faviconUrl } : {}),
    };
  }

  private mapSelectedContextAttachment(context: AgentXSelectedContext): MessageAttachment | null {
    const id = context.id.trim();
    const title = context.title.trim();
    if (!id || !title) return null;

    const videoUrl = context.media?.videoUrl?.trim();
    const imageUrl = context.media?.imageUrl?.trim();
    const thumbnailUrl = context.media?.thumbnailUrl?.trim();
    const source = context.source?.label ?? context.source?.type;
    const filmReviewId = this.resolveSelectedContextEntityId(context, 'film_review');
    const sourceId = this.resolveSelectedContextSourceId(context);

    if (videoUrl) {
      return {
        url: this.normalizeDetectedMediaUrl(videoUrl),
        type: 'video',
        name: title,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        contextKind: context.kind,
        ...(source ? { contextSource: source } : {}),
        ...(context.summary ? { contextSummary: context.summary } : {}),
        ...(filmReviewId ? { filmReviewId } : {}),
        ...(sourceId ? { sourceId } : {}),
      };
    }

    if (imageUrl || thumbnailUrl) {
      return {
        url: this.normalizeDetectedMediaUrl(imageUrl ?? thumbnailUrl ?? ''),
        type: 'image',
        name: title,
        contextKind: context.kind,
        ...(source ? { contextSource: source } : {}),
        ...(context.summary ? { contextSummary: context.summary } : {}),
        ...(filmReviewId ? { filmReviewId } : {}),
        ...(sourceId ? { sourceId } : {}),
      };
    }

    return {
      url: `context://${encodeURIComponent(id)}`,
      type: 'context',
      name: title,
      contextKind: context.kind,
      ...(source ? { contextSource: source } : {}),
      ...(context.summary ? { contextSummary: context.summary } : {}),
      ...(filmReviewId ? { filmReviewId } : {}),
      ...(sourceId ? { sourceId } : {}),
    };
  }

  private resolveSelectedContextEntityId(
    context: AgentXSelectedContext,
    entityType: string
  ): string | null {
    if (entityType === 'film_review' && context.source?.type === 'film_review') {
      const sourceId = context.source.id?.trim();
      if (sourceId) return sourceId;
    }

    const entityId = context.entityRefs
      ?.find((entityRef) => entityRef.type === entityType && entityRef.id.trim().length > 0)
      ?.id.trim();
    return entityId || null;
  }

  private resolveSelectedContextSourceId(context: AgentXSelectedContext): string | null {
    const entityId = this.resolveSelectedContextEntityId(context, 'film_review_source');
    if (entityId) return entityId;

    const metadataSourceId = context.metadata?.['sourceId'];
    return typeof metadataSourceId === 'string' && metadataSourceId.trim().length > 0
      ? metadataSourceId.trim()
      : null;
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

  private collectResultDataMedia(
    value: unknown,
    depth = 0
  ): {
    urls: string[];
    thumbnailUrls: string[];
  } {
    if (!value || typeof value !== 'object' || depth > 6) {
      return { urls: [], thumbnailUrls: [] };
    }

    const urls: string[] = [];
    const thumbnailUrls: string[] = [];
    const addUrl = (candidate: unknown): void => {
      if (typeof candidate === 'string' && candidate.trim()) urls.push(candidate.trim());
    };
    const addThumbnailUrl = (candidate: unknown): void => {
      if (
        typeof candidate === 'string' &&
        this.isRenderableThumbnailUrl(candidate) &&
        candidate.trim()
      ) {
        thumbnailUrls.push(candidate.trim());
      }
    };

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = this.collectResultDataMedia(item, depth + 1);
        urls.push(...nested.urls);
        thumbnailUrls.push(...nested.thumbnailUrls);
      }
      return { urls, thumbnailUrls };
    }

    const record = value as Record<string, unknown>;
    for (const key of ['imageUrl', 'videoUrl', 'outputUrl', 'output_url', 'output_path'] as const) {
      addUrl(record[key]);
    }
    for (const key of ['posterUrl', 'poster', 'thumbnailUrl'] as const) {
      addThumbnailUrl(record[key]);
    }
    for (const key of ['persistedMediaUrls', 'mediaUrls', 'imageUrls', 'videoUrls'] as const) {
      const collection = record[key];
      if (!Array.isArray(collection)) continue;
      for (const item of collection) addUrl(item);
    }
    for (const key of [
      'files',
      'attachments',
      'mediaArtifact',
      'mediaArtifacts',
      'taskResults',
      'data',
      'artifacts',
      'result',
    ] as const) {
      const nested = record[key];
      if (key === 'taskResults' && nested && typeof nested === 'object' && !Array.isArray(nested)) {
        for (const item of Object.values(nested as Record<string, unknown>)) {
          const collected = this.collectResultDataMedia(item, depth + 1);
          urls.push(...collected.urls);
          thumbnailUrls.push(...collected.thumbnailUrls);
        }
        continue;
      }
      const collected = this.collectResultDataMedia(nested, depth + 1);
      urls.push(...collected.urls);
      thumbnailUrls.push(...collected.thumbnailUrls);
    }

    return { urls, thumbnailUrls };
  }

  private stripPersistedAttachmentAnnotations(content: string): string {
    return (
      content
        // Strip [Attached video: ...] / [Attached file: ...] annotations, including
        // the modern "(already visible to user — do not re-embed)" suffix appended
        // by `formatVideoAttachmentLabel` / `formatFileAttachmentLabel` in the backend.
        .replace(/\n\n\[Attached (?:file|video)(?:\s+\([^)]*\))?: .+/gs, '')
        .replace(/\n\n\[Connected sources available[^\]]*\]/gs, '')
        .replace(
          /\n\[Instruction: treat these as user-connected sources for this request; do not state they are missing\.\]/gs,
          ''
        )
        .replace(
          /\s*\[Selected contexts \(confirmed by user for this turn\):[\s\S]*?\n\]\s*\[Instruction: prioritize these contexts while reasoning and cite their timestamps when relevant\.\]/g,
          ''
        )
        .trim()
    );
  }

  private collectMessageMedia(message: AgentMessage): {
    imageUrl?: string;
    videoUrl?: string;
    attachments?: OperationMessage['attachments'];
  } {
    // Unified attachment model: backend populates attachments[] at save time.
    // Frontend simply reads attachments directly — no content scanning, no waterfall.
    const persistedAttachments = this.dedupeMessageAttachments([
      ...(message.attachments ?? []).map((attachment) =>
        this.mapPersistedAttachment(attachment as AgentXAttachment)
      ),
      ...(message.selectedContexts ?? [])
        .map((context) => this.mapSelectedContextAttachment(context))
        .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null),
    ]);

    if (message.role === 'user') {
      return persistedAttachments.length > 0 ? { attachments: persistedAttachments } : {};
    }

    const detectedAssistantMedia = this.collectDetectedAssistantMedia(message);
    const attachments = this.dedupeMessageAttachments([
      ...persistedAttachments,
      ...detectedAssistantMedia.attachments,
    ]);

    return {
      ...(detectedAssistantMedia.imageUrl ? { imageUrl: detectedAssistantMedia.imageUrl } : {}),
      ...(detectedAssistantMedia.videoUrl ? { videoUrl: detectedAssistantMedia.videoUrl } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  }

  private collectDetectedAssistantMedia(message: AgentMessage): {
    imageUrl?: string;
    videoUrl?: string;
    attachments: MessageAttachment[];
  } {
    const urls: string[] = [];
    const seen = new Set<string>();
    const addUrl = (candidate: unknown): void => {
      if (typeof candidate !== 'string') return;
      const trimmed = candidate.trim();
      if (!trimmed) return;
      const normalized = this.normalizeDetectedMediaUrl(trimmed);
      if (!/^https?:\/\//i.test(normalized) || seen.has(normalized)) return;
      seen.add(normalized);
      urls.push(normalized);
    };

    const resultMedia = this.collectResultDataMedia(message.resultData ?? {});
    const resultThumbnailUrl = resultMedia.thumbnailUrls[0];
    const resultImagePosterUrl = resultMedia.urls.find(
      (url) => this.inferMediaTypeFromUrl(url) === 'image' && this.isRenderableThumbnailUrl(url)
    );
    for (const url of resultMedia.urls) addUrl(url);

    const urlPattern = /https?:\/\/[^\s)\]"'<>]+/gi;
    for (const rawUrl of message.content.match(urlPattern) ?? []) {
      addUrl(rawUrl);
    }

    let imageIndex = 0;
    let videoIndex = 0;
    let firstImageUrl: string | undefined;
    let firstVideoUrl: string | undefined;
    const attachments: MessageAttachment[] = [];

    for (const url of urls) {
      const mediaType = this.inferMediaTypeFromUrl(url);
      if (mediaType === 'image') {
        imageIndex += 1;
        firstImageUrl ??= url;
        attachments.push({
          url,
          type: 'image',
          name: `media-image-${imageIndex}.jpg`,
        });
        continue;
      }

      if (mediaType === 'video') {
        videoIndex += 1;
        firstVideoUrl ??= url;
        const sameDirectoryPosterUrl = resultMedia.urls.find(
          (candidate) =>
            this.inferMediaTypeFromUrl(candidate) === 'image' &&
            this.isRenderableThumbnailUrl(candidate) &&
            shareStorageMediaDirectory(candidate, url)
        );
        const fallbackThumbnailUrl =
          resultThumbnailUrl ?? sameDirectoryPosterUrl ?? resultImagePosterUrl;
        attachments.push({
          url,
          type: 'video',
          name: `media-video-${videoIndex}.mp4`,
          ...(fallbackThumbnailUrl ? { thumbnailUrl: fallbackThumbnailUrl } : {}),
        });
      }
    }

    return {
      ...(firstImageUrl ? { imageUrl: firstImageUrl } : {}),
      ...(firstVideoUrl ? { videoUrl: firstVideoUrl } : {}),
      attachments,
    };
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
        /(?:(?:generated\s+)?(?:graphic|image|video|media|file|document|spreadsheet|workbook|export|download|playback|signed(?:\s+hls)?|hls)\s+url|generated\s+(?:image|file|document|spreadsheet|workbook|export))\s*:?$/i.test(
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

        const nextAttachment = this.mapStreamMediaEventToAttachment(media, 1);
        const existingAttachments = message.attachments ?? [];
        let replacedExisting = false;
        const updatedExistingAttachments = existingAttachments.map((attachment) => {
          const isSameAttachment =
            attachment.type === nextAttachment.type &&
            this.normalizeDetectedMediaUrl(attachment.url) ===
              this.normalizeDetectedMediaUrl(nextAttachment.url);
          if (!isSameAttachment) return attachment;
          replacedExisting = true;
          return {
            ...attachment,
            ...(nextAttachment.thumbnailUrl && !attachment.thumbnailUrl
              ? { thumbnailUrl: nextAttachment.thumbnailUrl }
              : {}),
          };
        });
        const attachments = replacedExisting
          ? updatedExistingAttachments
          : [...updatedExistingAttachments, nextAttachment];
        const promote = (content: string): string =>
          media.type === 'image'
            ? content
            : this.promoteAssistantMediaUrlsToMarkdown(content, { attachments });
        return {
          ...message,
          attachments,
          content: promote(message.content),
          ...(message.parts?.length
            ? {
                parts: message.parts.map((part) =>
                  part.type === 'text'
                    ? {
                        type: 'text' as const,
                        content: promote(part.content),
                      }
                    : part
                ),
              }
            : {}),
        };
      })
    );
  }

  /**
   * Build attachment-strip items from replayed stream media events.
   * Used on rehydrate when the operation completed before this session connected.
   * Video events keep their explicit thumbnailUrl so mobile does not need to
   * extract a frame from a remote video inside the native WebView.
   */
  private buildMediaAttachmentsFromStreamEvents(
    mediaEvents: readonly AgentXStreamMediaEvent[]
  ): MessageAttachment[] {
    if (!mediaEvents.length) return [];

    const seen = new Set<string>();
    const attachments: MessageAttachment[] = [];

    for (const [index, media] of mediaEvents.entries()) {
      const key = `${media.type}|${this.normalizeDetectedMediaUrl(media.url)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attachments.push(this.mapStreamMediaEventToAttachment(media, index + 1));
    }

    return attachments;
  }

  private mapStreamMediaEventToAttachment(
    media: AgentXStreamMediaEvent,
    ordinal: number
  ): MessageAttachment {
    return {
      url: this.normalizeDetectedMediaUrl(media.url),
      type: media.type,
      name: this.streamMediaAttachmentName(media, ordinal),
      ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl.trim() } : {}),
    };
  }

  private streamMediaAttachmentName(media: AgentXStreamMediaEvent, ordinal: number): string {
    try {
      const pathname = new URL(media.url).pathname;
      const basename = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '').trim();
      if (basename) return basename;
    } catch {
      // Fall through to stable generated names.
    }

    return media.type === 'video'
      ? `generated-video-${ordinal}.mp4`
      : `generated-image-${ordinal}.jpg`;
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

      const sameOperation = this.sameReplayOperation(message.operationId, previous.operationId);
      const sameContent =
        this.normalizeMessageContent(message.content) ===
        this.normalizeMessageContent(previous.content);
      const sameSteps = this.stepSignature(message.steps) === this.stepSignature(previous.steps);
      const sameCards = this.cardSignature(message.cards) === this.cardSignature(previous.cards);
      const sameMedia = this.mediaSignature(message) === this.mediaSignature(previous);

      if (sameOperation && sameContent && sameSteps && sameCards && sameMedia) {
        continue;
      }

      const isToolCallPartialPair =
        (previous.semanticPhase === 'assistant_tool_call' &&
          message.semanticPhase === 'assistant_partial') ||
        (previous.semanticPhase === 'assistant_partial' &&
          message.semanticPhase === 'assistant_tool_call');
      const previousText = this.normalizeMessageContent(this.agentMessageDisplayText(previous));
      const messageText = this.normalizeMessageContent(this.agentMessageDisplayText(message));
      const hasRepeatedPreamble =
        previousText.length >= 24 &&
        messageText.length >= 24 &&
        (previousText === messageText ||
          previousText.includes(messageText) ||
          messageText.includes(previousText));

      if (sameOperation && isToolCallPartialPair && hasRepeatedPreamble) {
        deduped[deduped.length - 1] = this.mergeRepeatedPreambleRows(previous, message);
        continue;
      }

      deduped.push(message);
    }

    return deduped;
  }

  private mergeRepeatedPreambleRows(
    first: OperationMessage,
    second: OperationMessage
  ): OperationMessage {
    const firstText = this.agentMessageDisplayText(first).trim();
    const secondText = this.agentMessageDisplayText(second).trim();
    const content = secondText.length >= firstText.length ? secondText : firstText;
    const parts: AgentXMessagePart[] = [{ type: 'text', content }];
    const seenPartSignatures = new Set<string>();
    const representedToolSteps = new Set<string>();

    const addPart = (part: AgentXMessagePart): void => {
      if (part.type === 'text') return;
      const signature = JSON.stringify(part);
      if (seenPartSignatures.has(signature)) return;
      seenPartSignatures.add(signature);
      if (part.type === 'tool-steps') {
        for (const step of part.steps) representedToolSteps.add(step.id);
      }
      parts.push(part);
    };

    for (const part of [...(second.parts ?? []), ...(first.parts ?? [])]) {
      addPart(part);
    }

    const mergedSteps = [...this.messageToolSteps(first), ...this.messageToolSteps(second)].filter(
      (step, index, steps) => steps.findIndex((candidate) => candidate.id === step.id) === index
    );
    const unrepresentedSteps = mergedSteps.filter((step) => !representedToolSteps.has(step.id));
    if (unrepresentedSteps.length > 0) {
      parts.push({ type: 'tool-steps', steps: unrepresentedSteps });
    }

    const mergedCards = [...(second.cards ?? []), ...(first.cards ?? [])].filter(
      (card, index, cards) =>
        cards.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(card)) === index
    );
    for (const card of mergedCards) {
      addPart({ type: 'card', card });
    }

    return {
      ...second,
      content,
      parts,
      ...(mergedSteps.length > 0 ? { steps: mergedSteps } : {}),
      ...(mergedCards.length > 0 ? { cards: mergedCards } : {}),
      ...((second.yieldState ?? first.yieldState)
        ? { yieldState: second.yieldState ?? first.yieldState }
        : {}),
      ...((second.yieldCardState ?? first.yieldCardState)
        ? { yieldCardState: second.yieldCardState ?? first.yieldCardState }
        : {}),
      ...((second.yieldResolvedText ?? first.yieldResolvedText)
        ? { yieldResolvedText: second.yieldResolvedText ?? first.yieldResolvedText }
        : {}),
    };
  }

  private normalizePartTextContent(value: string | undefined | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private containsMediaReplaySignal(content: string): boolean {
    const normalized = content.trim();
    if (!normalized) return false;
    return (
      /\[view video\]\(/i.test(normalized) ||
      /videodelivery\.net/i.test(normalized) ||
      /watch\.cloudflarestream\.com/i.test(normalized) ||
      /\.(mp4|mov|m3u8)(\b|\?|#)/i.test(normalized)
    );
  }

  private shouldAppendContentAsTextPart(
    cleanContent: string,
    persistedParts: readonly AgentXMessagePart[]
  ): boolean {
    const normalizedContent = this.normalizePartTextContent(cleanContent);
    if (!normalizedContent) return false;

    for (const part of persistedParts) {
      if (part.type !== 'text') continue;
      const normalizedPart = this.normalizePartTextContent(part.content);
      if (!normalizedPart) continue;
      if (normalizedPart === normalizedContent) return false;
      if (normalizedPart.includes(normalizedContent)) return false;
    }

    return true;
  }

  private persistedTextPartsCoverContent(
    cleanContent: string,
    persistedParts: readonly AgentXMessagePart[]
  ): boolean {
    const normalizedContent = this.normalizePartTextContent(cleanContent);
    if (!normalizedContent) return true;

    const normalizedTextParts = persistedParts
      .filter((part): part is Extract<AgentXMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part) => this.normalizePartTextContent(part.content))
      .filter((value) => value.length > 0);

    if (normalizedTextParts.length === 0) return false;

    // Fast path: all text parts (even when interleaved with non-text parts)
    // already reconstruct the persisted content verbatim.
    if (normalizedTextParts.join(' ') === normalizedContent) return true;

    let remaining = normalizedContent;
    for (const part of normalizedTextParts) {
      if (!remaining.startsWith(part)) return false;
      remaining = remaining.slice(part.length).trimStart();
      if (!remaining) return true;
    }

    return remaining.length === 0;
  }

  private resolveSupplementalContentTextPart(
    cleanContent: string,
    persistedParts: readonly AgentXMessagePart[]
  ): string | null {
    let remainingContent = cleanContent.trim();
    if (!remainingContent) return null;

    if (this.persistedTextPartsCoverContent(remainingContent, persistedParts)) {
      return null;
    }

    for (const part of persistedParts) {
      if (part.type !== 'text') break;
      const partContent = part.content.trim();
      if (!partContent) continue;
      if (remainingContent === partContent) return null;
      if (!remainingContent.startsWith(partContent)) break;
      remainingContent = remainingContent.slice(partContent.length).trimStart();
      if (!remainingContent) return null;
    }

    return this.shouldAppendContentAsTextPart(remainingContent, persistedParts)
      ? remainingContent
      : null;
  }

  private mergePreservedInlineYieldRows(
    persistedRows: readonly OperationMessage[],
    preservedInlineYieldRows: readonly OperationMessage[]
  ): OperationMessage[] {
    const merged = [...persistedRows];

    for (const row of preservedInlineYieldRows) {
      if (merged.some((message) => message.id === row.id)) continue;

      const rowYieldIdentity = this.messageYieldIdentityKey(row);
      if (
        rowYieldIdentity &&
        merged.some((message) => this.messageYieldIdentityKey(message) === rowYieldIdentity)
      ) {
        continue;
      }

      const operationId = typeof row.operationId === 'string' ? row.operationId.trim() : '';
      if (!operationId) {
        merged.push(row);
        continue;
      }

      const finalIndex = merged.findIndex(
        (message) =>
          message.operationId === operationId &&
          message.role === 'assistant' &&
          message.semanticPhase === 'assistant_final'
      );
      if (finalIndex >= 0) {
        merged.splice(finalIndex, 0, row);
        continue;
      }

      let lastSameOperationIndex = -1;
      for (let index = 0; index < merged.length; index += 1) {
        if (merged[index]?.operationId === operationId) {
          lastSameOperationIndex = index;
        }
      }

      if (lastSameOperationIndex >= 0) {
        merged.splice(lastSameOperationIndex + 1, 0, row);
      } else {
        merged.push(row);
      }
    }

    return merged;
  }

  private messageYieldIdentityKey(
    message: Pick<OperationMessage, 'yieldState' | 'cards' | 'parts'>
  ): string {
    const directKey = this.yieldIdentityKey(message.yieldState);
    if (directKey) return directKey;

    for (const card of message.cards ?? []) {
      const key = this.cardYieldIdentityKey(card);
      if (key) return key;
    }

    for (const part of message.parts ?? []) {
      if (part.type !== 'card') continue;
      const key = this.cardYieldIdentityKey(part.card);
      if (key) return key;
    }

    return '';
  }

  private yieldIdentityKey(yieldState: AgentYieldState | undefined | null): string {
    if (!yieldState) return '';
    const approvalId = yieldState.approvalId?.trim();
    if (approvalId) return `approval:${approvalId}`;
    const toolCallId = yieldState.pendingToolCall?.toolCallId?.trim();
    if (toolCallId) return `tool:${toolCallId}`;
    return '';
  }

  private cardYieldIdentityKey(card: AgentXRichCard | undefined | null): string {
    if (!card || card.type !== 'confirmation') return '';
    const payload = card.payload as
      | { approvalId?: unknown; toolCallId?: unknown; yieldState?: AgentYieldState }
      | undefined;
    if (!payload) return '';

    const embeddedKey = this.yieldIdentityKey(payload.yieldState);
    if (embeddedKey) return embeddedKey;

    const approvalId = typeof payload.approvalId === 'string' ? payload.approvalId.trim() : '';
    if (approvalId) return `approval:${approvalId}`;

    const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId.trim() : '';
    return toolCallId ? `tool:${toolCallId}` : '';
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
  /**
   * Deterministic turn ordering. When every persisted row carries the
   * server-assigned `(turnSeq, seq)` pair, sort by it directly — this is the
   * authoritative conversational order and fixes pause/resume reordering.
   * Falls back to the legacy pairing heuristic only for legacy threads whose
   * rows predate deterministic ordering (missing seq/turnSeq).
   */
  private orderMappedTurnsForDisplay(messages: readonly OperationMessage[]): OperationMessage[] {
    const allOrdered =
      messages.length > 0 &&
      messages.every(
        (message) => typeof message.turnSeq === 'number' && typeof message.seq === 'number'
      );

    if (!allOrdered) {
      return this.reorderTurnsByPairing(messages);
    }

    return [...messages].sort((a, b) => {
      if (a.turnSeq !== b.turnSeq) return a.turnSeq! - b.turnSeq!;
      return a.seq! - b.seq!;
    });
  }

  private reorderTurnsByPairing(messages: readonly OperationMessage[]): OperationMessage[] {
    const result: OperationMessage[] = [];
    // Track each user's landing index in `result` and how many assistants
    // have been attached after it. A user's "block" occupies indices
    // [idx, idx + assistantCount].
    const userSlots: Array<{ idx: number; assistantCount: number; operationId?: string }> = [];
    const deferredFinalAssistants = new Map<string, OperationMessage[]>();

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

    for (let index = 0; index < messages.length; index += 1) {
      const msg = messages[index]!;
      if (msg.role === 'user') {
        result.push(msg);
        const slot = {
          idx: result.length - 1,
          assistantCount: 0,
          ...(msg.operationId?.trim() ? { operationId: msg.operationId.trim() } : {}),
        };
        userSlots.push(slot);

        const userOperationId = msg.operationId?.trim() ?? '';
        if (userOperationId) {
          const deferred = deferredFinalAssistants.get(userOperationId) ?? [];
          for (const deferredMessage of deferred) {
            attachAfter(slot, deferredMessage);
          }
          deferredFinalAssistants.delete(userOperationId);
        }
        continue;
      }

      if (msg.role === 'assistant') {
        const assistantOperationId = msg.operationId?.trim() ?? '';
        const hasLaterSameOperationUser =
          msg.semanticPhase === 'assistant_final' &&
          !!assistantOperationId &&
          messages
            .slice(index + 1)
            .some(
              (candidate) =>
                candidate.role === 'user' &&
                (candidate.operationId?.trim() ?? '') === assistantOperationId
            );

        if (hasLaterSameOperationUser) {
          const existingDeferred = deferredFinalAssistants.get(assistantOperationId) ?? [];
          deferredFinalAssistants.set(assistantOperationId, [...existingDeferred, msg]);
          continue;
        }

        // Prefer the user row for the same operation. Final resume rows may
        // arrive after a pre-approval/tool-call row already attached to that
        // user, so allow final rows to attach to an occupied matching slot.
        let target = assistantOperationId
          ? userSlots.find(
              (s) =>
                s.operationId === assistantOperationId &&
                (s.assistantCount === 0 || msg.semanticPhase === 'assistant_final')
            )
          : undefined;
        // If the assistant row already has a backend operationId but the
        // matching user row has not been backfilled yet, attach it to the most
        // recent unmatched user. This keeps a later answer below the later user
        // instead of filling an older paused slot whose operationId differs.
        if (!target && assistantOperationId) {
          target = [...userSlots].reverse().find((s) => s.assistantCount === 0);
        }
        // Fall back to the earliest user with zero assistants attached for
        // older rows that do not have operation ids backfilled.
        target ??= userSlots.find((s) => s.assistantCount === 0);
        if (!target && userSlots.length > 0) {
          // Operation-scoped assistants with no exact user match are usually
          // resumed/yield completions. Keep them near the latest user turn
          // instead of jumping back to the earliest fully answered prompt.
          const candidates = assistantOperationId ? [...userSlots].reverse() : userSlots;
          target = candidates.reduce(
            (best, s) => (s.assistantCount < best.assistantCount ? s : best),
            candidates[0]
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

  private yieldToolOperationId(yieldState: AgentYieldState | null | undefined): string {
    const operationId =
      yieldState?.pendingToolCall?.toolInput &&
      typeof yieldState.pendingToolCall.toolInput['operationId'] === 'string'
        ? yieldState.pendingToolCall.toolInput['operationId'].trim()
        : '';
    return operationId;
  }

  private isPauseResumeYieldState(yieldState: AgentYieldState | null | undefined): boolean {
    return yieldState?.pendingToolCall?.toolName === 'resume_paused_operation';
  }

  private isPauseYieldSupersededByLaterTurn(
    yieldState: AgentYieldState,
    items: readonly AgentMessage[]
  ): boolean {
    if (!this.isPauseResumeYieldState(yieldState)) return false;

    const pausedOperationId = this.yieldToolOperationId(yieldState);
    if (!pausedOperationId) return false;

    const lastPausedOperationIndex = items.reduce((latest, item, index) => {
      const itemOperationId = item.operationId?.trim() ?? '';
      return itemOperationId === pausedOperationId ? index : latest;
    }, -1);

    if (lastPausedOperationIndex < 0) return false;

    return items.slice(lastPausedOperationIndex + 1).some((item) => {
      const itemOperationId = item.operationId?.trim() ?? '';
      if (itemOperationId === pausedOperationId) return false;
      if (item.role === 'user' && item.content?.trim()) return true;
      return item.role === 'assistant' && item.semanticPhase === 'assistant_final';
    });
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
      const opId = item.operationId?.trim() ?? '';
      if (!opId) continue;
      const semanticYield = item.semanticPhase === 'assistant_yield';
      const persistedYieldState = this.coercePersistedYieldStateFromMessage(item, []);
      const rawYieldReason =
        typeof item.resultData?.['yieldReason'] === 'string'
          ? (item.resultData['yieldReason'] as string)
          : undefined;
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
    for (const item of items) {
      if (
        item.role === 'assistant' &&
        item.semanticPhase === 'assistant_final' &&
        item.operationId
      ) {
        finalOperationIds.add(item.operationId);
      }
    }

    // ── Pass 1b: identify direct chat-* parents of bare-UUID resume finals ─
    // When a bare-UUID final immediately follows a chat-* op (no intervening
    // user turn), that chat-* op is the stale parent trajectory that must be
    // hidden. Track only the DIRECT parents — a global lastBareFinalIndex was
    // too broad and incorrectly suppressed unrelated prior-turn messages from
    // long-running threads.
    const suppressedParentOpIds = new Set<string>();
    {
      let lastChatPrefixedOpId: string | null = null;
      for (const item of items) {
        if (item.role === 'user') {
          // A real user turn resets tracking; yield replies keep it active.
          const opId = item.operationId?.trim() ?? '';
          if (!answeredYieldOpIds.has(opId)) {
            lastChatPrefixedOpId = null;
          }
        } else if (item.role === 'assistant' && item.operationId) {
          if (isChatPrefixedOperationId(item.operationId)) {
            lastChatPrefixedOpId = item.operationId;
          } else if (
            item.semanticPhase === 'assistant_final' &&
            lastChatPrefixedOpId &&
            !yieldedOperationIds.has(lastChatPrefixedOpId)
          ) {
            // This bare-UUID final directly follows a non-yielded chat-* op:
            // mark that parent for suppression.
            suppressedParentOpIds.add(lastChatPrefixedOpId);
            lastChatPrefixedOpId = null;
          }
        }
      }
    }

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
    const duplicatedTextOnlyPartialIds = new Set<string>();
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

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      if (
        item.role !== 'assistant' ||
        item.semanticPhase !== 'assistant_partial' ||
        !item.operationId
      ) {
        continue;
      }

      const hasRichState =
        (item.steps?.length ?? 0) > 0 ||
        (item.toolCalls?.length ?? 0) > 0 ||
        (item.parts?.length ?? 0) > 0 ||
        (item.cards?.length ?? 0) > 0 ||
        (item.attachments?.length ?? 0) > 0 ||
        (!!item.resultData && Object.keys(item.resultData).length > 0);
      if (hasRichState) continue;

      const partialText = this.normalizeMessageContent(this.agentMessageDisplayText(item));
      if (partialText.length < 24) continue;

      const toolCallSuperset = items.some((candidate) => {
        if (candidate.id === item.id) return false;
        if (
          candidate.role !== 'assistant' ||
          candidate.semanticPhase !== 'assistant_tool_call' ||
          !this.sameReplayOperation(candidate.operationId, item.operationId)
        ) {
          return false;
        }

        const candidateHasRichState =
          (candidate.steps?.length ?? 0) > 0 ||
          (candidate.toolCalls?.length ?? 0) > 0 ||
          (candidate.parts?.length ?? 0) > 0 ||
          (candidate.cards?.length ?? 0) > 0 ||
          (candidate.attachments?.length ?? 0) > 0 ||
          (!!candidate.resultData && Object.keys(candidate.resultData).length > 0);
        if (!candidateHasRichState) return false;

        const toolCallText = this.normalizeMessageContent(this.agentMessageDisplayText(candidate));
        return toolCallText === partialText || toolCallText.includes(partialText);
      });

      if (toolCallSuperset) duplicatedTextOnlyPartialIds.add(item.id);
    }

    // ── Pass 2c: collapse tool_call rows for completed yielded ops ───────────
    // Both ask_user and approval flows accumulate tool_call rows before the yield
    // point. When the operation later completes (assistant_final exists), keep only
    // the LAST tool_call so pre-yield context renders as a single clean bubble above
    // the final message on session reload.
    const completedApprovalToolCallSuppressedIds = new Set<string>();
    {
      const lastSeenToolCall = new Map<string, string>(); // operationId → id of latest row
      for (const item of items) {
        if (
          item.role === 'assistant' &&
          item.semanticPhase === 'assistant_tool_call' &&
          item.operationId &&
          yieldedOperationIds.has(item.operationId) &&
          finalOperationIds.has(item.operationId)
        ) {
          const prev = lastSeenToolCall.get(item.operationId);
          if (prev) completedApprovalToolCallSuppressedIds.add(prev);
          lastSeenToolCall.set(item.operationId, item.id);
        }
      }
    }

    const cumulativeToolCallSuppressedIds = new Set<string>();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]!;
      if (
        item.role !== 'assistant' ||
        item.semanticPhase !== 'assistant_tool_call' ||
        !item.operationId
      ) {
        continue;
      }

      const itemText = this.normalizeMessageContent(this.agentMessageDisplayText(item));
      if (itemText.length < 24) continue;

      const laterCumulativeToolCall = items.slice(index + 1).some((candidate) => {
        if (
          candidate.role !== 'assistant' ||
          candidate.semanticPhase !== 'assistant_tool_call' ||
          !this.sameReplayOperation(candidate.operationId, item.operationId)
        ) {
          return false;
        }

        const candidateText = this.normalizeMessageContent(this.agentMessageDisplayText(candidate));
        return candidateText.length > itemText.length && candidateText.includes(itemText);
      });

      if (laterCumulativeToolCall) cumulativeToolCallSuppressedIds.add(item.id);
    }

    // ── Pass 2d: collapse tool_call rows for answered ask_user (needs_input) ops ─
    // When an ask_user yield is answered, the pre-yield assistant_tool_call row(s)
    // (prose the agent wrote before calling ask_user) are restored as visible chat
    // bubbles (see inputYieldedOpIds exception below). Deduplicate here so only
    // the LAST tool_call row renders, matching the collapse behaviour for other
    // no-final operations.
    const answeredInputYieldToolCallSuppressedIds = new Set<string>();
    {
      const lastSeenToolCall = new Map<string, string>();
      for (const item of items) {
        if (
          item.role === 'assistant' &&
          item.semanticPhase === 'assistant_tool_call' &&
          item.operationId &&
          answeredYieldOpIds.has(item.operationId) &&
          inputYieldedOpIds.has(item.operationId) &&
          !finalOperationIds.has(item.operationId)
        ) {
          const prev = lastSeenToolCall.get(item.operationId);
          if (prev) answeredInputYieldToolCallSuppressedIds.add(prev);
          lastSeenToolCall.set(item.operationId, item.id);
        }
      }
    }

    // ── Pass 2e: collapse tool_call rows for pending ask_user (needs_input) ops ─
    // Some sessions persist ask_user as assistant_yield without an inline ask_user
    // card on assistant_partial. In that shape, suppressing the entire input op
    // hides all pre-yield context on reload. Keep the LAST assistant_tool_call so
    // users still see the question/context message above the waiting affordance.
    const pendingInputYieldToolCallSuppressedIds = new Set<string>();
    {
      const lastSeenToolCall = new Map<string, string>();
      for (const item of items) {
        if (
          item.role === 'assistant' &&
          item.semanticPhase === 'assistant_tool_call' &&
          item.operationId &&
          inputYieldedOpIds.has(item.operationId) &&
          !answeredYieldOpIds.has(item.operationId) &&
          !finalOperationIds.has(item.operationId)
        ) {
          const prev = lastSeenToolCall.get(item.operationId);
          if (prev) pendingInputYieldToolCallSuppressedIds.add(prev);
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

    return items.filter((item) => {
      // All non-assistant messages (user, system) pass through without suppression.
      // ask_user reply messages (role='user', operationId set) show as normal user
      // bubbles — the previous design of suppressing them and showing the text inside
      // a "resolved yield card" was broken because nxt1-chat-bubble never renders
      // externalResolvedText in its template.
      if (item.role !== 'assistant') return true;

      // Suppress ALL `assistant_yield` rows. These are persisted by the worker so
      // the LLM has the prompt text in its context on resume — they are *not*
      // user-facing. Live yield cards are shown via applyPendingYieldState during
      // streaming. For answered ask_user yields the user reply message now shows as
      // a normal user bubble in the conversation history on reload.
      if (item.semanticPhase === 'assistant_yield') {
        return false;
      }

      // When assistant_final exists for this operationId, keep only the final
      // row. This check must run BEFORE inputYieldedOpIds so that a completed
      // ask_user operation (which got an assistant_final after the user replied)
      // is not incorrectly suppressed in full by the trajectory-collapse rule.
      //
      // Exception: completed yielded operations (both ask_user and approval) also
      // keep the last tool_call row so pre-yield context (search results, step
      // summaries) remains visible alongside the final completion message after
      // session reload.
      if (item.operationId && finalOperationIds.has(item.operationId)) {
        if (yieldedOperationIds.has(item.operationId)) {
          return (
            item.semanticPhase === 'assistant_final' || item.semanticPhase === 'assistant_tool_call'
          );
        }
        return item.semanticPhase === 'assistant_final';
      }

      // ask_user (needs_input) operations: keep one pre-yield tool_call row
      // (latest) so thread reload retains the visible question/context prose,
      // while still suppressing assistant_yield rows and intermediate trajectory.
      // This runs AFTER finalOperationIds so completed ask_user ops still keep
      // their final answer visible on reload.
      //
      // Exception: when the ask_user yield has been answered, restore the last
      // assistant_tool_call row so the pre-yield prose (question context and search
      // results the agent wrote before calling ask_user) remains visible in the chat
      // history alongside the resolved ask_user card. This matches the mandatory
      // 2-step ask_user pattern where the agent writes the full question as prose
      // BEFORE invoking the ask_user tool.
      if (item.operationId && inputYieldedOpIds.has(item.operationId)) {
        if (item.semanticPhase === 'assistant_tool_call') {
          if (answeredYieldOpIds.has(item.operationId)) {
            return !answeredInputYieldToolCallSuppressedIds.has(item.id);
          }
          return !pendingInputYieldToolCallSuppressedIds.has(item.id);
        }
        return false;
      }

      // Pause/resume cross-operation collapse:
      // parent operation ids are `chat-*` while resumed child operations use
      // bare UUID ids. Suppress stale parent trajectory rows so only the
      // resumed final bubble remains. Only the DIRECT parent of each bare-UUID
      // final is suppressed — suppressedParentOpIds is built in Pass 1b by
      // walking chronologically and matching each bare-UUID final to the
      // chat-* op that immediately preceded it (within the same user turn).
      if (
        item.operationId &&
        suppressedParentOpIds.has(item.operationId) &&
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

      // Later tool-call rows can carry cumulative interleaved parts from earlier
      // iterations. Keep that richer row so its preamble appears once alongside
      // its tool steps and approval state.
      if (cumulativeToolCallSuppressedIds.has(item.id)) return false;

      // If a partial snapshot exists for this in-flight operation (and no
      // final/yield exists), prefer partial over tool_call so only one
      // assistant bubble renders during rehydrate.
      // Do not remove without updating the regression test referenced above.
      //
      // Exception: yielded operations (both ask_user and approval) carry an
      // inline card on the partial row AND a separate tool_call showing
      // pre-yield context. Both must render, so skip the partial-supersedes-
      // tool_call rule for all yielded ops.
      if (
        item.semanticPhase === 'assistant_tool_call' &&
        item.operationId &&
        operationIdsWithPartialNoFinal.has(item.operationId) &&
        !yieldedOperationIds.has(item.operationId)
      ) {
        return false;
      }

      // Suppress all-but-last assistant_partial rows (no final path).
      if (duplicatedTextOnlyPartialIds.has(item.id)) return false;
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

    if (host.contextId().trim() && host.contextType() === 'operation' && this.isActiveOperation()) {
      host.threadMode.set(true);
      this.subscribeToFirestoreJobEvents();
      return;
    }

    if (host.initialFiles().length > 0) {
      this.attachmentsFacade.pendingFiles.set([...host.initialFiles()]);
    }

    if (host.initialSelectedContexts().length > 0) {
      this.attachmentsFacade.addPendingSelectedContexts([...host.initialSelectedContexts()]);
    }

    if (host.initialConnectedSources().length > 0) {
      this.attachmentsFacade.pendingConnectedSources.set([...host.initialConnectedSources()]);
    }

    if (host.resumeOperationId().trim()) {
      void host.attachToResumedOperation({
        operationId: host.resumeOperationId().trim(),
        threadId: threadId || undefined,
        afterSeq: 0,
      });
      return;
    }

    const hasInitialComposerPayload =
      host.initialMessage().trim().length > 0 ||
      host.initialFiles().length > 0 ||
      host.initialConnectedSources().length > 0 ||
      host.initialSelectedContexts().length > 0 ||
      this.attachmentsFacade.pendingSelectedContexts().length > 0;

    if (
      host.initialMessage().trim() &&
      (!host.autoSendOnOpen() || host.draftOnlyOnOpen()) &&
      host.inputValue().trim().length === 0
    ) {
      host.inputValue.set(host.initialMessage().trim());
    }

    if (
      !host.draftOnlyOnOpen() &&
      (host.initialMessage().trim() || host.autoSendOnOpen()) &&
      !this.initialMessageSent()
    ) {
      this.initialMessageSent.set(true);
      setTimeout(() => {
        const initialMessage = host.initialMessage().trim();
        const composerDraft = host.inputValue().trim();
        if (!hasInitialComposerPayload) return;
        if (composerDraft.length > 0 && composerDraft !== initialMessage) {
          return;
        }
        void host.send({
          text: initialMessage,
          executionMode: host.initialExecutionMode(),
          effortLevel: host.initialEffortLevel(),
          preserveDraft: false,
        });
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
   * Enqueue-heavy flows now render like normal chat and do not hold output.
   */
  private shouldHoldEnqueueUntilDone(operationId: string | null | undefined): boolean {
    void operationId;
    return false;
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

  private markThreadAsEnqueueWaiting(): void {
    const host = this.requireHost();
    const threadId = host.resolvedThreadId()?.trim() || host.threadId().trim();
    if (!threadId) return;
    const operationId = host.getCurrentOperationId()?.trim() || null;
    this.operationEventService.markEnqueueWaiting(threadId, Date.now(), operationId);
    this.operationEventService.emitOperationStatusUpdated(
      threadId,
      'in-progress',
      new Date().toISOString(),
      'enqueue',
      operationId ?? undefined
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

  private getEnqueueHeavyTaskOperationId(step: AgentXToolStep | null | undefined): string | null {
    const metadata = step?.metadata as Record<string, unknown> | undefined;
    const operationId = metadata?.['heavyTaskOperationId'];
    return typeof operationId === 'string' && operationId.trim().length > 0
      ? operationId.trim()
      : null;
  }

  private clearEnqueueWaitingMessage(): void {
    this.messageFacade.messages.update((messages) =>
      messages.filter(
        (message) => message.id !== AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_ID
      )
    );
  }

  private shouldReplaceEnqueueWaitingWithLiveReplay(
    operationId: string | null | undefined
  ): boolean {
    const normalizedOperationId = operationId?.trim() ?? '';
    if (!normalizedOperationId) {
      return false;
    }

    const host = this.requireHost();
    const threadId = host.resolvedThreadId()?.trim() || host.threadId().trim();
    if (!threadId) {
      return false;
    }

    const enqueueWaitingEntry = this.operationEventService.getEnqueueWaitingEntry(threadId);
    if (!enqueueWaitingEntry) {
      return false;
    }

    return (
      !enqueueWaitingEntry.operationId || enqueueWaitingEntry.operationId === normalizedOperationId
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

  async reconcileOperationFromStoredEvents(
    explicitOperationId: string,
    options: { source?: string; abortActiveStream?: boolean } = {}
  ): Promise<void> {
    const host = this.requireHost();
    const operationId = explicitOperationId.trim();
    if (!operationId) return;

    const startedAt = Date.now();
    const previousStartedAt = this.storedEventReconcileStartedAt.get(operationId) ?? 0;
    if (startedAt - previousStartedAt < 1_500) return;
    this.storedEventReconcileStartedAt.set(operationId, startedAt);

    const threadId = host.resolvedThreadId()?.trim() || host.threadId().trim() || null;
    const source = options.source ?? 'stored-event-reconcile';

    this.messageFacade.flushPendingTypingDelta();

    if (options.abortActiveStream) {
      host.getActiveStream()?.abort();
      host.setActiveStream(null);
      if (threadId) {
        this.streamRegistry.abort(threadId);
      }
    }

    host.getShadowFirestoreSub()?.unsubscribe();
    host.setShadowFirestoreSub(null);
    host.getActiveFirestoreSub()?.unsubscribe();
    host.setActiveFirestoreSub(null);
    host.setCurrentOperationId(operationId);
    host.loading.set(true);
    host.setActivityPhase('reconnecting', 'Reconnecting...');

    this.logger.info('Reconciling operation chat from stored event snapshot', {
      operationId,
      threadId,
      source,
      abortActiveStream: options.abortActiveStream === true,
    });
    this.breadcrumb.trackStateChange('operation-chat:stored-event-reconcile', {
      operationId,
      threadId,
      source,
    });

    const stored = await this.operationEventService.getStoredEventState(operationId);
    const replayAttachments = this.buildMediaAttachmentsFromStreamEvents(stored.media);
    const content = this.promoteAssistantMediaUrlsToMarkdown(stored.content, {
      attachments: replayAttachments,
    });
    const holdEnqueueUntilDone = this.shouldHoldEnqueueUntilDone(operationId);
    const storedHeavyTaskOperationId = stored.steps
      .map((step) => this.getEnqueueHeavyTaskOperationId(step))
      .find((candidate): candidate is string => !!candidate);

    if (storedHeavyTaskOperationId) {
      host.setCurrentOperationId(storedHeavyTaskOperationId);
    }

    if (stored.latestYieldState) {
      host.applyYieldState({
        yieldState: stored.latestYieldState,
        source: 'stored-state-rehydrate',
        operationId,
      });
    }

    if (
      !stored.isDone &&
      (stored.latestLifecycleStatus === 'failed' || stored.latestLifecycleStatus === 'cancelled')
    ) {
      this.clearEnqueueWaitingMessage();
      this.removeTransientRowsForOperation(operationId);
      host.latestProgressLabel.set(null);
      host.setActivityPhase(
        stored.latestLifecycleStatus === 'failed' ? 'failed' : 'cancelled',
        stored.latestLifecycleStatus === 'failed' ? 'Something went wrong. Please try again.' : null
      );
      host.setOperationStatus(stored.latestLifecycleStatus === 'failed' ? 'error' : 'cancelled');
      this.operationEventService.emitOperationStatusUpdated(
        threadId || operationId,
        stored.latestLifecycleStatus === 'failed' ? 'error' : 'cancelled',
        new Date().toISOString(),
        'chat',
        operationId
      );
      host.loading.set(false);
      return;
    }

    if (stored.isDone) {
      this.clearEnqueueWaitingMessage();
      this.removeTransientRowsForOperation(operationId);
      host.setOperationStatus(stored.doneSuccess === false ? 'error' : 'complete');
      host.latestProgressLabel.set(null);
      host.setActivityPhase(stored.doneSuccess === false ? 'failed' : 'completed');
      this.operationEventService.emitOperationStatusUpdated(
        threadId || operationId,
        stored.doneSuccess === false ? 'error' : 'complete',
        new Date().toISOString(),
        'chat',
        operationId
      );

      if (threadId) {
        await this.loadThreadMessages(threadId);
      } else if (
        content.trim() ||
        stored.parts.length ||
        stored.cards.length ||
        stored.steps.length ||
        replayAttachments.length
      ) {
        this.messageFacade.messages.update((messages) => [
          ...messages,
          {
            id: host.uid(),
            role: 'assistant',
            content,
            timestamp: new Date(),
            isTyping: false,
            operationId,
            error: stored.doneSuccess === false,
            steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
            parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
            cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
            attachments: replayAttachments.length > 0 ? replayAttachments : undefined,
          },
        ]);
      }

      host.loading.set(false);
      this.transportFacade.emitResponseCompleteOnce('stored-event-reconcile-done');
      return;
    }

    if (holdEnqueueUntilDone) {
      this.removeTransientRowsForOperation(operationId);
      this.upsertEnqueueWaitingMessage();
      host.setActivityPhase(
        'waiting_delta',
        AgentXOperationChatSessionFacade.ENQUEUE_WAITING_MESSAGE_TEXT
      );
      host.loading.set(true);
      this.subscribeToFirestoreJobEvents(operationId, stored.maxSeq, {
        holdUntilDone: true,
        threadIdForCompletionRefresh: threadId ?? undefined,
      });
      return;
    }

    if (this.shouldReplaceEnqueueWaitingWithLiveReplay(operationId)) {
      this.clearEnqueueWaitingMessage();
    }

    const replayOperationIds = new Set<string>(
      [operationId, host.getCurrentOperationId()].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
    );
    const typingBubble: Pick<AgentMessage, 'content' | 'parts' | 'cards'> = {
      content,
      parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
      cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
    };

    this.messageFacade.messages.update((messages) => {
      const filtered = messages.filter(
        (message) =>
          !this.shouldDropLiveReplayAssistantRow(message, {
            operationIds: replayOperationIds,
            content: this.agentMessageDisplayText(
              typingBubble as Pick<AgentMessage, 'content' | 'parts'>
            ),
            steps: stored.steps,
          })
      );

      return [
        ...filtered,
        {
          id: 'typing',
          role: 'assistant',
          content,
          timestamp: new Date(),
          isTyping: !content,
          operationId,
          steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
          parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
          cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
          attachments: replayAttachments.length > 0 ? replayAttachments : undefined,
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
    this.subscribeToFirestoreJobEvents(operationId, stored.maxSeq);
  }

  private removeTransientRowsForOperation(operationId: string): void {
    this.messageFacade.messages.update((messages) =>
      messages.filter((message) => {
        if (message.id === 'typing') return false;
        if (message.role !== 'assistant' || message.operationId !== operationId) return true;
        return !!message.yieldState || this.messageHasYieldCard(message);
      })
    );
  }

  subscribeToFirestoreJobEvents(
    explicitOperationId?: string,
    startAfterSeq?: number,
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
            this.messageFacade.queueTypingDelta(
              text,
              this.normalizeTypingAssistantMediaMarkdownAfterFlush
            );
          },
          onStep: (step) => {
            if (holdUntilDone) return;
            this.messageFacade.flushPendingTypingDelta();
            if (!step.label.trim()) return;
            if (this.isEnqueueHeavyTaskStep(step)) {
              const heavyTaskOperationId = this.getEnqueueHeavyTaskOperationId(step);
              if (heavyTaskOperationId) {
                host.setCurrentOperationId(heavyTaskOperationId);
              }
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
            if (resolvedThreadId) this.streamRegistry.appendMedia(resolvedThreadId, media);
            this.mergeLiveMediaIntoTypingMessage(media);
          },
          onProgress: (event) => {
            if (holdUntilDone) return;
            const message = typeof event.message === 'string' ? event.message.trim() : '';
            if (!message) return;
            host.latestProgressLabel.set(message);
            host.markActivityPulse(message);
          },
          onOperation: (event) => {
            if (!holdUntilDone) return;

            const refreshThreadId =
              options?.threadIdForCompletionRefresh?.trim() ||
              event.threadId?.trim() ||
              host.resolvedThreadId()?.trim() ||
              host.threadId().trim();

            if (event.status === 'complete') {
              this.clearEnqueueWaitingMessage();
              host.latestProgressLabel.set(null);
              host.setActivityPhase('completed');
              host.setOperationStatus('complete');
              this.operationEventService.emitOperationStatusUpdated(
                refreshThreadId || operationId,
                'complete',
                event.timestamp ?? new Date().toISOString(),
                'chat',
                operationId
              );
              host.loading.set(false);
              host.getActiveFirestoreSub()?.unsubscribe();
              host.setActiveFirestoreSub(null);
              void this.haptics.notification('success');
              this.transportFacade.emitResponseCompleteOnce('firestore-operation-complete-enqueue');

              if (refreshThreadId) {
                void this.loadThreadMessages(refreshThreadId);
              }

              this.logger.info('Background enqueue operation completed from lifecycle event', {
                operationId,
                refreshThreadId,
              });
              return;
            }

            if (event.status === 'cancelled') {
              this.clearEnqueueWaitingMessage();
              host.latestProgressLabel.set(null);
              host.setActivityPhase('cancelled');
              host.setOperationStatus('cancelled');
              this.operationEventService.emitOperationStatusUpdated(
                refreshThreadId || operationId,
                'cancelled',
                event.timestamp ?? new Date().toISOString(),
                'chat',
                operationId
              );
              host.loading.set(false);
              host.getActiveFirestoreSub()?.unsubscribe();
              host.setActiveFirestoreSub(null);
              this.transportFacade.emitResponseCompleteOnce(
                'firestore-operation-cancelled-enqueue'
              );
              return;
            }

            if (event.status === 'failed') {
              const errorMessage = event.message || 'Something went wrong. Please try again.';
              this.clearEnqueueWaitingMessage();
              host.latestProgressLabel.set(null);
              host.setActivityPhase('failed', errorMessage);
              host.setOperationStatus('error');
              this.messageFacade.pushMessage({
                id: host.uid(),
                role: 'assistant',
                content: errorMessage,
                timestamp: new Date(),
                error: true,
              });
              this.operationEventService.emitOperationStatusUpdated(
                refreshThreadId || operationId,
                'error',
                event.timestamp ?? new Date().toISOString(),
                'chat',
                operationId
              );
              host.loading.set(false);
              host.getActiveFirestoreSub()?.unsubscribe();
              host.setActiveFirestoreSub(null);
              void this.haptics.notification('error');
              this.transportFacade.emitResponseCompleteOnce('firestore-operation-error-enqueue');
              this.logger.error(
                'Background enqueue operation failed from lifecycle event',
                new Error(errorMessage),
                { operationId }
              );
            }
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
                new Date().toISOString(),
                'chat',
                operationId
              );
              host.loading.set(false);
              host.getActiveFirestoreSub()?.unsubscribe();
              host.setActiveFirestoreSub(null);
              void this.haptics.notification('success');
              this.transportFacade.emitResponseCompleteOnce('firestore-done-enqueue');

              if (refreshThreadId) {
                void this.loadThreadMessages(refreshThreadId);
              }

              this.logger.info('Background enqueue operation completed; rendering final output', {
                operationId,
                refreshThreadId,
              });
              return;
            }
            this.messageFacade.flushPendingTypingDelta();
            host.latestProgressLabel.set(null);
            host.setActivityPhase('completed');
            this.normalizeTypingAssistantMediaMarkdown({ final: true });
            this.messageFacade.finalizeStreamedAssistantMessage({
              streamingId: 'typing',
              messageId: event.messageId,
              success: event.success,
              source: 'firestore-done',
            });
            host.loading.set(false);
            host.getActiveFirestoreSub()?.unsubscribe();
            host.setActiveFirestoreSub(null);
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
              void this.haptics.notification('error');
              this.transportFacade.emitResponseCompleteOnce('firestore-error-enqueue');
              this.logger.error(
                'Background enqueue operation failed before completion',
                new Error(error),
                {
                  operationId,
                }
              );
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
    this.historyBackfillRunId += 1;
    this.historyHydrating.set(false);
    // When a Firestore fallback is started from the catch block we must NOT call
    // host.loading.set(false) in the finally — the Firestore subscription owns
    // the loading state from that point on and will clear it on done/error.
    let firestoreFallbackStarted = false;
    this.logger.info('Loading operation thread', { threadId, contextId: host.contextId() });

    try {
      const {
        messages: items,
        hasMore,
        nextCursor,
        latestPausedYieldState,
      } = await this.agentXService.getLatestPersistedThreadMessages(threadId);
      const initialItems = this.trimUnstableInitialBoundaryRows(items);
      let messagesToApply = initialItems;
      let pausedYieldStateToApply = latestPausedYieldState;

      if (hasMore && nextCursor) {
        this.historyHydrating.set(true);
        const result = await this.agentXService.getPersistedThreadMessages(threadId, {
          before: nextCursor,
          seedMessages: [...items],
          latestPausedYieldState,
        });
        messagesToApply = result.messages;
        pausedYieldStateToApply = result.latestPausedYieldState;
      }

      await this.applyLoadedThreadMessages(threadId, messagesToApply, pausedYieldStateToApply);
    } catch (error) {
      this.logger.error('Failed to load operation thread', error, {
        threadId,
        contextId: host.contextId(),
      });
      // On iOS/Android, the network may not be immediately available after app resume.
      // If the operation is still expected to be running, start the Firestore fallback
      // instead of surfacing a "failed to load" error — the live event stream does not
      // depend on loading prior history from the backend.
      //
      // Also fall back when operationStatus is null — this happens when the component
      // is freshly mounted after the OS killed the app (all signals reset to defaults).
      // In that case the operation status hasn't been loaded yet, so we must treat it
      // as "potentially still running" and let Firestore resolve the final state rather
      // than immediately showing an error message to the user.
      if (
        host.contextType() === 'operation' &&
        (this.isActiveOperation() || host.getOperationStatus() === null) &&
        host.contextId().trim()
      ) {
        this.logger.info(
          'Thread history load failed with operation still active — starting Firestore fallback',
          // includes: processing | paused | awaiting_input | awaiting_approval | null (fresh mount)
          { threadId, contextId: host.contextId() }
        );
        this.breadcrumb.trackStateChange('operation-chat:load-failed-firestore-fallback', {
          threadId,
          contextId: host.contextId(),
        });
        firestoreFallbackStarted = true;
        this.subscribeToFirestoreJobEvents();
        return;
      }
      this.messageFacade.pushMessage({
        id: host.uid(),
        role: 'assistant',
        content: 'Failed to load this conversation. You can still continue here.',
        timestamp: new Date(),
        error: true,
      });
    } finally {
      this.historyHydrating.set(false);
      if (!firestoreFallbackStarted) {
        host.loading.set(false);
      }
    }
  }

  private trimUnstableInitialBoundaryRows(items: readonly AgentMessage[]): readonly AgentMessage[] {
    let firstStableIndex = 0;
    while (firstStableIndex < items.length && items[firstStableIndex]?.role === 'assistant') {
      firstStableIndex += 1;
    }

    const anchoredItems = firstStableIndex > 0 ? items.slice(firstStableIndex) : [...items];
    const visibleUserOperationIds = new Set(
      anchoredItems
        .filter((item) => item.role === 'user' && typeof item.operationId === 'string')
        .map((item) => item.operationId!.trim())
        .filter((operationId) => operationId.length > 0)
    );

    if (visibleUserOperationIds.size === 0) {
      return anchoredItems;
    }

    return anchoredItems.filter((item) => {
      if (item.role !== 'assistant') return true;
      const operationId = typeof item.operationId === 'string' ? item.operationId.trim() : '';
      if (!operationId.length) return false;
      if (visibleUserOperationIds.has(operationId)) return true;

      // Resume-after-yield completions run under a fresh Firestore operation id
      // (bare UUID) with no matching persisted user turn. Keep those rows so
      // reopened threads retain the final deliverable instead of stopping at
      // the pre-yield ask_user snapshot.
      return this.isFirestoreOperationId(operationId);
    });
  }

  private async applyLoadedThreadMessages(
    threadId: string,
    items: readonly AgentMessage[],
    latestPausedYieldState?: unknown
  ): Promise<void> {
    const host = this.requireHost();
    const rawPersistedPendingYieldState = this.coercePersistedYieldState(latestPausedYieldState);
    const stalePauseYieldFromThreadMetadata = rawPersistedPendingYieldState
      ? this.isPauseYieldSupersededByLaterTurn(rawPersistedPendingYieldState, items)
      : false;
    const persistedPendingYieldState = stalePauseYieldFromThreadMetadata
      ? null
      : rawPersistedPendingYieldState;
    const timelinePendingYieldState = persistedPendingYieldState
      ? null
      : this.extractLatestPendingYieldFromItems(items);
    this.logger.info('Resolved pending yield candidates during thread load', {
      threadId,
      contextId: host.contextId(),
      fromThreadMetadata: !!rawPersistedPendingYieldState,
      skippedStalePauseYieldFromThreadMetadata: stalePauseYieldFromThreadMetadata,
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
        this.applyPendingYieldState(persistedPendingYieldState, threadId, 'thread-metadata-empty');
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

    // Pre-compute persisted user replies once so answered assistant_yield
    // rows can inject yieldResolvedText without repeatedly rescanning the
    // full thread during mapping.
    const userReplyByOpId = new Map<string, string>();
    for (const item of items) {
      if (item.role !== 'user' || typeof item.operationId !== 'string') {
        continue;
      }

      const operationId = item.operationId.trim();
      const replyContent = item.content?.trim();
      if (!operationId || !replyContent) {
        continue;
      }

      userReplyByOpId.set(operationId, replyContent);
    }

    const canonicalItems = this.resolveCanonicalAssistantRows(items);

    // Steps only keep spinning while their operation is the live, in-progress
    // one. Any persisted row from a paused/abandoned/finished operation must
    // render frozen on reload — otherwise a paused op's steps reappear as
    // "running" above a newer turn when the user leaves and returns.
    const liveOperationId = host.getCurrentOperationId()?.trim() ?? '';
    const liveStatus = host.getOperationStatus();
    const liveOperationIsActive =
      liveStatus === 'processing' ||
      liveStatus === 'awaiting_input' ||
      liveStatus === 'awaiting_approval';

    const mapped: OperationMessage[] = canonicalItems
      .filter(
        (message): message is typeof message & { role: 'user' | 'assistant' } =>
          message.role === 'user' || message.role === 'assistant'
      )
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
        const rowIsLive =
          liveOperationIsActive &&
          !!liveOperationId &&
          (message.operationId?.trim() ?? '') === liveOperationId;
        const freezeSteps = (steps: readonly AgentXToolStep[]): AgentXToolStep[] =>
          rowIsLive ? [...steps] : this.freezeInterruptedToolSteps(steps);

        const persistedSteps: AgentXToolStep[] = freezeSteps(
          (message.steps ?? []).filter(
            (step): step is AgentXToolStep =>
              typeof step.label === 'string' &&
              step.label.trim().length > 0 &&
              step.stageType === 'tool'
          )
        );
        const assistantMedia =
          message.role === 'assistant' ? this.collectMessageMedia(message) : {};

        let persistedParts =
          message.parts?.map((part) =>
            part.type === 'tool-steps'
              ? {
                  type: 'tool-steps' as const,
                  steps: freezeSteps(
                    part.steps.filter(
                      (step): step is AgentXToolStep =>
                        typeof step.label === 'string' &&
                        step.label.trim().length > 0 &&
                        step.stageType === 'tool'
                    )
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
                      content: this.promoteAssistantMediaUrlsToMarkdown(
                        part.content,
                        assistantMedia
                      ),
                    }
                  : part
          ) ?? [];

        const persistedMedia = message.role === 'user' ? this.collectMessageMedia(message) : {};

        const cleanContent =
          message.role === 'user'
            ? this.stripDisplayedMediaUrlsFromContent(
                this.stripPersistedAttachmentAnnotations(message.content),
                persistedMedia
              )
            : stripDistilledSectionTransitionLines(
                this.promoteAssistantMediaUrlsToMarkdown(
                  this.stripPersistedAttachmentAnnotations(message.content),
                  assistantMedia
                )
              );

        const hasAssistantMediaSignal =
          message.role === 'assistant' &&
          (Boolean(assistantMedia.videoUrl) ||
            Boolean(assistantMedia.imageUrl) ||
            Boolean(assistantMedia.attachments?.length) ||
            this.containsMediaReplaySignal(cleanContent));

        const hasExistingAssistantTextPart = persistedParts.some(
          (part) => part.type === 'text' && part.content.trim().length > 0
        );
        const supplementalContentTextPart =
          persistedParts.length > 0
            ? hasAssistantMediaSignal && hasExistingAssistantTextPart
              ? null
              : this.resolveSupplementalContentTextPart(cleanContent, persistedParts)
            : null;
        if (supplementalContentTextPart) {
          persistedParts = [
            ...persistedParts,
            { type: 'text' as const, content: supplementalContentTextPart },
          ];
        }

        if (hasAssistantMediaSignal) {
          this.logger.info('[ReloadDiag] mapped assistant media row', {
            threadId,
            messageId: message.id,
            operationId: message.operationId,
            semanticPhase: message.semanticPhase,
            cleanContentLength: cleanContent.length,
            persistedPartCount: persistedParts.length,
            supplementalContentAppended: Boolean(supplementalContentTextPart),
            suppressedSupplementalForMedia: hasAssistantMediaSignal && hasExistingAssistantTextPart,
            videoUrl: assistantMedia.videoUrl ?? null,
            imageUrl: assistantMedia.imageUrl ?? null,
            attachmentCount: assistantMedia.attachments?.length ?? 0,
          });
        }

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

        const yieldRowOpId =
          typeof message.operationId === 'string' ? message.operationId.trim() : '';
        const yieldRowReplyText = yieldRowOpId ? userReplyByOpId.get(yieldRowOpId) : undefined;
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
          role: message.role,
          idempotencyKey:
            typeof message.idempotencyKey === 'string' ? message.idempotencyKey : undefined,
          operationId: typeof message.operationId === 'string' ? message.operationId : undefined,
          content: effectiveContent,
          timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
          ...(persistedSteps.length > 0 ? { steps: persistedSteps } : {}),
          ...(persistedParts.length > 0 ? { parts: persistedParts } : {}),
          ...(persistedCards.length > 0 ? { cards: persistedCards } : {}),
          ...(persistedYieldState ? { yieldState: persistedYieldState } : {}),
          ...(effectiveYieldCardState ? { yieldCardState: effectiveYieldCardState } : {}),
          ...(effectiveYieldResolvedText ? { yieldResolvedText: effectiveYieldResolvedText } : {}),
          ...(typeof message.seq === 'number' ? { seq: message.seq } : {}),
          ...(typeof message.turnSeq === 'number' ? { turnSeq: message.turnSeq } : {}),
          ...persistedMedia,
        };
      });

    const dedupedMapped = this.dedupeConsecutiveAssistantMessages(mapped);
    const mediaAssistantRowsBefore = mapped.filter(
      (message) =>
        message.role === 'assistant' &&
        (Boolean(
          message.attachments?.some(
            (attachment) => attachment.type === 'video' || attachment.type === 'image'
          )
        ) ||
          Boolean(message.attachments?.length) ||
          this.containsMediaReplaySignal(message.content))
    );
    const mediaAssistantRowsAfter = dedupedMapped.filter(
      (message) =>
        message.role === 'assistant' &&
        (Boolean(
          message.attachments?.some(
            (attachment) => attachment.type === 'video' || attachment.type === 'image'
          )
        ) ||
          Boolean(message.attachments?.length) ||
          this.containsMediaReplaySignal(message.content))
    );
    if (mediaAssistantRowsBefore.length > 0) {
      this.logger.info('[ReloadDiag] media assistant dedupe summary', {
        threadId,
        mappedCount: mapped.length,
        dedupedCount: dedupedMapped.length,
        mediaAssistantRowsBefore: mediaAssistantRowsBefore.length,
        mediaAssistantRowsAfter: mediaAssistantRowsAfter.length,
        mappedMediaMessageIds: mediaAssistantRowsBefore.map((message) => message.id),
        dedupedMediaMessageIds: mediaAssistantRowsAfter.map((message) => message.id),
      });
    }
    const reorderedMapped = this.orderMappedTurnsForDisplay(dedupedMapped);

    const existingMessages = this.messageFacade.messages();
    const existingTyping = existingMessages.find((m) => m.id === 'typing');
    const answeredYieldOperationIdsInPersisted = new Set(
      reorderedMapped
        .filter(
          (message) =>
            message.role === 'user' &&
            typeof message.operationId === 'string' &&
            message.operationId.trim().length > 0
        )
        .map((message) => message.operationId!.trim())
    );
    const preservedInlineYieldRows = existingMessages.filter(
      (message, messageIndex, allExistingMessages) => {
        if (message.id === 'typing') return false;
        if (!message.yieldState) return false;
        if (reorderedMapped.some((persisted) => persisted.id === message.id)) return false;

        const operationId =
          typeof message.operationId === 'string' ? message.operationId.trim() : '';
        if (operationId && answeredYieldOperationIdsInPersisted.has(operationId)) return false;
        if (
          operationId &&
          reorderedMapped.some(
            (persisted) =>
              typeof persisted.operationId === 'string' && persisted.operationId === operationId
          )
        ) {
          return false;
        }

        const hadLocalUserReplyAfter = allExistingMessages
          .slice(messageIndex + 1)
          .some((candidate) => candidate.role === 'user');
        if (hadLocalUserReplyAfter) return false;

        if (message.yieldCardState === 'resolved') return false;
        if ((message.yieldResolvedText ?? '').trim().length > 0) return false;

        return true;
      }
    );
    let persistedRows = reorderedMapped;
    let preserveTyping = !!existingTyping;
    let liveOperationIdForTyping: string | null = null;
    let rowsBeforeLiveFilter = reorderedMapped.length;
    let rowsAfterLiveFilter = reorderedMapped.length;
    if (existingTyping) {
      const liveOperationId = this.streamRegistry.getOperationIdForThread(threadId);
      liveOperationIdForTyping = liveOperationId ?? null;
      preserveTyping = this.shouldPreserveTypingAfterThreadReload(
        existingTyping,
        reorderedMapped,
        liveOperationId ?? null
      );
      if (liveOperationId) {
        const rowsBeforeFilter = reorderedMapped.length;
        rowsBeforeLiveFilter = rowsBeforeFilter;
        const liveReplayOperationIds = new Set<string>(
          [liveOperationId, existingTyping.operationId].filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0
          )
        );
        const assistantRowsForLiveOperation = reorderedMapped.filter(
          (m) => m.role === 'assistant' && m.operationId === liveOperationId
        ).length;

        persistedRows = reorderedMapped.filter(
          (m) =>
            !this.shouldDropPersistedRowForActiveTyping(m, {
              liveOperationId,
              existingTyping,
              replayOperationIds: liveReplayOperationIds,
            })
        );
        rowsAfterLiveFilter = persistedRows.length;

        const hasPersistedYieldAssistantForLiveOperation = this.hasYieldedAssistantRowForOperation(
          persistedRows,
          liveOperationId
        );
        const isYieldAnsweredForLiveOp = reorderedMapped.some(
          (m) => m.role === 'user' && m.operationId === liveOperationId
        );
        if (hasPersistedYieldAssistantForLiveOperation && !isYieldAnsweredForLiveOp) {
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
          isYieldAnsweredForLiveOp,
        });
      }
    }
    const mergedRows = this.mergePreservedInlineYieldRows(persistedRows, preservedInlineYieldRows);
    const finalRows =
      preserveTyping && existingTyping ? [...mergedRows, existingTyping] : mergedRows;
    if (existingTyping || mediaAssistantRowsAfter.length > 0) {
      this.logger.info('[ReloadDiag] typing merge decision', {
        threadId,
        contextId: host.contextId(),
        hadExistingTyping: Boolean(existingTyping),
        preserveTyping,
        existingTypingOperationId: existingTyping?.operationId ?? null,
        liveOperationId: liveOperationIdForTyping,
        rowsBeforeLiveFilter,
        rowsAfterLiveFilter,
        mergedRowsCount: mergedRows.length,
        finalRowsCount: finalRows.length,
        mediaAssistantRowsAfter: mediaAssistantRowsAfter.length,
        mediaAssistantMessageIdsAfter: mediaAssistantRowsAfter.map((message) => message.id),
      });
    }
    this.messageFacade.messages.set(finalRows);

    this.generateThumbnailsForHistoryVideos(persistedRows);

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
          'enqueue',
          enqueueWaitingEntry.operationId ?? undefined
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

        return candidate.reason === incomingReason && (message.operationId ?? '') === incomingOpId;
      });
    };

    const latestMessageOperationId = [...canonicalItems]
      .reverse()
      .map((message) => (typeof message.operationId === 'string' ? message.operationId.trim() : ''))
      .find((id) => this.isFirestoreOperationId(id));
    if (latestMessageOperationId) {
      host.setCurrentOperationId(latestMessageOperationId);
    }

    const lastYieldIdx = items.reduce(
      (latest, item, idx) =>
        item.role === 'assistant' && item.semanticPhase === 'assistant_yield' ? idx : latest,
      -1
    );
    const yieldAlreadyCompleted =
      lastYieldIdx >= 0 &&
      items
        .slice(lastYieldIdx + 1)
        .some((item) => item.role === 'assistant' && item.semanticPhase === 'assistant_final');

    if (persistedPendingYieldState) {
      if (!hasMatchingYieldMessage(persistedPendingYieldState) && !yieldAlreadyCompleted) {
        this.applyPendingYieldState(persistedPendingYieldState, threadId, 'thread-metadata');
      } else {
        this.logger.info(
          'Skipped applying thread-metadata yield: already present in mapped messages or yield completed',
          {
            threadId,
            contextId: host.contextId(),
            yieldAlreadyCompleted,
          }
        );
      }
    } else if (timelinePendingYieldState) {
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
      const streamStillActive = this.streamRegistry.hasActiveStream(threadId);
      if (streamStillActive) {
        this.logger.info('Skipping rehydrate reconciliation — live stream active for thread', {
          threadId,
          contextId: host.contextId(),
        });
      } else {
        const currentContextOperationId = this.resolveFirestoreOperationId();
        const hasMongoFinal = this.hasMongoFinalForOperation(
          canonicalItems,
          currentContextOperationId
        );
        if (hasMongoFinal) {
          host.setOperationStatus('complete');
          this.operationEventService.emitOperationStatusUpdated(
            threadId,
            'complete',
            new Date().toISOString(),
            'chat',
            currentContextOperationId ?? undefined
          );
          this.logger.info('Reconciled operation to complete from Mongo assistant_final', {
            threadId,
            contextId: host.contextId(),
          });
        } else {
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
              new Date().toISOString(),
              'chat',
              operationId ?? undefined
            );

            this.logger.info('Reconciled operation status from stored lifecycle state', {
              threadId,
              contextId: host.contextId(),
              lifecycleStatus: latestLifecycleStatus,
              reconciledStatus,
            });
          } else {
            this.logger.info('Keeping operation in processing while awaiting upstream events', {
              threadId,
              contextId: host.contextId(),
            });
          }
        }
      }
    }

    if (host.getOperationStatus() === 'complete') {
      this.messageFacade.settleActiveToolSteps('success');
    } else if (host.getOperationStatus() === 'error' || host.getOperationStatus() === 'paused') {
      this.messageFacade.settleActiveToolSteps('error');
    }

    if (host.getOperationStatus() === 'error') {
      this.injectFailureMessage();
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
        this.messageFacade.queueTypingDelta(
          text,
          this.normalizeTypingAssistantMediaMarkdownAfterFlush
        );
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
          const heavyTaskOperationId = this.getEnqueueHeavyTaskOperationId(step);
          if (heavyTaskOperationId) {
            host.setCurrentOperationId(heavyTaskOperationId);
          }
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
        this.normalizeTypingAssistantMediaMarkdown({ final: true });
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
        host.setActivityPhase('completed');
        host.loading.set(false);
        void this.haptics.notification('success');
        this.transportFacade.emitResponseCompleteOnce('stream-registry-done');
      },
      onError: (error) => {
        // If the stream died due to a client-side connectivity issue (iOS/Android
        // backgrounding, stall timer) and the operation is still expected to be
        // running, fall back to Firestore instead of showing a technical error.
        // isActiveOperation() covers 'processing' | 'paused' | 'awaiting_input' |
        // 'awaiting_approval' — including the "Waiting for your reply" yield state
        // where the SSE stream may still be held open by the server.
        if (
          this.isClientSideConnectivityError(error ?? '') &&
          host.contextId().trim() &&
          host.contextType() === 'operation' &&
          this.isActiveOperation()
        ) {
          this.logger.info(
            'SSE claim listener error — connectivity issue detected, falling back to Firestore',
            { threadId, error, operationId: host.contextId() }
          );
          this.messageFacade.flushPendingTypingDelta();
          void this.reconcileOperationFromStoredEvents(host.contextId(), {
            source: 'stream-registry-connectivity-error',
          });
          return;
        }
        this.messageFacade.replaceTyping({
          id: host.uid(),
          role: 'assistant',
          content: error || 'Something went wrong. Please try again.',
          timestamp: new Date(),
          error: true,
        });
        host.setActivityPhase('failed', error || null);
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
          const snapshotAttachments = this.buildMediaAttachmentsFromStreamEvents(snapshot.media);
          const snapshotCardsWithoutYield = snapshot.cards.filter(
            (card) => !this.isYieldRichCard(card)
          );
          const snapshotPartsWithoutYield = this.promoteAssistantMediaPartsToMarkdown(
            this.stripYieldCardsFromParts(snapshot.parts),
            { attachments: snapshotAttachments }
          );
          this.messageFacade.messages.update((messages) => [
            ...messages,
            {
              id: 'typing',
              role: 'assistant',
              content: this.promoteAssistantMediaUrlsToMarkdown(snapshot.content, {
                attachments: snapshotAttachments,
              }),
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
            // If the stream errored due to a client-side connectivity failure
            // (iOS/Android killed the network while backgrounded, SSE stall timer),
            // never surface the raw transport error string to the user:
            //   - If the operation is still processing → fall back to Firestore.
            //   - If the operation is already complete/errored → loadThreadMessages
            //     already reconciled the final state; silently drop the stale error.
            if (this.isClientSideConnectivityError(fresh.error)) {
              if (
                host.contextId().trim() &&
                host.contextType() === 'operation' &&
                this.isActiveOperation()
              ) {
                this.logger.info(
                  'Stale SSE connectivity error on session re-entry — falling back to Firestore',
                  { threadId, error: fresh.error, operationId: host.contextId() }
                );
                this.breadcrumb.trackStateChange(
                  'operation-chat:stale-sse-error-firestore-fallback',
                  { operationId: host.contextId(), error: fresh.error }
                );
                this.messageFacade.flushPendingTypingDelta();
                void this.reconcileOperationFromStoredEvents(host.contextId(), {
                  source: 'stream-registry-stale-connectivity-error',
                });
                return;
              }
              // Operation completed or errored while backgrounded — drop the stale
              // transport error silently. The messages are already loaded.
              this.logger.info(
                'Stale SSE connectivity error suppressed — operation already reconciled',
                { threadId, error: fresh.error, operationStatus: host.getOperationStatus() }
              );
              return;
            }
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
            const freshAttachments = this.buildMediaAttachmentsFromStreamEvents(fresh.media);
            const normalizedFreshContent = this.normalizeMessageContent(
              this.promoteAssistantMediaUrlsToMarkdown(fresh.content, {
                attachments: freshAttachments,
              })
            );
            const replayOperationIds = new Set<string>();
            const completedOperationId = this.streamRegistry.getOperationIdForThread(threadId);
            if (completedOperationId) {
              replayOperationIds.add(completedOperationId);
            }
            const existingAssistantMatches = this.messageFacade
              .messages()
              .filter(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  (this.normalizeMessageContent(m.content) === normalizedFreshContent ||
                    this.shouldDropLiveReplayAssistantRow(m, {
                      operationIds: replayOperationIds,
                      content: fresh.content,
                      steps: fresh.steps,
                    }))
              )
              .map((m) => ({
                id: m.id,
                operationId: m.operationId ?? null,
                contentLength: (m.content ?? '').length,
                hasMediaSignal: this.containsMediaReplaySignal(m.content),
                hasAttachments: Boolean(m.attachments?.length),
              }));
            const alreadyPresent = existingAssistantMatches.length > 0;
            this.logger.info('[ReloadDiag] replay append guard decision', {
              threadId,
              contextId: host.contextId(),
              completedOperationId: completedOperationId ?? null,
              replayOperationIds: [...replayOperationIds],
              freshContentLength: fresh.content.length,
              normalizedFreshContentLength: normalizedFreshContent.length,
              freshHasMediaSignal: this.containsMediaReplaySignal(fresh.content),
              freshStepsCount: fresh.steps.length,
              alreadyPresent,
              matchedAssistantCount: existingAssistantMatches.length,
              matchedAssistants: existingAssistantMatches,
            });
            if (!alreadyPresent) {
              const freshCardsWithoutYield = fresh.cards.filter(
                (card) => !this.isYieldRichCard(card)
              );
              const freshPartsWithoutYield = this.promoteAssistantMediaPartsToMarkdown(
                this.stripYieldCardsFromParts(fresh.parts),
                { attachments: freshAttachments }
              );
              this.messageFacade.messages.update((messages) => [
                ...messages,
                {
                  id: host.uid(),
                  role: 'assistant',
                  content: this.promoteAssistantMediaUrlsToMarkdown(fresh.content, {
                    attachments: freshAttachments,
                  }),
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

          // Bug A: sync RAF-buffered deltas with any existing typing bubble before
          // applying fresh.content. When a bubble ALREADY EXISTS (seeded from snapshot
          // above), pendingTypingDelta may contain chars that arrived between claim() and
          // this .then() callback (e.g. "\n\n" before "## heading"). Discarding those
          // chars with clearPendingTypingDelta() leaves a gap that collapses newlines,
          // turning "---\n\n## heading" into "---## heading" and breaking markdown.
          // Flush instead so the pending chars are written into the existing bubble
          // and the content stays contiguous. The "never add a second typing bubble"
          // guard below still prevents fresh.content from being re-inserted.
          // If no bubble exists yet, discard the pending delta as before — fresh.content
          // will be used as the authoritative full content for the new insertion below.
          const hasExistingTypingBubble = this.messageFacade
            .messages()
            .some((m) => m.id === 'typing');
          if (hasExistingTypingBubble) {
            this.messageFacade.flushPendingTypingDelta();
          } else {
            this.messageFacade.clearPendingTypingDelta();
          }
          this.messageFacade.messages.update((messages) => {
            // Guard: if a finalized (non-typing) assistant message already has
            // this exact content, the operation completed before we arrived
            // here. Adding a second bubble would show the answer twice.
            // Normalize fresh.content through the same URL-promotion pipeline that
            // loadThreadMessages applies so bare-URL vs markdown-URL variants match.
            const freshAttachments = this.buildMediaAttachmentsFromStreamEvents(fresh.media);
            if (
              fresh.content?.trim() &&
              messages.some(
                (m) =>
                  m.role === 'assistant' &&
                  !m.isTyping &&
                  this.normalizeMessageContent(m.content) ===
                    this.normalizeMessageContent(
                      this.promoteAssistantMediaUrlsToMarkdown(fresh.content, {
                        attachments: freshAttachments,
                      })
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
                content: this.promoteAssistantMediaUrlsToMarkdown(fresh.content, {
                  attachments: freshAttachments,
                }),
                timestamp: new Date(),
                isTyping: !fresh.content,
                steps: fresh.steps.length > 0 ? [...fresh.steps] : undefined,
                cards: fresh.cards.filter((card) => !this.isYieldRichCard(card)).length
                  ? [...fresh.cards.filter((card) => !this.isYieldRichCard(card))]
                  : undefined,
                parts: this.stripYieldCardsFromParts(fresh.parts).length
                  ? [
                      ...this.promoteAssistantMediaPartsToMarkdown(
                        this.stripYieldCardsFromParts(fresh.parts),
                        { attachments: freshAttachments }
                      ),
                    ]
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
      (host.getOperationStatus() === 'processing' || host.getOperationStatus() === 'complete')
    ) {
      const wasAlreadyCompletedThread = host.getOperationStatus() === 'complete';
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
        const replayAttachments = this.buildMediaAttachmentsFromStreamEvents(stored.media);
        const replayContent = this.promoteAssistantMediaUrlsToMarkdown(stored.content, {
          attachments: replayAttachments,
        });
        const holdEnqueueUntilDone = this.shouldHoldEnqueueUntilDone(operationId);
        const storedHeavyTaskOperationId = stored.steps
          .map((step) => this.getEnqueueHeavyTaskOperationId(step))
          .find((candidate): candidate is string => !!candidate);
        if (storedHeavyTaskOperationId) {
          host.setCurrentOperationId(storedHeavyTaskOperationId);
        }

        if (stored.latestYieldState) {
          host.applyYieldState({
            yieldState: stored.latestYieldState,
            source: 'stored-state-rehydrate',
            operationId,
          });
        }

        if (
          !stored.isDone &&
          (stored.latestLifecycleStatus === 'failed' ||
            stored.latestLifecycleStatus === 'cancelled')
        ) {
          this.clearEnqueueWaitingMessage();
          host.latestProgressLabel.set(null);
          host.setActivityPhase(
            stored.latestLifecycleStatus === 'failed' ? 'failed' : 'cancelled',
            stored.latestLifecycleStatus === 'failed'
              ? 'Something went wrong. Please try again.'
              : null
          );
          host.setOperationStatus(
            stored.latestLifecycleStatus === 'failed' ? 'error' : 'cancelled'
          );
          this.operationEventService.emitOperationStatusUpdated(
            host.threadId().trim() || operationId,
            stored.latestLifecycleStatus === 'failed' ? 'error' : 'cancelled',
            new Date().toISOString(),
            'chat',
            operationId
          );
          host.loading.set(false);
          return;
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
          const normalizedStoredContent = this.normalizeMessageContent(replayContent);
          if (
            !alreadyHasAssistant &&
            (stored.content || replayAttachments.length > 0) &&
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
                content: replayContent,
                timestamp: new Date(),
                isTyping: false,
                steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
                parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
                cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
                attachments: replayAttachments.length > 0 ? replayAttachments : undefined,
              },
            ]);
          }
          if (wasAlreadyCompletedThread) {
            host.setActivityPhase('idle');
            host.setOperationStatus(null);
            host.loading.set(false);
            return;
          }

          host.setOperationStatus('complete');
          this.operationEventService.emitOperationStatusUpdated(
            host.threadId().trim() || operationId,
            'complete',
            new Date().toISOString(),
            'chat',
            operationId
          );
          host.loading.set(false);
          this.transportFacade.emitResponseCompleteOnce('stored-event-rehydrate-complete');
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
          this.subscribeToFirestoreJobEvents(undefined, stored.maxSeq, {
            holdUntilDone: true,
            threadIdForCompletionRefresh: threadId,
          });
          return;
        }

        // Phase 5: use stored.parts directly — getStoredEventState now builds parts
        // in seq order (same merge logic as the SSE stream registry) so text, tools,
        // and cards are interleaved at their exact positions. No manual storedParts
        // construction here that would hardcode tools-first/text-last order.
        const replayOperationIds = new Set<string>(
          [operationId, host.getCurrentOperationId()].filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0
          )
        );
        const typingBubble: Pick<AgentMessage, 'content' | 'parts' | 'cards'> = {
          content: replayContent,
          parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
          cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
        };
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
            (message) =>
              !this.shouldDropLiveReplayAssistantRow(message, {
                operationIds: replayOperationIds,
                content: this.agentMessageDisplayText(
                  typingBubble as Pick<AgentMessage, 'content' | 'parts'>
                ),
                steps: stored.steps,
              })
          );
          return [
            ...filtered,
            {
              id: 'typing',
              role: 'assistant',
              content: replayContent,
              timestamp: new Date(),
              isTyping: !stored.content,
              steps: stored.steps.length > 0 ? [...stored.steps] : undefined,
              parts: stored.parts.length > 0 ? [...stored.parts] : undefined,
              cards: stored.cards.length > 0 ? [...stored.cards] : undefined,
              attachments: replayAttachments.length > 0 ? replayAttachments : undefined,
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

      // Guard: don't restore yield state if the loaded message timeline shows
      // the yield was already answered and the resumed operation completed.
      //
      // Strategy: look at messages that come AFTER the last user message.
      // Completed session  → has an assistant message without yieldState (the
      //   final response) AND no unresolved yield card in that slice.
      // Pending ask_user   → slice is empty (yield row suppressed by
      //   inputYieldedOpIds filtering), so we fall through and apply.
      // Pending approval   → slice contains toolCallMsg (no yieldState) AND
      //   an approval card (yieldState != null, not resolved); the unresolved
      //   yield flag prevents false-positive skipping.
      // Multi-round pending → last user message has nothing after it yet;
      //   both flags are false → we fall through and apply correctly.
      const currentMessages = this.messageFacade.messages();
      const lastUserMsgIdx = currentMessages.reduceRight(
        (found: number, m, idx) => (found >= 0 ? found : m.role === 'user' ? idx : -1),
        -1
      );
      const messagesAfterLastUser =
        lastUserMsgIdx >= 0 ? currentMessages.slice(lastUserMsgIdx + 1) : currentMessages;
      const hasUnresolvedYieldAfterLastUser = messagesAfterLastUser.some(
        (m) => m.role === 'assistant' && !!m.yieldState && m.yieldCardState !== 'resolved'
      );
      const hasAssistantFinalAfterLastUser = messagesAfterLastUser.some(
        (m) => m.role === 'assistant' && !m.yieldState
      );
      if (hasAssistantFinalAfterLastUser && !hasUnresolvedYieldAfterLastUser) {
        this.logger.info(
          'Skipped stored-state-pending: message timeline shows yield already completed',
          { threadId, contextId: host.contextId(), operationId }
        );
        return;
      }

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
      if (this.isPauseYieldSupersededByLaterTurn(yieldState, items)) continue;

      const persistedYieldCardStateRaw = item.resultData?.['yieldCardState'];
      if (persistedYieldCardStateRaw === 'resolved') continue;

      // Skip completed yields: if any assistant_final follows this yield row
      // in the thread timeline, the yield was answered and the resumed
      // operation has completed. Without this check, reloading a finished
      // ask_user session incorrectly shows "Waiting for your reply..." because
      // the raw MongoDB row never has yieldCardState set to 'resolved'
      // (that field is frontend-only during the live stream, Bug #6).
      const hasSubsequentFinal = items
        .slice(index + 1)
        .some((later) => later.role === 'assistant' && later.semanticPhase === 'assistant_final');
      if (hasSubsequentFinal) continue;

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

  private hasMongoFinalForOperation(
    items: readonly AgentMessage[],
    operationId: string | null
  ): boolean {
    // If we cannot resolve the current operationId, fall back to the legacy
    // behaviour (any assistant_final in the thread signals completion) rather
    // than leaving the operation spinner running indefinitely.
    if (!operationId) {
      return items.some(
        (item) => item.role === 'assistant' && item.semanticPhase === 'assistant_final'
      );
    }
    // Scope the check to the current operation so that a completed prior turn
    // does not prematurely mark a still-running operation as complete.
    return items.some(
      (item) =>
        item.role === 'assistant' &&
        item.semanticPhase === 'assistant_final' &&
        item.operationId === operationId
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

  /**
   * After loading history messages, asynchronously generate canvas thumbnails
   * for any video attachment that does not yet have a thumbnailUrl.
   * Silently no-ops in SSR and on CORS/canvas failures.
   */
  private generateThumbnailsForHistoryVideos(messages: readonly OperationMessage[]): void {
    if (typeof document === 'undefined') return;

    for (const message of messages) {
      if (!message.attachments?.length) continue;

      for (const [attIdx, att] of message.attachments.entries()) {
        if (att.type !== 'video' || att.thumbnailUrl || !att.url) continue;

        const msgId = message.id;
        void this.generateVideoThumbnailFromUrl(att.url).then((thumbnailUrl) => {
          if (!thumbnailUrl) return;

          this.messageFacade.messages.update((msgs) =>
            msgs.map((msg) => {
              if (msg.id !== msgId || !msg.attachments) return msg;
              const updated = msg.attachments.map((a, i) =>
                i === attIdx && a.type === 'video' && !a.thumbnailUrl
                  ? ({ ...a, thumbnailUrl } as typeof a)
                  : a
              );
              return { ...msg, attachments: updated };
            })
          );
        });
      }
    }
  }

  /**
   * Extract a JPEG thumbnail from a remote video URL using Canvas.
   * Requires the server to send proper CORS headers (Access-Control-Allow-Origin);
   * Firebase Storage buckets with the project CORS config satisfy this.
   * Returns null on any failure so callers can fall back gracefully.
   */
  private generateVideoThumbnailFromUrl(url: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      try {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        // preload="auto" ensures the browser downloads enough data to fire
        // loadedmetadata and decode a seekable frame — required for canvas draw.
        video.preload = 'auto';
        video.src = url;

        const cleanup = (): void => {
          video.removeAttribute('src');
          video.load();
        };

        // Give up after 10 s to avoid leaking event listeners on slow/broken URLs.
        const timeoutId = setTimeout(() => {
          cleanup();
          resolve(null);
        }, 10_000);

        const done = (result: string | null): void => {
          clearTimeout(timeoutId);
          resolve(result);
        };

        // loadedmetadata fires with preload="metadata" or "auto" once duration
        // and dimensions are known. We then seek to the first frame.
        video.addEventListener(
          'loadedmetadata',
          () => {
            video.currentTime = Math.min(1, video.duration * 0.25) || 0;
          },
          { once: true }
        );

        video.addEventListener(
          'seeked',
          () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || 320;
              canvas.height = video.videoHeight || 240;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                cleanup();
                done(null);
                return;
              }
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
              cleanup();
              done(dataUrl);
            } catch {
              cleanup();
              done(null);
            }
          },
          { once: true }
        );

        video.addEventListener(
          'error',
          () => {
            cleanup();
            done(null);
          },
          { once: true }
        );

        video.load();
      } catch {
        resolve(null);
      }
    });
  }
}
