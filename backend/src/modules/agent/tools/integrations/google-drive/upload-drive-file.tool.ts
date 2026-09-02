/**
 * @fileoverview Upload Google Drive File Tool — Direct REST Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/google-drive
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import {
  uploadDriveFile,
  uploadStoredDriveFile,
} from '../../../../../services/platform/connected-drive.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const UploadDriveFileInputSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Name of the file to create or upload in Google Drive (e.g. "Scout_Report.pdf", "Notes.txt"). Required for raw content uploads; optional when uploading an existing NXT1 file reference.'
      ),
    content_base64: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Base64-encoded content of the file to upload.'),
    mime_type: z
      .string()
      .trim()
      .optional()
      .describe('MIME type of the file (e.g. "application/pdf", "text/plain", "image/png").'),
    parent_folder_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional ID of the parent folder in Google Drive to upload this file into.'),
    source_storage_path: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Trusted NXT1 Firebase Storage path for an existing file to copy into Google Drive.'
      ),
    source_url: z
      .string()
      .trim()
      .url()
      .optional()
      .describe('Existing Firebase Storage URL for an NXT1 file to copy into Google Drive.'),
    document_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional NXT1 Files document id to resolve and upload to Google Drive.'),
  })
  .superRefine((value, ctx) => {
    const hasRawContent =
      typeof value.content_base64 === 'string' && value.content_base64.length > 0;
    const hasStoredSource =
      (typeof value.source_storage_path === 'string' && value.source_storage_path.length > 0) ||
      (typeof value.source_url === 'string' && value.source_url.length > 0) ||
      (typeof value.document_id === 'string' && value.document_id.length > 0);

    if (!hasRawContent && !hasStoredSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide either content_base64 or one of source_storage_path, source_url, or document_id.',
      });
    }

    if (hasRawContent && (!value.filename || value.filename.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'filename is required when using content_base64.',
        path: ['filename'],
      });
    }
  });

export class UploadDriveFileTool extends BaseTool {
  readonly name = 'upload_drive_file';
  readonly description =
    "Upload a file to the user's connected Google Drive account by providing its content as base64 or by referencing an existing NXT1 file via storage path, Firebase URL, or document id. " +
    'Supports optional parent folder placement. ' +
    'Requires that Google is connected in Settings -> Connected Accounts.';

  readonly parameters = UploadDriveFileInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'data' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UploadDriveFileInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const {
      filename,
      content_base64,
      mime_type,
      parent_folder_id,
      source_storage_path,
      source_url,
      document_id,
    } = parsed.data;

    context.emitStage?.('submitting_job', {
      source: 'google_drive',
      phase: 'upload_file',
      filename: filename ?? source_storage_path ?? document_id ?? 'google-drive-upload',
      icon: 'document',
    });

    try {
      const result = content_base64
        ? await uploadDriveFile(
            context.userId,
            filename as string,
            content_base64,
            mime_type ?? 'application/octet-stream',
            parent_folder_id,
            context.environment
          )
        : await uploadStoredDriveFile(
            context.userId,
            {
              filename,
              mimeType: mime_type,
              parentFolderId: parent_folder_id,
              sourceStoragePath: source_storage_path,
              sourceUrl: source_url,
              documentId: document_id,
            },
            context.environment
          );

      logger.info('[UploadDriveFileTool] File uploaded', {
        userId: context.userId,
        filename: result.name,
        fileId: result.id,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to upload Google Drive file.';
      logger.error('[UploadDriveFileTool] Failed to upload file', {
        userId: context.userId,
        filename,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
