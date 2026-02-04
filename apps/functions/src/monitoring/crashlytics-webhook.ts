/**
 * @fileoverview Crashlytics Webhook Handler
 * @module @nxt1/functions/monitoring
 * @version 1.0.0
 *
 * Receives Firebase Crashlytics alerts and forwards to monitoring infrastructure:
 * - Slack alerts with error context
 * - n8n workflow for AI-powered auto-fixing
 * - PagerDuty for critical production errors
 *
 * Alert Types:
 * - New Fatal Error: First occurrence of a crash
 * - Error Spike: Sudden increase in error rate
 * - Regression: Previously resolved error reappears
 * - ANR (Android): Application Not Responding
 *
 * @author NXT1 Engineering
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import axios from 'axios';

// ============================================
// TYPES
// ============================================

interface CrashlyticsAlert {
  /** Alert type from Firebase Crashlytics */
  alertType: 'newFatalIssue' | 'newNonFatalIssue' | 'regression' | 'anr' | 'velocity';
  /** Firebase project ID */
  projectId: string;
  /** Firebase app details */
  app: {
    bundleId: string;
    platform: 'ANDROID' | 'IOS' | 'UNITY';
    displayName: string;
  };
  /** Issue details */
  issue: {
    id: string;
    title: string;
    subtitle: string;
    appVersion: string;
    /** Number of users affected */
    impactedUsers: number;
    /** Number of crash occurrences */
    crashCount: number;
    /** First occurrence timestamp */
    firstOccurrence: string;
    /** Last occurrence timestamp */
    lastOccurrence: string;
    /** Crashlytics console URL */
    url: string;
  };
  /** Stack trace (first 100 lines) */
  stackTrace?: string;
}

interface SlackMessage {
  channel: string;
  text: string;
  attachments?: Array<{
    color: string;
    blocks: Array<Record<string, unknown>>;
  }>;
}

interface N8nWebhookPayload {
  event_type: 'crashlytics-alert';
  alert_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  platform: string;
  app_version: string;
  impacted_users: number;
  crash_count: number;
  issue_title: string;
  issue_url: string;
  stack_trace?: string;
  timestamp: string;
  environment: 'production' | 'staging';
}

// ============================================
// CONFIGURATION
// ============================================

/** Slack webhook URL from environment or config */
const SLACK_WEBHOOK_URL = process.env['SLACK_WEBHOOK_URL'] || '';
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] || '';
const N8N_WEBHOOK_URL = process.env['N8N_WEBHOOK_URL'] || '';

/** Severity thresholds */
const SEVERITY_THRESHOLDS = {
  CRITICAL_USER_COUNT: 100, // 100+ users affected = critical
  HIGH_USER_COUNT: 10, // 10+ users = high
  CRITICAL_CRASH_COUNT: 50, // 50+ crashes = critical
  HIGH_CRASH_COUNT: 10, // 10+ crashes = high
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine severity level based on impact
 */
function calculateSeverity(alert: CrashlyticsAlert): 'critical' | 'high' | 'medium' | 'low' {
  const { impactedUsers, crashCount } = alert.issue;
  const { alertType } = alert;

  // Fatal errors + high impact = critical
  if (
    alertType === 'newFatalIssue' &&
    (impactedUsers >= SEVERITY_THRESHOLDS.CRITICAL_USER_COUNT ||
      crashCount >= SEVERITY_THRESHOLDS.CRITICAL_CRASH_COUNT)
  ) {
    return 'critical';
  }

  // ANR always high (blocks UI)
  if (alertType === 'anr') {
    return 'high';
  }

  // Velocity spike + high impact
  if (
    alertType === 'velocity' &&
    (impactedUsers >= SEVERITY_THRESHOLDS.HIGH_USER_COUNT ||
      crashCount >= SEVERITY_THRESHOLDS.HIGH_CRASH_COUNT)
  ) {
    return 'high';
  }

  // Regression or moderate impact
  if (alertType === 'regression' || impactedUsers >= SEVERITY_THRESHOLDS.HIGH_USER_COUNT) {
    return 'medium';
  }

  return 'low';
}

/**
 * Get Slack color based on severity
 */
function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: '#dc3545', // Red
    high: '#fd7e14', // Orange
    medium: '#ffc107', // Yellow
    low: '#6c757d', // Gray
  };
  return colors[severity] || colors['low'];
}

/**
 * Get emoji based on alert type
 */
function getAlertEmoji(alertType: string): string {
  const emojis: Record<string, string> = {
    newFatalIssue: '💥',
    newNonFatalIssue: '⚠️',
    regression: '🔄',
    anr: '⏱️',
    velocity: '📈',
  };
  return emojis[alertType] || '🐛';
}

/**
 * Format stack trace for readability (truncate if needed)
 */
function formatStackTrace(stackTrace?: string): string {
  if (!stackTrace) return 'No stack trace available';

  const lines = stackTrace.split('\n').slice(0, 15); // First 15 lines
  const formatted = lines.join('\n');

  return formatted.length > 1500 ? formatted.slice(0, 1500) + '\n...(truncated)' : formatted;
}

/**
 * Detect environment from bundle ID
 */
function detectEnvironment(bundleId: string): 'production' | 'staging' {
  return bundleId.includes('staging') || bundleId.includes('dev') ? 'staging' : 'production';
}

/**
 * Send alert to Slack
 */
async function sendSlackAlert(alert: CrashlyticsAlert, severity: string): Promise<void> {
  if (!SLACK_BOT_TOKEN && !SLACK_WEBHOOK_URL) {
    logger.warn('Slack credentials not configured, skipping Slack alert');
    return;
  }

  const emoji = getAlertEmoji(alert.alertType);
  const color = getSeverityColor(severity);
  const environment = detectEnvironment(alert.app.bundleId);
  const isProduction = environment === 'production';

  const message: SlackMessage = {
    channel: isProduction ? 'urgent-alerts' : 'staging-alerts',
    text: `${emoji} ${severity.toUpperCase()}: ${alert.issue.title}`,
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} ${severity.toUpperCase()}: Crashlytics Alert`,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Environment:*\n${environment}`,
              },
              {
                type: 'mrkdwn',
                text: `*Platform:*\n${alert.app.platform}`,
              },
              {
                type: 'mrkdwn',
                text: `*App Version:*\n${alert.issue.appVersion}`,
              },
              {
                type: 'mrkdwn',
                text: `*Alert Type:*\n${alert.alertType}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Issue:*\n${alert.issue.title}\n${alert.issue.subtitle}`,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Impacted Users:*\n${alert.issue.impactedUsers.toLocaleString()}`,
              },
              {
                type: 'mrkdwn',
                text: `*Crash Count:*\n${alert.issue.crashCount.toLocaleString()}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Stack Trace:*\n\`\`\`\n${formatStackTrace(alert.stackTrace)}\n\`\`\``,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🔍 View in Crashlytics',
                },
                url: alert.issue.url,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🤖 AI Analysis',
                },
                style: 'primary',
                action_id: 'ai_analyze_crash',
                value: alert.issue.id,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🔧 Create Fix PR',
                },
                style: isProduction ? 'danger' : undefined,
                action_id: 'create_fix_pr',
                value: alert.issue.id,
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    if (SLACK_BOT_TOKEN) {
      // Use Slack Bot API for richer formatting
      await axios.post('https://slack.com/api/chat.postMessage', message, {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
    } else {
      // Fallback to webhook
      await axios.post(SLACK_WEBHOOK_URL, message);
    }

    logger.info('Slack alert sent', {
      issueId: alert.issue.id,
      severity,
      channel: message.channel,
    });
  } catch (error) {
    logger.error('Failed to send Slack alert', {
      error: error instanceof Error ? error.message : 'Unknown error',
      issueId: alert.issue.id,
    });
  }
}

/**
 * Forward alert to n8n for AI processing
 */
async function forwardToN8n(alert: CrashlyticsAlert, severity: string): Promise<void> {
  if (!N8N_WEBHOOK_URL) {
    logger.warn('n8n webhook URL not configured, skipping n8n forwarding');
    return;
  }

  const payload: N8nWebhookPayload = {
    event_type: 'crashlytics-alert',
    alert_type: alert.alertType,
    severity: severity as 'critical' | 'high' | 'medium' | 'low',
    platform: alert.app.platform,
    app_version: alert.issue.appVersion,
    impacted_users: alert.issue.impactedUsers,
    crash_count: alert.issue.crashCount,
    issue_title: alert.issue.title,
    issue_url: alert.issue.url,
    stack_trace: alert.stackTrace,
    timestamp: new Date().toISOString(),
    environment: detectEnvironment(alert.app.bundleId),
  };

  try {
    await axios.post(N8N_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });

    logger.info('Alert forwarded to n8n', {
      issueId: alert.issue.id,
      severity,
    });
  } catch (error) {
    logger.error('Failed to forward to n8n', {
      error: error instanceof Error ? error.message : 'Unknown error',
      issueId: alert.issue.id,
    });
  }
}

/**
 * Log alert to Firestore for tracking
 */
async function logAlertToFirestore(alert: CrashlyticsAlert, severity: string): Promise<void> {
  const db = admin.firestore();
  const alertDoc = {
    issueId: alert.issue.id,
    alertType: alert.alertType,
    severity,
    platform: alert.app.platform,
    appVersion: alert.issue.appVersion,
    impactedUsers: alert.issue.impactedUsers,
    crashCount: alert.issue.crashCount,
    title: alert.issue.title,
    url: alert.issue.url,
    environment: detectEnvironment(alert.app.bundleId),
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    processed: false,
  };

  try {
    await db.collection('crashlytics_alerts').add(alertDoc);
    logger.info('Alert logged to Firestore', { issueId: alert.issue.id });
  } catch (error) {
    logger.error('Failed to log to Firestore', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================
// CLOUD FUNCTION
// ============================================

/**
 * Crashlytics Webhook Handler
 *
 * Receives alerts from Firebase Crashlytics and orchestrates:
 * 1. Slack notification with interactive buttons
 * 2. n8n workflow trigger for AI analysis
 * 3. Firestore logging for audit trail
 *
 * Configure in Firebase Console:
 * Project Settings → Integrations → Crashlytics → Add Webhook
 * URL: https://us-central1-[PROJECT-ID].cloudfunctions.net/crashlyticsWebhook
 *
 * @example
 * ```bash
 * curl -X POST https://us-central1-nxt-1.cloudfunctions.net/crashlyticsWebhook \
 *   -H "Content-Type: application/json" \
 *   -d '{"alertType": "newFatalIssue", ...}'
 * ```
 */
export const crashlyticsWebhook = onRequest(
  {
    cors: ['https://firebase.google.com', 'https://console.firebase.google.com'],
    invoker: 'public',
    secrets: ['SLACK_BOT_TOKEN', 'N8N_WEBHOOK_URL'],
  },
  async (req, res) => {
    // Verify HTTP method
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const alert = req.body as CrashlyticsAlert;

      // Validate required fields
      if (!alert.alertType || !alert.issue?.id) {
        logger.warn('Invalid alert payload', { body: req.body });
        res.status(400).json({ error: 'Invalid alert payload' });
        return;
      }

      logger.info('Crashlytics alert received', {
        issueId: alert.issue.id,
        alertType: alert.alertType,
        platform: alert.app.platform,
        impactedUsers: alert.issue.impactedUsers,
      });

      // Calculate severity
      const severity = calculateSeverity(alert);

      // Process alert in parallel
      await Promise.allSettled([
        sendSlackAlert(alert, severity),
        forwardToN8n(alert, severity),
        logAlertToFirestore(alert, severity),
      ]);

      res.status(200).json({
        success: true,
        issueId: alert.issue.id,
        severity,
        message: 'Alert processed successfully',
      });
    } catch (error) {
      logger.error('Error processing Crashlytics alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);
