import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import { sendSlackAlert, type AlertField } from '../../platform/alert.service.js';
import { logger } from '../../../utils/logger.js';

export type FirecrawlMonitorFailureStage =
  'db_unavailable' | 'invalid_payload' | 'processing_failed';

export interface FirecrawlMonitorFailureAlertInput {
  readonly stage: FirecrawlMonitorFailureStage;
  readonly error: string;
  readonly eventType?: string | null;
  readonly webhookEventId?: string | null;
  readonly monitorIds?: readonly string[];
  readonly checkIds?: readonly string[];
  readonly contentType?: string | null;
  readonly hasBody?: boolean;
  readonly issueCount?: number;
  readonly schemaIssues?: readonly string[];
  readonly payloadKeys?: readonly string[];
  readonly payloadPreview?: string | null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function uniq(values: readonly string[] | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
  ];
}

function summarizeIds(values: readonly string[] | undefined): string {
  const unique = uniq(values);
  if (unique.length === 0) return 'unknown';
  return truncate(unique.join(', '), 900);
}

function summarizeList(values: readonly string[] | undefined, maxLength: number = 900): string {
  const unique = uniq(values);
  if (unique.length === 0) return 'none';
  return truncate(unique.join(' | '), maxLength);
}

function getStageSummary(stage: FirecrawlMonitorFailureStage): string {
  switch (stage) {
    case 'db_unavailable':
      return 'The Firecrawl monitor webhook reached the backend without a Firestore context.';
    case 'invalid_payload':
      return 'The Firecrawl monitor webhook payload did not match the expected schema.';
    case 'processing_failed':
      return 'The Firecrawl monitor webhook failed during monitor processing or notification dispatch.';
  }
}

export async function sendFirecrawlMonitorFailureAlert(
  input: FirecrawlMonitorFailureAlertInput
): Promise<boolean> {
  const fields: AlertField[] = [
    { label: 'Stage', value: input.stage },
    { label: 'Environment', value: getRuntimeEnvironment() },
    { label: 'Monitor IDs', value: summarizeIds(input.monitorIds) },
    { label: 'Check IDs', value: summarizeIds(input.checkIds) },
    { label: 'Error', value: truncate(input.error, 900) },
  ];

  if (input.eventType?.trim()) {
    fields.splice(2, 0, { label: 'Event Type', value: input.eventType.trim() });
  }

  if (input.webhookEventId?.trim()) {
    fields.splice(3, 0, { label: 'Webhook Event ID', value: input.webhookEventId.trim() });
  }

  if (input.contentType?.trim()) {
    fields.push({ label: 'Content Type', value: input.contentType.trim() });
  }

  if (input.issueCount !== undefined) {
    fields.push({ label: 'Issue Count', value: String(input.issueCount) });
  }

  if (input.schemaIssues && input.schemaIssues.length > 0) {
    fields.push({ label: 'Schema Issues', value: summarizeList(input.schemaIssues) });
  }

  if (input.payloadKeys && input.payloadKeys.length > 0) {
    fields.push({ label: 'Payload Keys', value: summarizeList(input.payloadKeys, 500) });
  }

  if (input.payloadPreview?.trim()) {
    fields.push({ label: 'Payload Preview', value: truncate(input.payloadPreview.trim(), 700) });
  }

  fields.push({ label: 'Has Body', value: input.hasBody === false ? 'no' : 'yes' });

  try {
    const delivered = await sendSlackAlert({
      target: 'agent',
      environment: getRuntimeEnvironment(),
      severity: 'critical',
      title: 'Firecrawl Monitor Pipeline Failed',
      summary: getStageSummary(input.stage),
      fields,
    });

    if (!delivered) {
      logger.warn('[FirecrawlMonitorAlert] Slack delivery did not succeed', {
        stage: input.stage,
        eventType: input.eventType ?? null,
        webhookEventId: input.webhookEventId ?? null,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[FirecrawlMonitorAlert] Failed to dispatch Slack failure alert', {
      stage: input.stage,
      eventType: input.eventType ?? null,
      webhookEventId: input.webhookEventId ?? null,
      error,
    });
    return false;
  }
}
