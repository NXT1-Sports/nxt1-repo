/**
 * @fileoverview Agent X Pending File Interface
 * @module @nxt1/ui/agent-x
 *
 * Browser-specific interface for files staged for upload.
 * Lives in @nxt1/ui (not @nxt1/core) because it references
 * the browser-only `File` global.
 */

import type { AgentXAttachmentType } from '@nxt1/core';

/**
 * A file staged for upload in the Agent X input.
 * Contains the browser File object and an optional image preview URL.
 */
export interface AgentXPendingFile {
  /** The browser File object to upload. */
  readonly file: File;
  /** Object URL for image previews (revoke on removal). `null` for non-image files. */
  readonly previewUrl: string | null;
  /** Resolved attachment type (image, pdf, csv, etc.). */
  readonly type: AgentXAttachmentType;
}
