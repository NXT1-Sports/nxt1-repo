import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import { sendSlackAlert, type AlertField } from '../../platform/alert.service.js';
import { logger } from '../../../utils/logger.js';

export type AgentXVideoUploadFailureStage =
  | 'firebase_provision_failed'
  | 'cloudflare_direct_provision_failed'
  | 'cloudflare_finalize_failed';

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
