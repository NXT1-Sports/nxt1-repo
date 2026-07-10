/**
 * @fileoverview Scheduled Investors & Partnerships Outbound Follow-Up Send
 * @module @nxt1/functions/scheduled/investorsPartnershipsOutboundFollowUpSend
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');

export const investorsPartnershipsOutboundFollowUpSend = onSchedule(
  {
    schedule: '0 14 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 540,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting Investors & Partnerships outbound follow-up send job');

    try {
      const result = await postBackendCronJson<{ result?: unknown }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/marketing/cron/investors-partnerships-outbound-follow-up',
        cronSecret: CRON_SECRET.value(),
        jobName: 'investorsPartnershipsOutboundFollowUpSend',
        timeoutMs: 90_000,
        maxAttempts: 3,
        body: {
          limit: 250,
          dailyCap: 250,
        },
      });

      if (!result) {
        logger.warn(
          'Investors & Partnerships outbound follow-up send skipped due to transient backend outage'
        );
        return;
      }

      logger.info('Investors & Partnerships outbound follow-up send completed', {
        result: result.data,
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.error('Investors & Partnerships outbound follow-up send failed', {
        error: normalized.message,
      });
      throw normalized;
    }
  }
);
