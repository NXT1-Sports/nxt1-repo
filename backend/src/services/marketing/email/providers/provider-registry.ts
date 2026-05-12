import type { MarketingEmailProvider } from './marketing-email-provider.types.js';
import { PlatformMarketingEmailProvider } from './platform-marketing-email.provider.js';
import { BrevoMarketingEmailProvider } from './brevo-marketing-email.provider.js';

let cachedProvider: MarketingEmailProvider | null = null;

function normalizeProviderKey(value: string | undefined): 'platform_smtp' | 'brevo' {
  if (!value) return 'platform_smtp';

  const normalized = value.trim().toLowerCase();
  if (normalized === 'platform_smtp' || normalized === 'platform' || normalized === 'smtp') {
    return 'platform_smtp';
  }

  if (normalized === 'brevo') {
    return 'brevo';
  }

  throw new Error(
    `Unsupported MARKETING_EMAIL_PROVIDER: ${value}. Supported values: platform_smtp, brevo.`
  );
}

export function getMarketingEmailProvider(): MarketingEmailProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const key = normalizeProviderKey(process.env['MARKETING_EMAIL_PROVIDER']);

  cachedProvider =
    key === 'brevo' ? new BrevoMarketingEmailProvider() : new PlatformMarketingEmailProvider();
  return cachedProvider;
}
