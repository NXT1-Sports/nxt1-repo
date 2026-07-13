import { describe, expect, it } from 'vitest';
import { normalizeReferralDetail, normalizeReferralSource } from '../referral-source.utils.js';

describe('normalizeReferralSource', () => {
  it('normalizes canonical onboarding source values', () => {
    expect(normalizeReferralSource('social')).toBe('social');
    expect(normalizeReferralSource('team-code')).toBe('team-code');
    expect(normalizeReferralSource('club')).toBe('club');
  });

  it('normalizes synonym values', () => {
    expect(normalizeReferralSource('Social Media')).toBe('social');
    expect(normalizeReferralSource('team invite code')).toBe('team-code');
    expect(normalizeReferralSource('Paid Ad')).toBe('advertisement');
  });

  it('falls back unknown values to other', () => {
    expect(normalizeReferralSource('my custom channel')).toBe('other');
  });
});

describe('normalizeReferralDetail', () => {
  it('trims and normalizes whitespace', () => {
    expect(normalizeReferralDetail('  ig   reel  ')).toBe('ig reel');
  });

  it('returns null for empty values', () => {
    expect(normalizeReferralDetail('   ')).toBeNull();
    expect(normalizeReferralDetail(undefined)).toBeNull();
  });

  it('truncates long values to max length', () => {
    const value = normalizeReferralDetail('x'.repeat(20), 10);
    expect(value).toBe('xxxxxxxxx…');
  });
});
