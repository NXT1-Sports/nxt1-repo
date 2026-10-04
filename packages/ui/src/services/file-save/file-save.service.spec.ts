import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCapacitor } from '@nxt1/core';
import { NxtFileSaveService } from './file-save.service';

const capacitorMocks = vi.hoisted(() => ({
  writeFile: vi.fn(async () => ({ uri: 'file:///cache/report.pdf' })),
  deleteFile: vi.fn(async () => undefined),
  share: vi.fn(async () => ({})),
}));

vi.mock('@nxt1/core', async () => {
  const actual = await vi.importActual<typeof import('@nxt1/core')>('@nxt1/core');
  return { ...actual, isCapacitor: vi.fn(() => false) };
});

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: capacitorMocks.writeFile,
    deleteFile: capacitorMocks.deleteFile,
  },
  Directory: { Cache: 'CACHE' },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: capacitorMocks.share },
}));

describe('NxtFileSaveService', () => {
  let service: NxtFileSaveService;
  const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [NxtFileSaveService] });
    service = TestBed.inject(NxtFileSaveService);
  });

  afterEach(() => {
    vi.mocked(isCapacitor).mockReturnValue(false);
    vi.restoreAllMocks();
  });

  describe('web', () => {
    it('downloads through a temporary anchor with the file name', async () => {
      const createObjectURL = vi.fn(() => 'blob:report');
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        /* noop */
      });

      const outcome = await service.saveBlob(blob, 'Report.pdf');

      expect(outcome).toBe('downloaded');
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('Report.pdf');
      expect(document.body.contains(anchor)).toBe(false);
      expect(capacitorMocks.share).not.toHaveBeenCalled();
    });
  });

  describe('native', () => {
    beforeEach(() => {
      vi.mocked(isCapacitor).mockReturnValue(true);
    });

    it('writes to the cache, opens the share sheet, then deletes the temp file', async () => {
      const outcome = await service.saveBlob(blob, 'Report.pdf', { title: 'Report' });

      expect(outcome).toBe('shared');
      expect(capacitorMocks.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'Report.pdf', directory: 'CACHE' })
      );
      expect(capacitorMocks.share).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Report', files: ['file:///cache/report.pdf'] })
      );
      expect(capacitorMocks.deleteFile).toHaveBeenCalledWith({
        path: 'Report.pdf',
        directory: 'CACHE',
      });
    });

    it('sanitizes path separators in the cache file name', async () => {
      await service.saveBlob(blob, 'Q3/Q4: Recap.pdf');

      expect(capacitorMocks.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'Q3_Q4_ Recap.pdf' })
      );
    });

    it('reports a dismissed share sheet as cancelled and still cleans up', async () => {
      capacitorMocks.share.mockRejectedValueOnce(new Error('Share canceled'));

      await expect(service.saveBlob(blob, 'Report.pdf')).resolves.toBe('cancelled');
      expect(capacitorMocks.deleteFile).toHaveBeenCalled();
    });

    it('rethrows real share failures', async () => {
      capacitorMocks.share.mockRejectedValueOnce(new Error('No activity found'));

      await expect(service.saveBlob(blob, 'Report.pdf')).rejects.toThrow('No activity found');
      expect(capacitorMocks.deleteFile).toHaveBeenCalled();
    });
  });
});
