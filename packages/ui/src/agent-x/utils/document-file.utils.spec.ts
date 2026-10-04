import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCapacitor } from '@nxt1/core';
import {
  isDocumentPreviewableFile,
  openDeliverableFallback,
  resolveDownloadFileName,
} from './document-file.utils';

vi.mock('@nxt1/core', async () => {
  const actual = await vi.importActual<typeof import('@nxt1/core')>('@nxt1/core');
  return { ...actual, isCapacitor: vi.fn(() => false) };
});

const EXPORT_URL =
  'https://api.nxt1sports.com/agent-x/media-proxy/export/report.pdf?path=Users%2Fu%2Fthreads%2Ft%2Fexports%2Freport.pdf&sig=abc';

describe('document-file.utils', () => {
  afterEach(() => {
    vi.mocked(isCapacitor).mockReturnValue(false);
    vi.restoreAllMocks();
  });

  describe('isDocumentPreviewableFile', () => {
    it.each([
      ['report.pdf', 'application/pdf', 'pdf'],
      ['roster.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'other'],
      ['roster.csv', 'text/csv', 'csv'],
      [
        'deck.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pptx',
      ],
      [
        'letter.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'other',
      ],
    ])('treats %s as previewable', (name, mimeType, kind) => {
      expect(isDocumentPreviewableFile({ name, mimeType, kind } as never)).toBe(true);
    });

    it('rejects archives', () => {
      expect(
        isDocumentPreviewableFile({
          name: 'bundle.zip',
          mimeType: 'application/zip',
          kind: 'other',
        } as never)
      ).toBe(false);
    });
  });

  describe('resolveDownloadFileName', () => {
    it('appends an extension from the MIME type when the name has none', () => {
      expect(
        resolveDownloadFileName({
          name: 'Scouting Report',
          mimeType: 'application/pdf',
        })
      ).toBe('Scouting Report.pdf');
    });

    it('keeps an existing extension and strips invalid characters', () => {
      expect(resolveDownloadFileName({ name: 'Q3/Q4: roster.xlsx', mimeType: 'text/csv' })).toBe(
        'Q3_Q4_ roster.xlsx'
      );
    });
  });

  describe('openDeliverableFallback', () => {
    it('downloads signed export links in place on the web', () => {
      const browser = { openLink: vi.fn() };
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        /* noop */
      });

      openDeliverableFallback(EXPORT_URL, browser as never);

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(browser.openLink).not.toHaveBeenCalled();
    });

    it('hands export links to the in-app browser on native', () => {
      vi.mocked(isCapacitor).mockReturnValue(true);
      const browser = { openLink: vi.fn() };
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      openDeliverableFallback(EXPORT_URL, browser as never);

      expect(clickSpy).not.toHaveBeenCalled();
      expect(browser.openLink).toHaveBeenCalledWith(
        expect.objectContaining({ url: EXPORT_URL, surface: 'message' })
      );
    });

    it('opens non-export URLs in the browser', () => {
      const browser = { openLink: vi.fn() };
      openDeliverableFallback('https://storage.googleapis.com/b/report.pdf', browser as never);
      expect(browser.openLink).toHaveBeenCalledTimes(1);
    });
  });
});
