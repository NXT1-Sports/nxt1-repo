import { describe, expect, it } from 'vitest';
import { isGeneratedDocumentLink } from './deliverable-links.js';

describe('isGeneratedDocumentLink', () => {
  const signed = (name: string, mime: string) =>
    `https://api.example.com/api/v1/agent-x/media-proxy/export/${encodeURIComponent(name)}?path=Users%2Fu%2Fthreads%2Ft%2Fexports%2F1-ab&mime=${encodeURIComponent(mime)}&exp=1&sig=ab`;

  it('treats signed export documents as documents', () => {
    expect(isGeneratedDocumentLink(signed('Report.pdf', 'application/pdf'))).toBe(true);
    expect(
      isGeneratedDocumentLink(
        signed('Roster.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      )
    ).toBe(true);
  });

  it('keeps exported images and videos as media', () => {
    expect(isGeneratedDocumentLink(signed('chart.png', 'image/png'))).toBe(false);
    expect(
      isGeneratedDocumentLink(
        'https://firebasestorage.googleapis.com/v0/b/b/o/Users%2Fu%2Fthreads%2Ft%2Fexports%2Fchart.png?alt=media'
      )
    ).toBe(false);
  });

  it('classifies storage exports and document extensions', () => {
    expect(
      isGeneratedDocumentLink(
        'https://storage.googleapis.com/bucket/Users/u/threads/t/exports/report.pdf?X-Goog-Signature=x'
      )
    ).toBe(true);
    expect(isGeneratedDocumentLink('https://cdn.example.com/playsheet.pdf')).toBe(true);
    expect(isGeneratedDocumentLink('https://cdn.example.com/diagram.png')).toBe(false);
    expect(isGeneratedDocumentLink('https://cdn.example.com/clip.mp4')).toBe(false);
  });

  it('uses the declared MIME type when present', () => {
    expect(isGeneratedDocumentLink('https://cdn.example.com/file', 'application/pdf')).toBe(true);
    expect(isGeneratedDocumentLink('https://cdn.example.com/file', 'image/png')).toBe(false);
  });
});
