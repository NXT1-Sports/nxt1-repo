import { describe, expect, it } from 'vitest';
import {
  applyServerRouteSeo,
  buildNoindexRouteSeo,
  buildNotFoundRouteSeo,
  buildMissingProfileRouteSeo,
  buildServerProfileRouteSeo,
  isRetiredPulseArticleRoute,
  resolveServerRouteSeo,
} from './ssr-route-seo';

const DEFAULT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>NXT1 Sports - The Sports Intelligence Platform</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="Default title" />
    <meta property="og:description" content="Default description" />
    <link rel="alternate" hreflang="en-US" href="https://nxt1sports.com/" />
    <link rel="alternate" hreflang="x-default" href="https://nxt1sports.com/" />
    <meta property="og:url" content="https://nxt1sports.com/" />
    <meta property="og:image" content="https://nxt1sports.com/assets/shared/images/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:title" content="Default title" />
    <meta name="twitter:description" content="Default description" />
    <meta name="twitter:image" content="https://nxt1sports.com/assets/shared/images/og-image.jpg" />
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

  it('marks explore pulse routes as noindex', () => {
    const metadata = resolveServerRouteSeo(
      '/explore/pulse',
      'https://nxt1sports.com/explore/pulse?tab=latest'
    );

    expect(metadata?.canonicalUrl).toBe('https://nxt1sports.com/explore/pulse');
    expect(metadata?.robots).toContain('noindex');
  });

  it('builds a non-indexable 404 for missing profiles', () => {
    const metadata = buildMissingProfileRouteSeo('https://nxt1sports.com/profile/99999999999');

    expect(metadata).toMatchObject({
      title: 'Profile Not Found',
      canonicalUrl: 'https://nxt1sports.com/profile/99999999999',
      statusCode: 404,
    });
    expect(metadata.robots).toContain('noindex');
  });

  it('builds a non-indexable 404 for unknown routes', () => {
    const metadata = buildNotFoundRouteSeo('https://nxt1sports.com/does-not-exist');

    expect(metadata).toMatchObject({
      title: 'Page Not Found',
      canonicalUrl: 'https://nxt1sports.com/does-not-exist',
      statusCode: 404,
    });
    expect(metadata.robots).toContain('noindex');
  });

  it('builds a noindex canonical payload for known but non-indexable app routes', () => {
    const metadata = buildNoindexRouteSeo('https://nxt1sports.com/join/ABC123?ref=test');

    expect(metadata).toMatchObject({
      canonicalUrl: 'https://nxt1sports.com/join/ABC123',
    });
    expect(metadata.robots).toContain('noindex');
    expect(metadata.googlebot).toContain('noindex');
  });

  it('detects retired pulse article detail routes', () => {
    expect(isRetiredPulseArticleRoute('/pulse/abc123')).toBe(true);
    expect(isRetiredPulseArticleRoute('/explore/pulse/abc123')).toBe(true);
    expect(isRetiredPulseArticleRoute('/explore/pulse')).toBe(false);
    expect(isRetiredPulseArticleRoute('/agent-x')).toBe(false);
  });

  it('builds compact SSR titles for public athlete profiles', () => {
    const metadata = buildServerProfileRouteSeo({
      athleteName: 'Yadon Urbieta',
      position: 'quarterback',
      classYear: 2027,
      school: 'Brownsburg High School',
      sport: 'football',
      location: 'Brownsburg, IN',
      imageUrl: 'https://cdn.nxt1sports.com/yadon.jpg',
      firstName: 'Yadon',
      lastName: 'Urbieta',
      unicode: '59836990',
    });

    expect(metadata).toMatchObject({
      title: 'Yadon Urbieta | QB | Class of 2027 | NXT1 Sports',
      canonicalUrl: 'https://nxt1sports.com/profile/football/yadon-urbieta/59836990',
      image: 'https://cdn.nxt1sports.com/yadon.jpg',
      openGraphTitle: 'Yadon Urbieta',
      openGraphType: 'profile',
      twitterImage: 'https://cdn.nxt1sports.com/yadon.jpg',
      profileFirstName: 'Yadon',
      profileLastName: 'Urbieta',
    });
    expect(metadata?.description).toContain('Yadon Urbieta is a 2027 quarterback');
    expect(metadata?.description).toContain(
      "Watch highlights, view stats, and explore this athlete's profile on NXT1 Sports."
    );
  });

  it('rewrites social image and profile tags for public athlete profiles', () => {
    const metadata = buildServerProfileRouteSeo({
      athleteName: 'Yadon Urbieta',
      position: 'quarterback',
      classYear: 2027,
      school: 'Brownsburg High School',
      sport: 'football',
      location: 'Brownsburg, IN',
      imageUrl: 'https://cdn.nxt1sports.com/yadon.jpg',
      firstName: 'Yadon',
      lastName: 'Urbieta',
      username: '59836990',
      unicode: '59836990',
    });

    const html = applyServerRouteSeo(DEFAULT_HTML, metadata);

    expect(html).toContain('property="og:type" content="profile"');
    expect(html).toContain('property="og:title" content="Yadon Urbieta"');
    expect(html).toContain('property="og:image" content="https://cdn.nxt1sports.com/yadon.jpg"');
    expect(html).toContain('name="twitter:image" content="https://cdn.nxt1sports.com/yadon.jpg"');
    expect(html).toContain('property="og:profile:first_name" content="Yadon"');
    expect(html).toContain('property="og:profile:last_name" content="Urbieta"');
    expect(html).toContain('property="og:profile:username" content="59836990"');
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
    expect(html).toContain('rel="alternate" hreflang="en-US" href="https://nxt1sports.com/terms"');
    expect(html).toContain(
      'rel="alternate" hreflang="x-default" href="https://nxt1sports.com/terms"'
    );
  });
});
