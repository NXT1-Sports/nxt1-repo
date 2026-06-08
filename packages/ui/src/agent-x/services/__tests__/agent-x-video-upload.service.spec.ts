import { TestBed } from '@angular/core/testing';
import { createMemoryCrashlyticsAdapter } from '@nxt1/core/crashlytics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLOBAL_CRASHLYTICS } from '../../../infrastructure';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { AGENT_X_API_BASE_URL } from '../agent-x-job.service';
import {
  AgentXVideoUploadService,
  shouldUseCloudflareUpload,
  type VideoUploadProgress,
} from '../agent-x-video-upload.service';

describe('agent-x-video-upload helpers', () => {
  it('uses Firebase below the Cloudflare cutoff', () => {
    expect(shouldUseCloudflareUpload(100)).toBe(false);
    expect(shouldUseCloudflareUpload(250 * 1024 * 1024)).toBe(true);
    expect(shouldUseCloudflareUpload(300_000_000)).toBe(true);
  });
});

describe('AgentXVideoUploadService', () => {
  const loggerMock = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loggerMock.child.mockReturnValue(loggerMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('records Firebase upload provisioning failures to Crashlytics', async () => {
    const crashlytics = createMemoryCrashlyticsAdapter();
    await crashlytics.initialize({ enabled: true });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('signed URL service unavailable'),
      })
    );

    TestBed.configureTestingModule({
      providers: [
        AgentXVideoUploadService,
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: GLOBAL_CRASHLYTICS, useValue: crashlytics },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackStateChange: vi.fn() },
        },
      ],
    });

    const service = TestBed.inject(AgentXVideoUploadService);
    const file = new File(['video'], '02420402042.mp4', { type: 'video/mp4' });
    const events = await collectUploadEvents(service, file);

    expect(events.at(-1)).toMatchObject({
      phase: 'error',
      errorMessage: 'Provisioning failed: signed URL service unavailable',
    });

    const exceptions = crashlytics.getRecordedExceptions();
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({
      message:
        'Agent X video upload failed during provisioning: Provisioning failed: signed URL service unavailable',
      category: 'media',
      severity: 'error',
      context: {
        phase: 'provisioning',
        fileExtension: 'mp4',
        mimeType: 'video/mp4',
        sizeBytes: 5,
        storageBackend: 'firebase',
      },
    });
  });

  it('records Firebase storage PUT failures to Crashlytics', async () => {
    const crashlytics = createMemoryCrashlyticsAdapter();
    await crashlytics.initialize({ enabled: true });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              uploadUrl: 'https://storage.googleapis.com/nxt-1-v2/upload',
              readUrl: 'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/video.mp4',
              storagePath: 'Users/user-1/threads/thread-1/media/video/video.mp4',
              expiresAt: '2026-06-08T20:00:00.000Z',
            },
          }),
      })
    );

    TestBed.configureTestingModule({
      providers: [
        AgentXVideoUploadService,
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: GLOBAL_CRASHLYTICS, useValue: crashlytics },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackStateChange: vi.fn() },
        },
      ],
    });

    const service = TestBed.inject(AgentXVideoUploadService);
    const internals = service as unknown as AgentXVideoUploadServiceInternals;
    vi.spyOn(internals, '_xhrPutWithRetry').mockRejectedValue(new Error('native upload denied'));

    const file = new File(['video'], '02420402042.mp4', { type: 'video/mp4' });
    const events = await collectUploadEvents(service, file);

    expect(events.at(-1)).toMatchObject({
      phase: 'error',
      errorMessage: 'native upload denied',
    });

    const exceptions = crashlytics.getRecordedExceptions();
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({
      message: 'Agent X video upload failed during firebase-storage-put: native upload denied',
      category: 'media',
      severity: 'error',
      context: {
        phase: 'firebase-storage-put',
        fileExtension: 'mp4',
        mimeType: 'video/mp4',
        sizeBytes: 5,
        storageBackend: 'firebase',
      },
    });
    expect(exceptions[0].context).not.toHaveProperty('storagePath');
  });

  it('falls back to signed URL XHR when native Firebase upload rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              uploadUrl: 'https://storage.googleapis.com/nxt-1-v2/upload',
              readUrl: 'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/video.mp4',
              storagePath: 'Users/user-1/threads/thread-1/media/video/video.mp4',
              expiresAt: '2026-06-08T20:00:00.000Z',
            },
          }),
      })
    );

    TestBed.configureTestingModule({
      providers: [
        AgentXVideoUploadService,
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: GLOBAL_CRASHLYTICS, useValue: createMemoryCrashlyticsAdapter() },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackStateChange: vi.fn() },
        },
      ],
    });

    const service = TestBed.inject(AgentXVideoUploadService);
    const internals = service as unknown as AgentXVideoUploadServiceInternals;
    vi.spyOn(internals, '_nativeFirebasePut').mockRejectedValue(
      new Error('User does not have permission to access this object')
    );
    vi.spyOn(internals, '_xhrPut').mockImplementation(async (_file, _uploadUrl, onProgress) => {
      onProgress(100);
    });

    const file = new File(['video'], '02420402042.mp4', { type: 'video/mp4' });
    const events = await collectUploadEvents(service, file);

    expect(internals._xhrPut).toHaveBeenCalledWith(
      file,
      'https://storage.googleapis.com/nxt-1-v2/upload',
      expect.any(Function)
    );
    expect(events.at(-1)).toMatchObject({
      phase: 'complete',
      percent: 100,
      streamUrl: 'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2/o/video.mp4',
      storagePath: 'Users/user-1/threads/thread-1/media/video/video.mp4',
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[_xhrPutWithRetry] Native Firebase Storage upload failed; falling back to signed URL XHR upload',
      expect.objectContaining({
        error: 'User does not have permission to access this object',
        storagePath: 'Users/user-1/threads/thread-1/media/video/video.mp4',
      })
    );
  });
});

interface AgentXVideoUploadServiceInternals {
  _nativeFirebasePut(
    file: File,
    storagePath: string,
    onProgress: (percent: number) => void
  ): Promise<boolean>;

  _xhrPutWithRetry(
    file: File,
    uploadUrl: string,
    storagePath: string,
    onProgress: (percent: number) => void
  ): Promise<void>;

  _xhrPut(file: File, uploadUrl: string, onProgress: (percent: number) => void): Promise<void>;
}

function collectUploadEvents(
  service: AgentXVideoUploadService,
  file: File
): Promise<VideoUploadProgress[]> {
  const events: VideoUploadProgress[] = [];

  return new Promise((resolve, reject) => {
    service.uploadVideo(file, 'token', { transport: 'firebase', threadId: 'thread-1' }).subscribe({
      next: (event) => events.push(event),
      error: reject,
      complete: () => resolve(events),
    });
  });
}
