import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { AGENT_X_API_BASE_URL } from '../../agent-x/services/agent-x-job.service';
import { DocumentPreviewClientService } from './document-preview-client.service';

describe('DocumentPreviewClientService', () => {
  const httpMock = {
    post: vi.fn(),
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    const loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      child: vi.fn(),
    };
    loggerMock.child.mockReturnValue(loggerMock);

    TestBed.configureTestingModule({
      providers: [
        DocumentPreviewClientService,
        { provide: HttpClient, useValue: httpMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.nxt1.test/api/v1/staging' },
      ],
    });
  });

  it('posts preview session requests to the mounted agent-x route', async () => {
    httpMock.post.mockReturnValue(
      of({
        success: true,
        data: { available: false, reason: 'unsupported' },
      })
    );

    const service = TestBed.inject(DocumentPreviewClientService);
    const result = await service.getPreviewSession('file 123');

    expect(httpMock.post).toHaveBeenCalledWith(
      'https://api.nxt1.test/api/v1/staging/agent-x/files/file%20123/preview-sessions',
      {}
    );
    expect(result).toEqual({ available: false, reason: 'unsupported' });
  });

  it('does not double-append agent-x if the injected base already contains it', async () => {
    TestBed.resetTestingModule();

    const loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      child: vi.fn(),
    };
    loggerMock.child.mockReturnValue(loggerMock);

    TestBed.configureTestingModule({
      providers: [
        DocumentPreviewClientService,
        { provide: HttpClient, useValue: httpMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: { trackStateChange: vi.fn() } },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.nxt1.test/api/v1/agent-x' },
      ],
    });

    httpMock.post.mockReturnValue(of({ success: true, data: { available: false } }));

    const service = TestBed.inject(DocumentPreviewClientService);
    await service.getPreviewSession('file-1');

    expect(httpMock.post).toHaveBeenCalledWith(
      'https://api.nxt1.test/api/v1/agent-x/files/file-1/preview-sessions',
      {}
    );
  });

  it('queries spreadsheet ranges from the mounted agent-x route', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          sheetId: 'sheet-1',
          startRow: 1,
          endRow: 2,
          startCol: 1,
          endCol: 2,
          totalRows: 2,
          totalCols: 2,
          cells: [],
        },
      })
    );

    const service = TestBed.inject(DocumentPreviewClientService);
    await service.getSpreadsheetRange('sheet-1', {
      sheetId: 'Roster',
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 2,
    });

    const call = httpMock.get.mock.calls[0];
    expect(call?.[0]).toBe(
      'https://api.nxt1.test/api/v1/staging/agent-x/files/sheet-1/preview/spreadsheet-range'
    );
    expect(call?.[1]?.params).toBeInstanceOf(HttpParams);
  });
});
