import type {
  AgentMessageSemanticPhase,
  AgentXMessagePart,
  AgentXRichCard,
  AgentXSelectedAction,
  AgentXToolStep,
} from '@nxt1/core/ai';
import type { AgentYieldState } from '@nxt1/core';

/** Attachment preview shown inside a sent message. */
export interface MessageAttachment {
  readonly url: string;
  readonly storagePath?: string;
  readonly type: 'image' | 'video' | 'doc' | 'app' | 'context';
  readonly name: string;
  /**
   * Canvas-extracted thumbnail data URL for video attachments.
   * Generated client-side before upload so iOS can display a static preview
   * frame instead of a blank `<video>` element.
   */
  readonly thumbnailUrl?: string;
  readonly platform?: string;
  readonly faviconUrl?: string;
  readonly contextKind?: string;
  readonly contextSource?: string;
  readonly contextSummary?: string;
}

/** Shape of a pending file staged for upload (preview shown above input). */
export interface PendingFile {
  readonly id: string;
  readonly file: File;
  readonly nativeUri?: string;
  readonly nativeWebPath?: string;
  readonly sizeBytes?: number;
  readonly previewUrl: string | null;
  readonly isImage: boolean;
  readonly isVideo: boolean;
}

/** Shape of a single chat message inside the operation context. */
export interface OperationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
  readonly idempotencyKey?: string;
  readonly operationId?: string;
  readonly attachments?: readonly MessageAttachment[];
  readonly isTyping?: boolean;
  readonly error?: boolean;
  readonly steps?: readonly AgentXToolStep[];
  readonly cards?: readonly AgentXRichCard[];
  readonly parts?: readonly AgentXMessagePart[];
  readonly yieldState?: AgentYieldState;
  readonly yieldCardState?: 'idle' | 'submitting' | 'resolved';
  readonly yieldResolvedText?: string;
  readonly selectedAction?: AgentXSelectedAction;
  readonly interruptedReason?: 'paused' | 'cancelled';
  readonly semanticPhase?: AgentMessageSemanticPhase;
}

export interface StreamTurnWatermark {
  optimisticChars: number;
  confirmedChars: number;
}

export interface PendingUndoState {
  readonly messageId: string;
  readonly restoreTokenId: string;
  readonly threadId: string;
}
