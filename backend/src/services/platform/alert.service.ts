import { logger } from '../../utils/logger.js';

export type AlertTarget = 'agent' | 'sentry' | 'default';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertField {
  readonly label: string;
  readonly value: string;
}

export interface SlackAlertInput {
  readonly target?: AlertTarget;
  readonly severity?: AlertSeverity;
  readonly title: string;
  readonly summary: string;
  readonly fields?: readonly AlertField[];
  readonly linkText?: string;
  readonly linkUrl?: string;
}

function resolveSlackWebhook(target: AlertTarget): string {
  const generic = process.env['SLACK_ALERT_WEBHOOK_URL'] ?? '';
  const sentry = process.env['SLACK_SENTRY_WEBHOOK_URL'] ?? '';
  const agent = process.env['SLACK_AGENT_ALERT_WEBHOOK_URL'] ?? '';

  if (target === 'agent') return agent || generic || sentry;
  if (target === 'sentry') return sentry || generic || agent;
  return generic || agent || sentry;
}

function formatAlertBody(input: SlackAlertInput): string {
  const lines: string[] = [input.summary];

  for (const field of input.fields ?? []) {
    lines.push(`*${field.label}:* ${field.value}`);
  }

  if (input.linkText && input.linkUrl) {
    lines.push(`*Link:* <${input.linkUrl}|${input.linkText}>`);
  }

  return lines.join('\n');
}

export async function sendSlackAlert(input: SlackAlertInput): Promise<boolean> {
  const target = input.target ?? 'default';
  const severity = input.severity ?? 'error';
  const webhookUrl = resolveSlackWebhook(target);

  if (!webhookUrl) {
    logger.warn('Slack alert skipped: webhook URL not configured', {
      target,
      title: input.title,
    });
    return false;
  }

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severity.toUpperCase()}: ${input.title}`,
          emoji: false,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: formatAlertBody(input),
        },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('Slack alert delivery failed', {
        target,
        title: input.title,
        status: response.status,
        body,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Slack alert delivery failed', {
      target,
      title: input.title,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
