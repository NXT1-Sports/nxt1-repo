export interface MarketingEmailSendInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
  readonly userId?: string;
  readonly replyTo?: string;
}

export interface MarketingEmailSendResult {
  readonly provider: 'platform_smtp' | 'brevo';
  readonly accepted: boolean;
  readonly providerMessageId?: string;
}

export interface MarketingEmailProvider {
  readonly key: 'platform_smtp' | 'brevo';
  send(input: MarketingEmailSendInput): Promise<MarketingEmailSendResult>;
}
