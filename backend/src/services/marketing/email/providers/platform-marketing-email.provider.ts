import { sendPlatformEmail } from '../../../communications/platform-email.service.js';
import type {
  MarketingEmailProvider,
  MarketingEmailSendInput,
  MarketingEmailSendResult,
} from './marketing-email-provider.types.js';

export class PlatformMarketingEmailProvider implements MarketingEmailProvider {
  readonly key = 'platform_smtp' as const;

  async send(input: MarketingEmailSendInput): Promise<MarketingEmailSendResult> {
    await sendPlatformEmail(input.to, input.subject, input.html, input.replyTo);

    return {
      provider: this.key,
      accepted: true,
    };
  }
}
