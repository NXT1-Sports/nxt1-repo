import { describe, expect, it } from 'vitest';
import {
  buildPreferredHostRedirectUrl,
  extractLegacyProfileLookupParam,
  isRetiredLegacyRoute,
} from './legacy-route-handling';

describe('legacy-route-handling', () => {
  it('extracts numeric unicode from retired prospect profile routes', () => {
    expect(extractLegacyProfileLookupParam('/prospect-profile/31700863')).toBe('31700863');
  });

  it('extracts user ids from malformed legacy profile routes', () => {
    expect(
      extractLegacyProfileLookupParam('/profile/athlete/unknown/GVtL5HfGhYW97v83Vq27BCXtmVl2')
    ).toBe('GVtL5HfGhYW97v83Vq27BCXtmVl2');
    expect(extractLegacyProfileLookupParam('/profile/athlete/athlete/99999999999')).toBe(
      '99999999999'
    );
  });

  it('returns null for non-legacy profile routes', () => {
    expect(extractLegacyProfileLookupParam('/profile/46139975')).toBeNull();
  });

  it('flags retired private or search routes', () => {
    expect(isRetiredLegacyRoute('/saved-scouting-report/51355097-mgkOmgdr')).toBe(true);
    expect(isRetiredLegacyRoute('/search-videos?q=%7Bsearch_term_string%7D')).toBe(true);
    expect(isRetiredLegacyRoute('/profile/31700863')).toBe(false);
  });

  it('redirects the legacy app host to the apex host', () => {
    expect(
      buildPreferredHostRedirectUrl('https://app.nxt1sports.com/prospect-profile/87549843')
    ).toBe('https://nxt1sports.com/prospect-profile/87549843');
  });

  it('does not rewrite the primary public host', () => {
    expect(buildPreferredHostRedirectUrl('https://nxt1sports.com/profile/46139975')).toBeNull();
  });
});
