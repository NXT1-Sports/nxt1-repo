import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NxtLoggingService } from '../logging/logging.service';
import { NxtArchiveService } from './archive.service';

type MockZipFileRecord = { path: string; data: unknown };
type MockZipInstance = {
  files: MockZipFileRecord[];
  file: ReturnType<typeof vi.fn>;
  generateAsync: ReturnType<typeof vi.fn>;
};

const mockZipModule = vi.hoisted(() => {
  const instances: MockZipInstance[] = [];

  class MockJSZip implements MockZipInstance {
    readonly files: MockZipFileRecord[] = [];

    readonly file = vi.fn((path: string, data: unknown) => {
      this.files.push({ path, data });
      return this;
    });

    readonly generateAsync = vi.fn(async () => new Blob(['zip'], { type: 'application/zip' }));

    static loadAsync = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return { MockJSZip, instances };
});

const zipInstances = mockZipModule.instances;

vi.mock('jszip', () => ({
  default: mockZipModule.MockJSZip,
}));

vi.mock('@nxt1/core', async () => {
  const actual = await vi.importActual<typeof import('@nxt1/core')>('@nxt1/core');
  return {
    ...actual,
    isCapacitor: vi.fn(() => false),
  };
});

describe('NxtArchiveService', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    zipInstances.length = 0;
    logger.child.mockReturnValue(logger);

    TestBed.configureTestingModule({
      providers: [
        NxtArchiveService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: NxtLoggingService, useValue: logger },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sanitizes archive paths, deduplicates collisions, and triggers a browser download', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:archive');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const service = TestBed.inject(NxtArchiveService);
    const result = await service.downloadZip({
      fileName: 'Film Review Export',
      rootFolderName: 'Team Film Review',
      entries: [
        {
          path: 'Playlist A/../Clip 1.mp4',
          source: { kind: 'text', text: 'alpha' },
        },
        {
          path: 'Playlist A/Clip 1.mp4',
          source: { kind: 'text', text: 'beta' },
        },
      ],
    });
    await vi.runAllTimersAsync();

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        exportedFrom: 'browser',
        fileName: 'Film Review Export.zip',
        entryCount: 2,
      })
    );

    expect(zipInstances).toHaveLength(1);
    expect(zipInstances[0]?.files).toEqual([
      { path: 'Team Film Review/Playlist A/item/Clip 1.mp4', data: 'alpha' },
      { path: 'Team Film Review/Playlist A/Clip 1.mp4', data: 'beta' },
    ]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:archive');
  });

  it('returns a validation error when no files are provided', async () => {
    const service = TestBed.inject(NxtArchiveService);
    const result = await service.downloadZip({
      fileName: 'empty-export',
      entries: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No files were provided for the ZIP export');
    expect(zipInstances).toHaveLength(0);
  });

  it('extracts ZIP entries and skips directories and OS junk files', async () => {
    const imageBlob = new Blob(['image-bytes'], { type: 'application/octet-stream' });
    const zipFiles = {
      'MyPhotos/': { dir: true, name: 'MyPhotos/', async: vi.fn() },
      'MyPhotos/img1.jpg': {
        dir: false,
        name: 'MyPhotos/img1.jpg',
        async: vi.fn(async () => imageBlob),
      },
      'MyPhotos/__MACOSX/img1.jpg': {
        dir: false,
        name: 'MyPhotos/__MACOSX/img1.jpg',
        async: vi.fn(async () => imageBlob),
      },
      'MyPhotos/.DS_Store': {
        dir: false,
        name: 'MyPhotos/.DS_Store',
        async: vi.fn(async () => imageBlob),
      },
    };
    mockZipModule.MockJSZip.loadAsync.mockResolvedValue({ files: zipFiles });

    const service = TestBed.inject(NxtArchiveService);
    const result = await service.extractZipEntries(new Blob(['zip-bytes']));

    expect(result.success).toBe(true);
    expect(result.entries).toEqual([{ path: 'MyPhotos/img1.jpg', blob: imageBlob }]);
  });

  it('returns an error result when the ZIP file cannot be parsed', async () => {
    mockZipModule.MockJSZip.loadAsync.mockRejectedValue(new Error('Corrupted zip'));

    const service = TestBed.inject(NxtArchiveService);
    const result = await service.extractZipEntries(new Blob(['not-a-zip']));

    expect(result.success).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.error).toBe('Corrupted zip');
  });
});
