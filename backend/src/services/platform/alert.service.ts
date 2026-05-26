import { logger } from '../../utils/logger.js';

export type AlertTarget = 'agent' | 'sentry' | 'signup_athlete' | 'signup_team' | 'default';
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

function resolveSlackWebhook(): string {
  return process.env['SLACK_ALERT_WEBHOOK_URL']?.trim() ?? '';
}

function resolveTargetWebhook(target: AlertTarget): string {
  const specificWebhook =
    (
      {
        agent: process.env['SLACK_AGENT_ALERT_WEBHOOK_URL'],
        sentry: process.env['SLACK_SENTRY_ALERT_WEBHOOK_URL'],
        signup_athlete: process.env['SLACK_NEW_ATHLETES_WEBHOOK_URL'],
        signup_team: process.env['SLACK_NEW_TEAMS_WEBHOOK_URL'],
        default: process.env['SLACK_ALERT_WEBHOOK_URL'],
      } as const
    )[target] ?? '';

  const resolvedSpecificWebhook = specificWebhook.trim();

  if (resolvedSpecificWebhook) {
    return resolvedSpecificWebhook;
  }

  if (target === 'signup_athlete' || target === 'signup_team') {
    return '';
  }

  return resolveSlackWebhook();
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
  const webhookUrl = resolveTargetWebhook(target);

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
