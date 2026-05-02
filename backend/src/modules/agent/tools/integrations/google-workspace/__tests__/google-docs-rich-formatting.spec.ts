import { describe, expect, it } from 'vitest';

import {
  buildGoogleDocsRichFormattingPlan,
  shouldUseGoogleDocsRichFormatting,
} from '../google-docs-rich-formatting.js';

describe('google-docs-rich-formatting', () => {
  it('detects structured document content', () => {
    expect(
      shouldUseGoogleDocsRichFormatting(
        '20 TEXAS COLLEGES WITH BASKETBALL PROGRAMS\nCrown Point Recruiting Guide\n\nPOWER 5 PROGRAMS\n\n1. Texas'
      )
    ).toBe(true);
  });

  it('builds title, subtitle, heading, and bullet formatting requests for plain structured content', () => {
    const plan = buildGoogleDocsRichFormattingPlan(
      '20 TEXAS COLLEGES WITH BASKETBALL PROGRAMS\nCrown Point Recruiting Guide\n\nPOWER 5 & MAJOR PROGRAMS\n\n1. University of Texas\n2. Texas A&M',
      1,
      { preferDocumentHeaderStyles: true }
    );

    expect(plan).not.toBeNull();
    expect(plan?.insertText).toContain('20 TEXAS COLLEGES WITH BASKETBALL PROGRAMS');
    expect(plan?.insertText).toContain('Crown Point Recruiting Guide');
    expect(plan?.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: { namedStyleType: 'TITLE' },
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: { namedStyleType: 'SUBTITLE' },
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: { namedStyleType: 'HEADING_1' },
          }),
        }),
        expect.objectContaining({
          createParagraphBullets: expect.objectContaining({
            bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
          }),
        }),
      ])
    );
  });

  it('builds title and subtitle from markdown headings', () => {
    const plan = buildGoogleDocsRichFormattingPlan(
      '# Texas Colleges with Basketball Programs\n## Crown Point Recruiting Guide\n\n- Baylor\n- TCU',
      1,
      { preferDocumentHeaderStyles: true }
    );

    expect(plan?.styledBlockCount).toBeGreaterThanOrEqual(3);
    expect(plan?.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: { namedStyleType: 'TITLE' },
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: { namedStyleType: 'SUBTITLE' },
          }),
        }),
      ])
    );
  });
});
