import { logger } from 'firebase-functions/v2';

function readFirebaseProjectId(): string {
  const gcloudProject = process.env['GCLOUD_PROJECT']?.trim();
  if (gcloudProject) return gcloudProject;

  const firebaseConfig = process.env['FIREBASE_CONFIG']?.trim();
  if (!firebaseConfig) return '';

  try {
    const parsed = JSON.parse(firebaseConfig) as { projectId?: unknown };
    return typeof parsed.projectId === 'string' ? parsed.projectId.trim() : '';
  } catch {
    return '';
  }
}

function isStagingFunctionsProject(): boolean {
  return readFirebaseProjectId().toLowerCase().includes('staging');
}

type WebhookResolutionSource = 'target-specific' | 'default-fallback';

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

function resolveDefaultFallbackWebhook(): ResolvedWebhook {
  const fallbackKeys = isStagingFunctionsProject()
    ? (['STAGING_SLACK_ALERT_WEBHOOK_URL', 'SLACK_ALERT_WEBHOOK_URL'] as const)
    : (['SLACK_ALERT_WEBHOOK_URL'] as const);
  const fallback = resolveWebhookFromEnvKeys(fallbackKeys);

  return {
    url: fallback.url,
    envVar: fallback.envVar,
    source: 'default-fallback',
  };
}

function resolveAgentSlackWebhook(): ResolvedWebhook {
  const targetKeys = isStagingFunctionsProject()
    ? (['STAGING_SLACK_AGENT_ALERT_WEBHOOK_URL', 'SLACK_AGENT_ALERT_WEBHOOK_URL'] as const)
    : (['SLACK_AGENT_ALERT_WEBHOOK_URL'] as const);
  const specific = resolveWebhookFromEnvKeys(targetKeys);
  if (specific.url) {
    return {
      url: specific.url,
      envVar: specific.envVar,
      source: 'target-specific',
    };
  }

  return resolveDefaultFallbackWebhook();
}

interface ScheduledSlackAlertInput {
  readonly title: string;
  readonly summary: string;
  readonly route: string;
  readonly error: string;
}

export async function sendScheduledSlackAlert(input: ScheduledSlackAlertInput): Promise<void> {
  const resolvedWebhook = resolveAgentSlackWebhook();
  if (!resolvedWebhook.url) {
    logger.warn('Scheduled Slack alert skipped: webhook URL not configured', {
      title: input.title,
      route: input.route,
    });
    return;
  }

  const environment = isStagingFunctionsProject() ? 'staging' : 'production';
  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `ERROR: ${input.title}`,
          emoji: false,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            input.summary,
            `*Route:* ${input.route}`,
            `*Environment:* ${environment}`,
            `*Error:* ${input.error}`,
          ].join('\n'),
        },
      },
    ],
  };

  const postSlackWebhook = async (
    webhookUrl: string,
    envVar: string | null,
    deliveryAttempt: 'primary' | 'default-fallback'
  ): Promise<boolean> => {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Scheduled Slack alert delivery failed', {
          title: input.title,
          route: input.route,
          deliveryAttempt,
          envVar,
          status: response.status,
          body,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Scheduled Slack alert delivery failed', {
        title: input.title,
        route: input.route,
        deliveryAttempt,
        envVar,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  if (await postSlackWebhook(resolvedWebhook.url, resolvedWebhook.envVar, 'primary')) {
    return;
  }

  if (resolvedWebhook.source === 'target-specific') {
    const fallback = resolveDefaultFallbackWebhook();
    if (fallback.url && fallback.url !== resolvedWebhook.url) {
      logger.warn('Retrying scheduled Slack alert with fallback webhook', {
        title: input.title,
        route: input.route,
        fallbackEnvVar: fallback.envVar,
      });
      await postSlackWebhook(fallback.url, fallback.envVar, 'default-fallback');
    }
  }
}
