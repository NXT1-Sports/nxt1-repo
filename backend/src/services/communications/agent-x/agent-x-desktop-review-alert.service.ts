import { logger } from '../../../utils/logger.js';
import { sendSlackAlert, type AlertField } from '../../platform/alert.service.js';

type ReviewAlertEnvironment = 'staging' | 'production';

const MAX_SLACK_REVIEW_CHARS = 1200;
const MAX_USER_AGENT_CHARS = 180;

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  if (maxChars <= 3) {
    return trimmed.slice(0, maxChars);
  }

  return `${trimmed.slice(0, maxChars - 3)}...`;
}

export async function sendAgentXDesktopReviewAlert(input: {
  readonly environment: ReviewAlertEnvironment;
  readonly userId: string;
  readonly email?: string | null;
  readonly displayName?: string | null;
  readonly organizationName?: string | null;
  readonly teamName?: string | null;
  readonly primarySport?: string | null;
  readonly location?: string | null;
  readonly rating: number;
  readonly promptVersion: string;
  readonly surface: 'desktop_web';
  readonly pageUrl?: string | null;
  readonly reviewText?: string | null;
  readonly userAgent?: string | null;
}): Promise<boolean> {
  const fields: AlertField[] = [
    { label: 'Rating', value: `${input.rating}/5` },
    {
      label: 'Review',
      value: input.reviewText?.trim()
        ? truncate(input.reviewText, MAX_SLACK_REVIEW_CHARS)
        : 'No written feedback provided.',
    },
    { label: 'Surface', value: input.surface },
    { label: 'Prompt Version', value: input.promptVersion },
    { label: 'User ID', value: input.userId },
    { label: 'Environment', value: input.environment },
  ];

  if (input.displayName?.trim()) {
    fields.splice(1, 0, { label: 'Name', value: input.displayName.trim() });
  }

  if (input.email?.trim()) {
    fields.splice(2, 0, { label: 'Email', value: input.email.trim() });
  }

  if (input.organizationName?.trim()) {
    fields.splice(3, 0, { label: 'Organization', value: input.organizationName.trim() });
  }

  if (input.teamName?.trim()) {
    fields.splice(4, 0, { label: 'Team', value: input.teamName.trim() });
  }

  if (input.primarySport?.trim()) {
    fields.splice(5, 0, { label: 'Sport', value: input.primarySport.trim() });
  }

  if (input.location?.trim()) {
    fields.splice(6, 0, { label: 'Location', value: input.location.trim() });
  }

  if (input.pageUrl?.trim()) {
    fields.push({ label: 'Page', value: truncate(input.pageUrl, 240) });
  }

  if (input.userAgent?.trim()) {
    fields.push({ label: 'User Agent', value: truncate(input.userAgent, MAX_USER_AGENT_CHARS) });
  }

  try {
    const delivered = await sendSlackAlert({
      target: 'sales',
      environment: input.environment,
      severity: 'info',
      title: 'Agent X Desktop Review Received',
      summary: 'A desktop Agent X user submitted in-app product feedback.',
      fields,
    });

    if (!delivered) {
      logger.warn('[AgentXDesktopReviewAlert] Slack delivery did not succeed', {
        userId: input.userId,
        rating: input.rating,
        environment: input.environment,
        promptVersion: input.promptVersion,
        reviewLength: input.reviewText?.trim().length ?? 0,
      });
    }

    return delivered;
  } catch (error) {
    logger.error('[AgentXDesktopReviewAlert] Failed to dispatch review alert', {
      userId: input.userId,
      rating: input.rating,
      environment: input.environment,
      promptVersion: input.promptVersion,
      reviewLength: input.reviewText?.trim().length ?? 0,
      error,
    });
    return false;
  }
}
