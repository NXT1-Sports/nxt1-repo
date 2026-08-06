import { describe, expect, it } from 'vitest';

import { buildFoundation50CoachesPreview } from '../foundation-50-coaches-email.service.js';

describe('buildFoundation50CoachesPreview', () => {
  it('includes UTM attribution on all Foundation 50 CTA links', () => {
    const preview = buildFoundation50CoachesPreview({
      email: 'coach@example.com',
      firstName: 'Ray',
      environment: 'production',
    });

    expect(preview.campaignKey).toBe('foundation_50_coaches');
    expect(preview.subject).toBe('The 50 Coaches Building a Cleaner System This Season');
    expect(preview.html).toContain(
      'https://calendar.app.google/V2jQNjQzy3QEVhzu9?utm_source=email&utm_medium=outbound&utm_campaign=foundation_50_coaches&utm_content=schedule_founder_meeting&utm_term=initial'
    );
    expect(preview.html).toContain(
      'https://nxt1sports.com/?utm_source=email&utm_medium=outbound&utm_campaign=foundation_50_coaches&utm_content=visit_nxt1_site&utm_term=initial'
    );
  });
});
