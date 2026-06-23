/**
 * @fileoverview Team File - Firestore `TeamFiles` collection document type
 *
 * Canonical team-scoped asset index for Agent X uploads, chat attachments,
 * and generated outputs. The binary stays in storage; this document powers the
 * Files panel and downstream workflows such as Film Review.
 */

import type { PortableTimestamp } from '../portable-timestamp.model';

export type TeamFileKind = 'image' | 'video' | 'pdf' | 'csv' | 'doc' | 'app';

export type TeamFileOrigin = 'files_upload' | 'agent_chat_input' | 'agent_chat_output';

export type TeamFileStatus = 'processing' | 'ready' | 'archived';

export interface TeamFileFolderDoc {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly parentId?: string | null;
  readonly sortOrder: number;
  readonly createdByUserId: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
}

export interface TeamFileDoc {
  readonly id: string;
  readonly teamId: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly mimeType: string;
  readonly kind: TeamFileKind;
  readonly status: TeamFileStatus;
  readonly origin: TeamFileOrigin;
  readonly sizeBytes: number;
  readonly url: string;
  readonly folderId?: string | null;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
  readonly platform?: string;
  readonly profileUrl?: string;
  readonly faviconUrl?: string;
  readonly sport?: string;
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
  readonly lastSeenAt: PortableTimestamp;
}
