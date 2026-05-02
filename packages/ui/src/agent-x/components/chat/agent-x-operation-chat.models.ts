import type {
  AgentXMessagePart,
  AgentXRichCard,
  AgentXSelectedAction,
  AgentXToolStep,
} from '@nxt1/core/ai';
import type { AgentYieldState } from '@nxt1/core';

/** Attachment preview shown inside a sent message. */
export interface MessageAttachment {
  readonly url: string;
  readonly type: 'image' | 'video' | 'doc' | 'app';
  readonly name: string;
  readonly platform?: string;
  readonly faviconUrl?: string;
}

/** Shape of a pending file staged for upload (preview shown above input). */
export interface PendingFile {
  readonly id: string;
  readonly file: File;
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
  readonly imageUrl?: string;
  readonly videoUrl?: string;
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
}

export interface PendingUndoState {
  readonly messageId: string;
  readonly restoreTokenId: string;
  readonly threadId: string;
}
