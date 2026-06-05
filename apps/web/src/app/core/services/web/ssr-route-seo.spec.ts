import { describe, expect, it } from 'vitest';
import { applyServerRouteSeo, resolveServerRouteSeo } from './ssr-route-seo';

const DEFAULT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>NXT1 Sports - The Sports Intelligence Platform</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="Default title" />
    <meta property="og:description" content="Default description" />
    <meta property="og:url" content="https://nxt1sports.com/" />
    <meta name="twitter:title" content="Default title" />
    <meta name="twitter:description" content="Default description" />
    <meta name="robots" content="index, follow" />
    <meta name="googlebot" content="index, follow" />
  </head>
  <body></body>
</html>`;

describe('ssr-route-seo', () => {
  it('resolves public route metadata without query-string canonicals', () => {
    const metadata = resolveServerRouteSeo(
      '/help-center',
      'https://nxt1sports.com/help-center?q=faq'
    );

    expect(metadata).toMatchObject({
      title: 'Help Center | NXT1 Sports',
      canonicalUrl: 'https://nxt1sports.com/help-center',
    });
  });

  it('marks exact own-profile route as noindex', () => {
    const metadata = resolveServerRouteSeo('/profile', 'https://nxt1sports.com/profile');

    expect(metadata?.robots).toContain('noindex');
    expect(metadata?.googlebot).toContain('noindex');
  });

  it('keeps public profile canonicals self-referential', () => {
    const metadata = resolveServerRouteSeo(
      '/profile/football/test-athlete/123',
      'https://nxt1sports.com/profile/football/test-athlete/123?ref=abc'
    );

    expect(metadata).toMatchObject({
      canonicalUrl: 'https://nxt1sports.com/profile/football/test-athlete/123',
    });
    expect(metadata?.robots).toContain('index');
  });

  it('rewrites head tags with route metadata', () => {
    const metadata = resolveServerRouteSeo('/terms', 'https://nxt1sports.com/terms');
    const html = applyServerRouteSeo(DEFAULT_HTML, metadata);

    expect(html).toContain('<title>Terms of Service | NXT1 Sports</title>');
    expect(html).toContain(
      'name="description" content="Read the Terms of Service for NXT1 Sports. Understand your rights and responsibilities when using our platform."'
    );
    expect(html).toContain('rel="canonical" href="https://nxt1sports.com/terms"');
    expect(html).toContain('property="og:url" content="https://nxt1sports.com/terms"');
  });
});
