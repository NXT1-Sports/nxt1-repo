/**
 * @fileoverview Document Preview Client Service
 * @module @nxt1/ui/components/document-viewer
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { DocumentSpreadsheetRangeData } from '@nxt1/core';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { AGENT_X_API_BASE_URL } from '../../agent-x/services/agent-x-job.service';
import type { DocumentPreviewSession } from './document-viewer.types';

function buildAgentXFilesUrl(apiBaseUrl: string, fileId: string, suffix: string): string {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
  const agentBase = normalizedBase.endsWith('/agent-x')
    ? normalizedBase
    : `${normalizedBase}/agent-x`;

  return `${agentBase}/files/${encodeURIComponent(fileId)}${suffix}`;
}

@Injectable({ providedIn: 'root' })
export class DocumentPreviewClientService {
  private readonly http = inject(HttpClient);
  private readonly logger = inject(NxtLoggingService).child('DocumentPreviewClientService');
  private readonly breadcrumbs = inject(NxtBreadcrumbService);
  private readonly apiBaseUrl = inject(AGENT_X_API_BASE_URL, { optional: true }) ?? '';

  /**
   * Negotiate an authenticated document preview session with the backend.
   */
  async getPreviewSession(fileId: string): Promise<DocumentPreviewSession> {
    const url = buildAgentXFilesUrl(this.apiBaseUrl, fileId, '/preview-sessions');
    this.logger.info('Negotiating preview session', { fileId });
    this.breadcrumbs.trackStateChange('document-preview:session-request', { fileId });

    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; data?: DocumentPreviewSession; error?: string }>(url, {})
      );

      if (!response.success || !response.data) {
        return {
          available: false,
          reason: response.error || 'negotiation_failed',
        };
      }

      return response.data;
    } catch (err) {
      this.logger.warn('Failed to negotiate preview session, falling back', {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        available: false,
        reason: 'network_error',
      };
    }
  }

  /**
   * Queries a bounded range of spreadsheet cells from the backend.
   */
  async getSpreadsheetRange(
    fileId: string,
    params: {
      readonly sheetId?: string;
      readonly startRow?: number;
      readonly endRow?: number;
      readonly startCol?: number;
      readonly endCol?: number;
    }
  ): Promise<DocumentSpreadsheetRangeData | null> {
    const url = buildAgentXFilesUrl(this.apiBaseUrl, fileId, '/preview/spreadsheet-range');
    let httpParams = new HttpParams();

    if (params.sheetId) httpParams = httpParams.set('sheetId', params.sheetId);
    if (params.startRow) httpParams = httpParams.set('startRow', String(params.startRow));
    if (params.endRow) httpParams = httpParams.set('endRow', String(params.endRow));
    if (params.startCol) httpParams = httpParams.set('startCol', String(params.startCol));
    if (params.endCol) httpParams = httpParams.set('endCol', String(params.endCol));

    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data?: DocumentSpreadsheetRangeData; error?: string }>(
          url,
          { params: httpParams }
        )
      );

      return response.success && response.data ? response.data : null;
    } catch (err) {
      this.logger.warn('Failed to fetch spreadsheet range', {
        fileId,
        params,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
