import type {
  MarketingEmailProvider,
  MarketingEmailSendInput,
  MarketingEmailSendResult,
} from './marketing-email-provider.types.js';

interface BrevoSendEmailResponse {
  readonly messageId?: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function getBrevoBaseUrl(): string {
  return process.env['BREVO_API_BASE_URL']?.trim() || 'https://api.brevo.com/v3';
}

export class BrevoMarketingEmailProvider implements MarketingEmailProvider {
  readonly key = 'brevo' as const;

  async send(input: MarketingEmailSendInput): Promise<MarketingEmailSendResult> {
    const apiKey = getRequiredEnv('BREVO_API_KEY');
    const senderEmail = process.env['BREVO_SENDER_EMAIL']?.trim() || 'no-reply@nxt1sports.com';
    const senderName = process.env['BREVO_SENDER_NAME']?.trim() || 'NXT1 Sports';

    const payload = {
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [{ email: input.to }],
      replyTo: input.replyTo ? { email: input.replyTo } : undefined,
      subject: input.subject,
      htmlContent: input.html,
      headers: {
        'X-Campaign-Key': input.campaignKey,
        ...(input.userId ? { 'X-User-Id': input.userId } : {}),
      },
      tags: ['marketing', input.campaignKey],
    };

    const response = await fetch(`${getBrevoBaseUrl()}/smtp/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let parsed: BrevoSendEmailResponse | null = null;
    try {
      parsed = (await response.json()) as BrevoSendEmailResponse;
    } catch {
      // JSON parsing failed, parsed remains null
    }

    if (!response.ok) {
      const details = parsed ? JSON.stringify(parsed) : `HTTP ${response.status}`;
      throw new Error(`Brevo send failed: ${details}`);
    }

    return {
      provider: this.key,
      accepted: true,
      providerMessageId: parsed?.messageId,
    };
  }
}
