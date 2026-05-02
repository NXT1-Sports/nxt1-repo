import { describe, expect, it } from 'vitest';

import { buildTrackedEmailHtml } from '../connected-mail.service.js';

describe('buildTrackedEmailHtml', () => {
  it('rewrites click links and open pixel with recipientEmailHash only', () => {
    process.env['BACKEND_URL'] = 'https://api.nxt1sports.com';

    const html = buildTrackedEmailHtml(
      '<p>Profile</p><a href="https://example.com/profile">View</a>',
      {
        userId: 'user_123',
        to: 'Coach.One@College.edu',
        trackingId: 'track_abc',
      }
    );

    expect(html).toContain('/api/v1/analytics/track/click?');
    expect(html).toContain('/api/v1/analytics/track/open?');
    expect(html).toContain('recipientEmailHash=');
    expect(html).not.toContain('recipientEmail=');
  });

  it('renders markdown-like content into structured email html before tracking', () => {
    process.env['BACKEND_URL'] = 'https://api.nxt1sports.com';

    const html = buildTrackedEmailHtml(
      '# Spring Update\n\nHi Coach,\n\n- New verified 40 time\n- Updated transcript\n\nSee [my profile](https://example.com/profile)',
      {
        userId: 'user_789',
        to: 'coach@example.com',
        trackingId: 'track_markdown',
      }
    );

    expect(html).toContain('<h1');
    expect(html).toContain('Spring Update</h1>');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('New verified 40 time');
    expect(html).toContain('Updated transcript');
    expect(html).toContain('/api/v1/analytics/track/click?');
    expect(html).not.toContain('[my profile](');
  });

  it('does not rewrite non-http(s) links', () => {
    process.env['BACKEND_URL'] = 'https://api.nxt1sports.com';

    const html = buildTrackedEmailHtml('<a href="mailto:test@example.com">Email</a>', {
      userId: 'user_456',
      to: 'coach@example.com',
      trackingId: 'track_xyz',
    });

    expect(html).toContain('href="mailto:test@example.com"');
    expect(html).not.toContain('/api/v1/analytics/track/click?destination=mailto');
  });
});
