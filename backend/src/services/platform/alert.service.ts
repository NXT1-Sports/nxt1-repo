import type { RuntimeEnvironment } from '../../config/runtime-environment.js';
import { logger } from '../../utils/logger.js';

export type AlertTarget =
  | 'agent'
  | 'sentry'
  | 'sales'
  | 'signup_athlete'
  | 'signup_team'
  | 'default';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertField {
  readonly label: string;
  readonly value: string;
}

export interface SlackAlertInput {
  readonly target?: AlertTarget;
  readonly environment?: RuntimeEnvironment;
  readonly severity?: AlertSeverity;
  readonly title: string;
  readonly summary: string;
  readonly fields?: readonly AlertField[];
  readonly linkText?: string;
  readonly linkUrl?: string;
}

type WebhookResolutionSource = 'target-specific' | 'default-fallback';

const SHARED_SIGNUP_WEBHOOK_KEYS = {
  signup_athlete: ['SLACK_NEW_ATHLETES_WEBHOOK_URL', 'STAGING_SLACK_NEW_ATHLETES_WEBHOOK_URL'],
  signup_team: ['SLACK_NEW_TEAMS_WEBHOOK_URL', 'STAGING_SLACK_NEW_TEAMS_WEBHOOK_URL'],
} as const;

interface ResolvedWebhook {
  readonly url: string;
  readonly envVar: string | null;
  readonly source: WebhookResolutionSource;
}

function resolveWebhookFromEnvKeys(envKeys: readonly string[]): {
  readonly url: string;
  readonly envVar: string | null;
} {
  for (const envKey of envKeys) {
    const candidate = process.env[envKey]?.trim() ?? '';
    if (candidate) {
      return { url: candidate, envVar: envKey };
    }
  }

  return { url: '', envVar: null };
}

function resolveTargetWebhook(
  target: AlertTarget,
  environment: RuntimeEnvironment = 'production'
): ResolvedWebhook {
  if (target === 'signup_athlete' || target === 'signup_team') {
    const signupWebhook = resolveWebhookFromEnvKeys(SHARED_SIGNUP_WEBHOOK_KEYS[target]);
    if (signupWebhook.url) {
      return {
        url: signupWebhook.url,
        envVar: signupWebhook.envVar,
        source: 'target-specific',
      };
    }

    const fallback = resolveDefaultFallbackWebhook(environment);
    return {
      url: fallback.url,
      envVar: fallback.envVar,
      source: 'default-fallback',
    };
  }

  const targetEnvKeys =
    environment === 'staging'
      ? ({
          agent: ['STAGING_SLACK_AGENT_ALERT_WEBHOOK_URL', 'SLACK_AGENT_ALERT_WEBHOOK_URL'],
          sales: ['STAGING_SLACK_SALES_ALERT_WEBHOOK_URL', 'SLACK_SALES_ALERT_WEBHOOK_URL'],
          sentry: ['STAGING_SLACK_SENTRY_ALERT_WEBHOOK_URL', 'SLACK_SENTRY_ALERT_WEBHOOK_URL'],
          default: ['STAGING_SLACK_ALERT_WEBHOOK_URL', 'SLACK_ALERT_WEBHOOK_URL'],
        } as const)
      : ({
          agent: ['SLACK_AGENT_ALERT_WEBHOOK_URL'],
          sales: ['SLACK_SALES_ALERT_WEBHOOK_URL'],
          sentry: ['SLACK_SENTRY_ALERT_WEBHOOK_URL'],
          default: ['SLACK_ALERT_WEBHOOK_URL'],
        } as const);

  const specific = resolveWebhookFromEnvKeys(targetEnvKeys[target]);
  if (specific.url) {
    return {
      url: specific.url,
      envVar: specific.envVar,
      source: 'target-specific',
    };
  }

  const fallback = resolveWebhookFromEnvKeys(targetEnvKeys.default);
  return {
    url: fallback.url,
    envVar: fallback.envVar,
    source: 'default-fallback',
  };
}

function resolveDefaultFallbackWebhook(environment: RuntimeEnvironment): ResolvedWebhook {
  const fallbackKeys =
    environment === 'staging'
      ? (['STAGING_SLACK_ALERT_WEBHOOK_URL', 'SLACK_ALERT_WEBHOOK_URL'] as const)
      : (['SLACK_ALERT_WEBHOOK_URL'] as const);
  const fallback = resolveWebhookFromEnvKeys(fallbackKeys);

  return {
    url: fallback.url,
    envVar: fallback.envVar,
    source: 'default-fallback',
  };
}

function resolveAgentFallbackWebhook(environment: RuntimeEnvironment): ResolvedWebhook {
  const fallbackKeys =
    environment === 'staging'
      ? (['STAGING_SLACK_AGENT_ALERT_WEBHOOK_URL', 'SLACK_AGENT_ALERT_WEBHOOK_URL'] as const)
      : (['SLACK_AGENT_ALERT_WEBHOOK_URL'] as const);
  const fallback = resolveWebhookFromEnvKeys(fallbackKeys);

  return {
    url: fallback.url,
    envVar: fallback.envVar,
    source: 'default-fallback',
  };
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
  const environment = input.environment ?? 'production';
  const severity = input.severity ?? 'error';
  const resolvedWebhook = resolveTargetWebhook(target, environment);
  const webhookUrl = resolvedWebhook.url;

  if (!webhookUrl) {
    logger.warn('Slack alert skipped: webhook URL not configured', {
      target,
      environment,
      title: input.title,
    });
  }

  if (webhookUrl && target !== 'default' && resolvedWebhook.source === 'default-fallback') {
    logger.warn('Slack alert target webhook missing; falling back to default webhook', {
      target,
      environment,
      title: input.title,
      fallbackEnvVar: resolvedWebhook.envVar,
    });
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

  const postSlackWebhook = async (
    url: string,
    resolvedEnvVar: string | null,
    deliveryAttempt: 'primary' | 'default-fallback' | 'agent-fallback'
  ): Promise<boolean> => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Slack alert delivery failed', {
          target,
          environment,
          title: input.title,
          deliveryAttempt,
          envVar: resolvedEnvVar,
          status: response.status,
          body,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Slack alert delivery failed', {
        target,
        environment,
        title: input.title,
        deliveryAttempt,
        envVar: resolvedEnvVar,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  const attemptedUrls = new Set<string>();
  if (webhookUrl) {
    attemptedUrls.add(webhookUrl);
    if (await postSlackWebhook(webhookUrl, resolvedWebhook.envVar, 'primary')) {
      return true;
    }
  }

  const fallbackCandidates: Array<{
    readonly resolvedWebhook: ResolvedWebhook;
    readonly deliveryAttempt: 'default-fallback' | 'agent-fallback';
  }> = [];

  if (target !== 'default' && resolvedWebhook.source === 'target-specific') {
    fallbackCandidates.push({
      resolvedWebhook: resolveDefaultFallbackWebhook(environment),
      deliveryAttempt: 'default-fallback',
    });
  }

  if (target !== 'agent') {
    fallbackCandidates.push({
      resolvedWebhook: resolveAgentFallbackWebhook(environment),
      deliveryAttempt: 'agent-fallback',
    });
  }

  for (const fallbackCandidate of fallbackCandidates) {
    const fallbackWebhookUrl = fallbackCandidate.resolvedWebhook.url;
    if (!fallbackWebhookUrl || attemptedUrls.has(fallbackWebhookUrl)) {
      continue;
    }

    attemptedUrls.add(fallbackWebhookUrl);
    logger.warn('Retrying Slack alert with fallback webhook', {
      target,
      environment,
      title: input.title,
      deliveryAttempt: fallbackCandidate.deliveryAttempt,
      fallbackEnvVar: fallbackCandidate.resolvedWebhook.envVar,
    });

    if (
      await postSlackWebhook(
        fallbackWebhookUrl,
        fallbackCandidate.resolvedWebhook.envVar,
        fallbackCandidate.deliveryAttempt
      )
    ) {
      return true;
    }
  }

  return false;
}
