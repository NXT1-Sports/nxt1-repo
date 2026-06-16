import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../../utils/logger.js';
import { processFirecrawlMonitorWebhook } from '../../../modules/agent/services/firecrawl-monitor-notification.service.js';
import { sendFirecrawlMonitorFailureAlert } from '../../../services/communications/firecrawl-monitor/firecrawl-monitor-failure-alert.service.js';

const router = Router();
const secretHeaderSchema = z.string().trim().min(1);

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractAlertContext(body: unknown): {
  readonly eventType: string | null;
  readonly webhookEventId: string | null;
  readonly monitorIds: readonly string[];
  readonly checkIds: readonly string[];
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      eventType: null,
      webhookEventId: null,
      monitorIds: [],
      checkIds: [],
    };
  }

  const record = body as Record<string, unknown>;
  const data = Array.isArray(record['data']) ? record['data'] : [];
  const monitorIds = data
    .map((item) =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
        ? readString((item as Record<string, unknown>)['monitorId'])
        : null
    )
    .filter((value): value is string => value !== null);
  const checkIds = data
    .map((item) =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
        ? readString((item as Record<string, unknown>)['checkId'])
        : null
    )
    .filter((value): value is string => value !== null);

  return {
    eventType: readString(record['type']),
    webhookEventId: readString(record['id']),
    monitorIds,
    checkIds,
  };
}

router.post('/', async (req: Request, res: Response) => {
  const configuredSecret = process.env['FIRECRAWL_MONITOR_WEBHOOK_SECRET']?.trim();
  if (configuredSecret) {
    const rawHeader = req.headers['x-firecrawl-monitor-secret'];
    const parsedHeader = secretHeaderSchema.safeParse(
      Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    );
    if (!parsedHeader.success || parsedHeader.data !== configuredSecret) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Firecrawl monitor webhook secret',
      });
    }
  }

  const db = req.firebase?.db;
  if (!db) {
    const alertContext = extractAlertContext(req.body);
    logger.error('[FirecrawlMonitorWebhook] Firestore is unavailable', {
      ...alertContext,
      contentType: req.headers['content-type'],
    });
    await sendFirecrawlMonitorFailureAlert({
      stage: 'db_unavailable',
      error: 'Firestore is unavailable',
      ...alertContext,
      contentType:
        typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : null,
      hasBody: req.body !== undefined,
    });
    return res.status(503).json({ success: false, error: 'Firestore is unavailable' });
  }

  try {
    const result = await processFirecrawlMonitorWebhook(db, req.body);
    logger.info('[FirecrawlMonitorWebhook] Webhook processed', {
      ...extractAlertContext(req.body),
      processedCount: result.processedCount,
      dispatchedCount: result.dispatchedCount,
      ignoredCount: result.ignoredCount,
    });
    return res.status(200).json({
      success: true,
      received: true,
      processedCount: result.processedCount,
      dispatchedCount: result.dispatchedCount,
      ignoredCount: result.ignoredCount,
    });
  } catch (error) {
    const alertContext = extractAlertContext(req.body);
    if (error instanceof z.ZodError) {
      logger.error('[FirecrawlMonitorWebhook] Invalid webhook payload', {
        ...alertContext,
        issues: error.issues,
        contentType: req.headers['content-type'],
      });
      await sendFirecrawlMonitorFailureAlert({
        stage: 'invalid_payload',
        error: `Invalid Firecrawl monitor webhook payload (${error.issues.length} issue(s)).`,
        ...alertContext,
        contentType:
          typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : null,
        hasBody: req.body !== undefined,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid Firecrawl monitor webhook payload',
      });
    }

    logger.error('[FirecrawlMonitorWebhook] Failed to process webhook', {
      ...alertContext,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    await sendFirecrawlMonitorFailureAlert({
      stage: 'processing_failed',
      error: error instanceof Error ? error.message : String(error),
      ...alertContext,
      contentType:
        typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : null,
      hasBody: req.body !== undefined,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to process Firecrawl monitor webhook',
    });
  }
});

export default router;
