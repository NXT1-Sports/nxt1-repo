/**
 * @fileoverview Unit tests for dedup-utils — core normalization functions
 * used across all Agent X database write tools.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCollegeName,
  normalizeOpponentName,
  normalizeVideoUrl,
  rosterDedupeKey,
} from '../dedup-utils.js';

// ─── normalizeCollegeName ───────────────────────────────────────────────────

describe('normalizeCollegeName', () => {
  it('strips "The " prefix', () => {
    expect(normalizeCollegeName('The Ohio State University')).toBe('ohio state');
  });

  it('strips "University of" prefix', () => {
    expect(normalizeCollegeName('University of Alabama')).toBe('alabama');
  });

  it('strips trailing " University"', () => {
    expect(normalizeCollegeName('Stanford University')).toBe('stanford');
  });

  it('strips trailing " College"', () => {
    expect(normalizeCollegeName("St. Mary's College")).toBe('saint marys');
  });

  it('normalizes "St." abbreviation', () => {
    expect(normalizeCollegeName("St. John's")).toBe('saint johns');
  });

  it('normalizes "Mt." abbreviation', () => {
    expect(normalizeCollegeName('Mt. Vernon')).toBe('mount vernon');
  });

  it('removes punctuation', () => {
    expect(normalizeCollegeName('Texas A&M')).toBe('texas am');
  });

  it('collapses whitespace', () => {
    expect(normalizeCollegeName('  Ohio   State  ')).toBe('ohio state');
  });

  it('returns "unknown" for empty string', () => {
    expect(normalizeCollegeName('')).toBe('unknown');
    expect(normalizeCollegeName('   ')).toBe('unknown');
  });

  it('treats different representations of same school as equal', () => {
    const a = normalizeCollegeName('The Ohio State University');
    const b = normalizeCollegeName('Ohio State');
    expect(a).toBe(b);
  });

  it('handles "State University" suffix — preserves "State" when part of name', () => {
    // "Penn State University" → strip " University" → "Penn State"
    // The regex strips "State University" as a compound suffix, but the
    // simpler " University" rule fires first, leaving "Penn State" intact.
    expect(normalizeCollegeName('Penn State University')).toBe('penn state');
  });
});

// ─── normalizeOpponentName ──────────────────────────────────────────────────

describe('normalizeOpponentName', () => {
  it('strips JV tag', () => {
    expect(normalizeOpponentName('Liberty JV')).toBe('liberty');
  });

  it('strips Varsity tag', () => {
    expect(normalizeOpponentName('Liberty Varsity')).toBe('liberty');
  });

  it('strips parenthetical notes', () => {
    expect(normalizeOpponentName('Liberty (Home)')).toBe('liberty');
  });

  it('normalizes "St." to "saint"', () => {
    expect(normalizeOpponentName("St. Mary's")).toBe('saint marys');
  });

  it('strips Freshman tag', () => {
    expect(normalizeOpponentName('Lincoln Freshman')).toBe('lincoln');
  });

  it('returns "unknown" for empty string', () => {
    expect(normalizeOpponentName('')).toBe('unknown');
  });

  it('treats different representations as equal', () => {
    const a = normalizeOpponentName("St. Mary's JV");
    const b = normalizeOpponentName('Saint Marys');
    expect(a).toBe(b);
  });
});

// ─── normalizeVideoUrl ──────────────────────────────────────────────────────

describe('normalizeVideoUrl', () => {
  it('extracts YouTube ID from watch URL', () => {
    expect(normalizeVideoUrl('https://www.youtube.com/watch?v=abc123def45')).toBe(
      'youtube::abc123def45'
    );
  });

  it('extracts YouTube ID from short URL', () => {
    expect(normalizeVideoUrl('https://youtu.be/abc123def45')).toBe('youtube::abc123def45');
  });

  it('extracts YouTube ID from embed URL', () => {
    expect(normalizeVideoUrl('https://youtube.com/embed/abc123def45')).toBe('youtube::abc123def45');
  });

  it('strips tracking params from YouTube URLs', () => {
    expect(
      normalizeVideoUrl('https://youtube.com/watch?v=abc123def45&utm_source=fb&si=share')
    ).toBe('youtube::abc123def45');
  });

  it('extracts Hudl highlight ID', () => {
    expect(normalizeVideoUrl('https://www.hudl.com/video/3/abc123/highlights')).toBe(
      'hudl::abc123'
    );
  });

  it('strips protocol and www for generic URLs', () => {
    expect(normalizeVideoUrl('https://www.vimeo.com/123456789')).toBe('vimeo.com/123456789');
  });

  it('strips tracking params from generic URLs', () => {
    const result = normalizeVideoUrl('https://vimeo.com/123456789?utm_source=fb&fbclid=abc');
    expect(result).toBe('vimeo.com/123456789');
  });

  it('strips trailing slashes', () => {
    expect(normalizeVideoUrl('https://vimeo.com/123456789/')).toBe('vimeo.com/123456789');
  });

  it('treats http and https as equivalent', () => {
    const a = normalizeVideoUrl('http://vimeo.com/123456789');
    const b = normalizeVideoUrl('https://vimeo.com/123456789');
    expect(a).toBe(b);
  });

  it('treats www and non-www as equivalent', () => {
    const a = normalizeVideoUrl('https://www.youtube.com/watch?v=abc123def45');
    const b = normalizeVideoUrl('https://youtube.com/watch?v=abc123def45');
    expect(a).toBe(b);
  });

  it('returns empty string for empty input', () => {
    expect(normalizeVideoUrl('')).toBe('');
    expect(normalizeVideoUrl('   ')).toBe('');
  });
});

// ─── rosterDedupeKey ────────────────────────────────────────────────────────

describe('rosterDedupeKey', () => {
  it('builds key from name only', () => {
    expect(rosterDedupeKey('John', 'Smith', null, null)).toBe('john|smith');
  });

  it('includes classOf when present', () => {
    expect(rosterDedupeKey('John', 'Smith', 2026, null)).toBe('john|smith|2026');
  });

  it('includes jerseyNumber when present', () => {
    expect(rosterDedupeKey('John', 'Smith', null, '12')).toBe('john|smith|12');
  });

  it('includes both classOf and jerseyNumber', () => {
    expect(rosterDedupeKey('John', 'Smith', 2026, '12')).toBe('john|smith|2026|12');
  });

  it('lowercases and trims names', () => {
    expect(rosterDedupeKey('  JOHN  ', '  SMITH  ', null, null)).toBe('john|smith');
  });

  it('differentiates same name with different classOf', () => {
    const a = rosterDedupeKey('John', 'Smith', 2025, null);
    const b = rosterDedupeKey('John', 'Smith', 2026, null);
    expect(a).not.toBe(b);
  });
});
