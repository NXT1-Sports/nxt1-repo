import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import { sendSlackAlert, type AlertField } from '../../platform/alert.service.js';
import { logger } from '../../../utils/logger.js';

export type AgentXVideoUploadFailureStage =
  | 'firebase_provision_failed'
  | 'cloudflare_direct_provision_failed'
  | 'cloudflare_finalize_failed';

export type AgentXUploadFailureStage =
  | 'firebase_file_upload_failed'
  | 'firebase_tmp_upload_failed'
  | 'firebase_tmp_promote_failed';

export type AgentXFilmReviewFailureStage =
  | 'file_backed_create_failed'
  | 'uploaded_create_failed'
  | 'update_failed'
  | 'breakdown_import_failed'
  | 'ai_refresh_failed'
  | 'delete_failed'
  | 'drawing_create_failed'
  | 'drawing_update_failed'
  | 'drawing_delete_failed'
  | 'drawing_list_failed'
  | 'annotation_create_failed'
  | 'annotation_delete_failed';

export interface AgentXVideoUploadFailureAlertInput {
  readonly stage: AgentXVideoUploadFailureStage;
  readonly error: string;
  readonly userId?: string | null;
  readonly threadId?: string | null;
  readonly uploadContext?: string | null;
  readonly fileName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly cloudflareVideoId?: string | null;
  readonly nativeUpload?: boolean;
  readonly httpStatus?: number;
  readonly errorCode?: string | null;
  readonly details?: string | null;
  readonly requestPath?: string | null;
  readonly contentType?: string | null;
  readonly userAgent?: string | null;
}

export interface AgentXUploadFailureAlertInput {
  readonly stage: AgentXUploadFailureStage;
  readonly error: string;
  readonly userId?: string | null;
  readonly teamId?: string | null;
  readonly threadId?: string | null;
  readonly fileName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly storagePath?: string | null;
  readonly promotedStoragePath?: string | null;
  readonly requestPath?: string | null;
  readonly contentType?: unknown;
  readonly userAgent?: unknown;
  readonly details?: string | null;
}

export interface AgentXFilmReviewFailureAlertInput {
  readonly stage: AgentXFilmReviewFailureStage;
  readonly error: string;
  readonly userId?: string | null;
  readonly teamId?: string | null;
  readonly fileId?: string | null;
  readonly reviewId?: string | null;
  readonly drawingId?: string | null;
  readonly annotationId?: string | null;
  readonly title?: string | null;
  readonly uploadMode?: string | null;
  readonly sourceCount?: number | null;
  readonly attachmentName?: string | null;
  readonly mimeType?: string | null;
  readonly fileSizeBytes?: number | null;
  readonly storagePath?: string | null;
  readonly requestPath?: string | null;
  readonly contentType?: unknown;
  readonly userAgent?: unknown;
  readonly details?: string | null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === 'string') return normalizeOptional(value);
  if (Array.isArray(value) && typeof value[0] === 'string') return normalizeOptional(value[0]);
  return null;
}

function formatFileSizeBytes(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return `${Math.round(value).toLocaleString()} bytes`;
}

function getStageSummary(stage: AgentXVideoUploadFailureStage): string {
  switch (stage) {
    case 'firebase_provision_failed':
      return 'Agent X video upload failed while provisioning a Firebase signed upload URL.';
    case 'cloudflare_direct_provision_failed':
      return 'Agent X video upload failed while provisioning a Cloudflare Stream direct upload session.';
    case 'cloudflare_finalize_failed':
      return 'Agent X video upload failed while finalizing Cloudflare Stream playback metadata.';
  }
}

function getUploadStageSummary(stage: AgentXUploadFailureStage): string {
  switch (stage) {
    case 'firebase_file_upload_failed':
      return 'Agent X failed while uploading a file to Firebase Storage.';
    case 'firebase_tmp_upload_failed':
      return 'Agent X failed while uploading a temporary file to Firebase Storage.';
    case 'firebase_tmp_promote_failed':
      return 'Agent X failed while promoting a temporary upload to durable media storage.';
  }
}

function getFilmReviewStageSummary(stage: AgentXFilmReviewFailureStage): string {
  switch (stage) {
    case 'file_backed_create_failed':
      return 'Agent X failed while attaching Film Review data to an existing UniversalFile.';
    case 'uploaded_create_failed':
      return 'Agent X failed while creating a Film Review from an uploaded video attachment.';
    case 'update_failed':
      return 'Agent X failed while updating a Film Review.';
    case 'breakdown_import_failed':
      return 'Agent X failed while importing a Film Review breakdown file.';
    case 'ai_refresh_failed':
      return 'Agent X failed while refreshing Film Review AI fields.';
    case 'delete_failed':
      return 'Agent X failed while deleting a Film Review.';
    case 'drawing_create_failed':
      return 'Agent X failed while creating a Film Review drawing.';
    case 'drawing_update_failed':
      return 'Agent X failed while updating a Film Review drawing.';
    case 'drawing_delete_failed':
      return 'Agent X failed while deleting a Film Review drawing.';
    case 'drawing_list_failed':
      return 'Agent X failed while listing Film Review drawings.';
    case 'annotation_create_failed':
      return 'Agent X failed while creating a Film Review annotation.';
    case 'annotation_delete_failed':
      return 'Agent X failed while deleting a Film Review annotation.';
  }
}

export async function sendAgentXVideoUploadFailureAlert(
  input: AgentXVideoUploadFailureAlertInput
): Promise<boolean> {
  const fields: AlertField[] = [
    { label: 'Stage', value: input.stage },
    { label: 'Environment', value: getRuntimeEnvironment() },
    { label: 'Error', value: truncate(input.error, 900) },
  ];

  const userId = normalizeOptional(input.userId);
  if (userId) fields.push({ label: 'User ID', value: userId });

  const threadId = normalizeOptional(input.threadId);
  if (threadId) fields.push({ label: 'Thread ID', value: threadId });

  const uploadContext = normalizeOptional(input.uploadContext);
  if (uploadContext) fields.push({ label: 'Upload Context', value: uploadContext });

  const fileName = normalizeOptional(input.fileName);
  if (fileName) fields.push({ label: 'File Name', value: truncate(fileName, 300) });

  const mimeType = normalizeOptional(input.mimeType);
  if (mimeType) fields.push({ label: 'MIME Type', value: mimeType });

  const fileSize = formatFileSizeBytes(input.fileSizeBytes);
  if (fileSize) fields.push({ label: 'File Size', value: fileSize });

  const cloudflareVideoId = normalizeOptional(input.cloudflareVideoId);
  if (cloudflareVideoId) fields.push({ label: 'Cloudflare Video ID', value: cloudflareVideoId });

  if (typeof input.nativeUpload === 'boolean') {
    fields.push({ label: 'Native Upload', value: input.nativeUpload ? 'yes' : 'no' });
  }

  if (typeof input.httpStatus === 'number' && Number.isFinite(input.httpStatus)) {
    fields.push({ label: 'HTTP Status', value: String(input.httpStatus) });
  }

  const errorCode = normalizeOptional(input.errorCode);
  if (errorCode) fields.push({ label: 'Error Code', value: errorCode });

  const details = normalizeOptional(input.details);
  if (details) fields.push({ label: 'Details', value: truncate(details, 900) });

  const requestPath = normalizeOptional(input.requestPath);
  if (requestPath) fields.push({ label: 'Request Path', value: requestPath });

  const contentType = normalizeHeaderValue(input.contentType);
  if (contentType) fields.push({ label: 'Content Type', value: contentType });

  const userAgent = normalizeHeaderValue(input.userAgent);
  if (userAgent) fields.push({ label: 'User Agent', value: truncate(userAgent, 350) });

  try {
    const delivered = await sendSlackAlert({
      target: 'agent',
      environment: getRuntimeEnvironment(),
      severity: 'critical',
      title: 'Agent X Video Upload Failed',
      summary: getStageSummary(input.stage),
      fields,
    });

    if (!delivered) {
      logger.warn('[AgentXVideoUploadFailureAlert] Slack delivery did not succeed', {
        stage: input.stage,
        userId: userId ?? null,
        threadId: threadId ?? null,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[AgentXVideoUploadFailureAlert] Failed to dispatch Slack alert', {
      stage: input.stage,
      userId: userId ?? null,
      threadId: threadId ?? null,
      error,
    });
    return false;
  }
}

export async function sendAgentXUploadFailureAlert(
  input: AgentXUploadFailureAlertInput
): Promise<boolean> {
  const environment = getRuntimeEnvironment();
  const fields: AlertField[] = [
    { label: 'Stage', value: input.stage },
    { label: 'Environment', value: environment },
    { label: 'Error', value: truncate(input.error, 900) },
  ];

  const userId = normalizeOptional(input.userId);
  if (userId) fields.push({ label: 'User ID', value: userId });

  const teamId = normalizeOptional(input.teamId);
  if (teamId) fields.push({ label: 'Team ID', value: teamId });

  const threadId = normalizeOptional(input.threadId);
  if (threadId) fields.push({ label: 'Thread ID', value: threadId });

  const fileName = normalizeOptional(input.fileName);
  if (fileName) fields.push({ label: 'File Name', value: truncate(fileName, 300) });

  const mimeType = normalizeOptional(input.mimeType);
  if (mimeType) fields.push({ label: 'MIME Type', value: mimeType });

  const fileSize = formatFileSizeBytes(input.fileSizeBytes);
  if (fileSize) fields.push({ label: 'File Size', value: fileSize });

  const storagePath = normalizeOptional(input.storagePath);
  if (storagePath) fields.push({ label: 'Storage Path', value: truncate(storagePath, 500) });

  const promotedStoragePath = normalizeOptional(input.promotedStoragePath);
  if (promotedStoragePath) {
    fields.push({ label: 'Promoted Storage Path', value: truncate(promotedStoragePath, 500) });
  }

  const requestPath = normalizeOptional(input.requestPath);
  if (requestPath) fields.push({ label: 'Request Path', value: requestPath });

  const contentType = normalizeHeaderValue(input.contentType);
  if (contentType) fields.push({ label: 'Content Type', value: contentType });

  const userAgent = normalizeHeaderValue(input.userAgent);
  if (userAgent) fields.push({ label: 'User Agent', value: truncate(userAgent, 350) });

  const details = normalizeOptional(input.details);
  if (details) fields.push({ label: 'Details', value: truncate(details, 900) });

  try {
    const delivered = await sendSlackAlert({
      target: 'agent',
      environment,
      severity: 'critical',
      title: 'Agent X Upload Failed',
      summary: getUploadStageSummary(input.stage),
      fields,
    });

    if (!delivered) {
      logger.warn('[AgentXUploadFailureAlert] Slack delivery did not succeed', {
        stage: input.stage,
        userId: userId ?? null,
        teamId: teamId ?? null,
        threadId: threadId ?? null,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[AgentXUploadFailureAlert] Failed to dispatch Slack alert', {
      stage: input.stage,
      userId: userId ?? null,
      teamId: teamId ?? null,
      threadId: threadId ?? null,
      error,
    });
    return false;
  }
}

export async function sendAgentXFilmReviewFailureAlert(
  input: AgentXFilmReviewFailureAlertInput
): Promise<boolean> {
  const environment = getRuntimeEnvironment();
  const fields: AlertField[] = [
    { label: 'Stage', value: input.stage },
    { label: 'Environment', value: environment },
    { label: 'Error', value: truncate(input.error, 900) },
  ];

  const userId = normalizeOptional(input.userId);
  if (userId) fields.push({ label: 'User ID', value: userId });

  const teamId = normalizeOptional(input.teamId);
  if (teamId) fields.push({ label: 'Team ID', value: teamId });

  const fileId = normalizeOptional(input.fileId);
  if (fileId) fields.push({ label: 'File ID', value: fileId });

  const reviewId = normalizeOptional(input.reviewId);
  if (reviewId) fields.push({ label: 'Review ID', value: reviewId });

  const drawingId = normalizeOptional(input.drawingId);
  if (drawingId) fields.push({ label: 'Drawing ID', value: drawingId });

  const annotationId = normalizeOptional(input.annotationId);
  if (annotationId) fields.push({ label: 'Annotation ID', value: annotationId });

  const title = normalizeOptional(input.title);
  if (title) fields.push({ label: 'Title', value: truncate(title, 300) });

  const uploadMode = normalizeOptional(input.uploadMode);
  if (uploadMode) fields.push({ label: 'Upload Mode', value: uploadMode });

  if (typeof input.sourceCount === 'number' && Number.isFinite(input.sourceCount)) {
    fields.push({ label: 'Source Count', value: String(input.sourceCount) });
  }

  const attachmentName = normalizeOptional(input.attachmentName);
  if (attachmentName) fields.push({ label: 'Attachment', value: truncate(attachmentName, 300) });

  const mimeType = normalizeOptional(input.mimeType);
  if (mimeType) fields.push({ label: 'MIME Type', value: mimeType });

  const fileSize = formatFileSizeBytes(input.fileSizeBytes);
  if (fileSize) fields.push({ label: 'File Size', value: fileSize });

  const storagePath = normalizeOptional(input.storagePath);
  if (storagePath) fields.push({ label: 'Storage Path', value: truncate(storagePath, 500) });

  const requestPath = normalizeOptional(input.requestPath);
  if (requestPath) fields.push({ label: 'Request Path', value: requestPath });

  const contentType = normalizeHeaderValue(input.contentType);
  if (contentType) fields.push({ label: 'Content Type', value: contentType });

  const userAgent = normalizeHeaderValue(input.userAgent);
  if (userAgent) fields.push({ label: 'User Agent', value: truncate(userAgent, 350) });

  const details = normalizeOptional(input.details);
  if (details) fields.push({ label: 'Details', value: truncate(details, 900) });

  try {
    const delivered = await sendSlackAlert({
      target: 'agent',
      environment,
      severity: 'critical',
      title: 'Agent X Film Review Failed',
      summary: getFilmReviewStageSummary(input.stage),
      fields,
    });

    if (!delivered) {
      logger.warn('[AgentXFilmReviewFailureAlert] Slack delivery did not succeed', {
        stage: input.stage,
        userId: userId ?? null,
        teamId: teamId ?? null,
        fileId: fileId ?? null,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[AgentXFilmReviewFailureAlert] Failed to dispatch Slack alert', {
      stage: input.stage,
      userId: userId ?? null,
      teamId: teamId ?? null,
      fileId: fileId ?? null,
      error,
    });
    return false;
  }
}
