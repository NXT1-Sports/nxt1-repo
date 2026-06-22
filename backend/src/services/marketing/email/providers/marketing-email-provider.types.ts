export interface MarketingEmailSendInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly campaignKey: string;
  readonly campaignFamily?: string;
  readonly userId?: string;
  readonly replyTo?: string;
  readonly dispatchId?: string;
  readonly trackingId?: string;
  readonly recipientEmailHash?: string;
  readonly recipientDomain?: string | null;
}

export interface MarketingEmailSendResult {
  readonly provider: 'platform_smtp' | 'brevo';
  readonly accepted: boolean;
  readonly providerMessageId?: string;
  readonly dispatchId?: string;
  readonly trackingId?: string;
}

export interface MarketingEmailProvider {
  readonly key: 'platform_smtp' | 'brevo';
  send(input: MarketingEmailSendInput): Promise<MarketingEmailSendResult>;
}
