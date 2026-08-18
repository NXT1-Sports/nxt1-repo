/**
 * @fileoverview Release Notes API Service — Angular HTTP adapter
 * @module @nxt1/web/core/services/api
 *
 * Thin HTTP wrapper around the release-notes REST endpoints.
 * Used by ReleaseNotesInitializer to fetch the latest note and persist
 * the user's `lastSeenReleaseVersion` preference.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { SystemReleaseNote } from '@nxt1/core';
import { environment } from '../../../../environments/environment';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ReleaseNotesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiURL;

  async getLatest(): Promise<SystemReleaseNote | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResponse<SystemReleaseNote | null>>(
          `${this.baseUrl}/system/release-notes/latest`
        )
      );
      return res.success ? (res.data ?? null) : null;
    } catch {
      return null;
    }
  }

  async markSeen(version: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.patch<ApiResponse<unknown>>(
          `${this.baseUrl}/settings/preferences/lastSeenReleaseVersion`,
          { value: version }
        )
      );
    } catch {
      // Non-blocking — localStorage is the fallback
    }
  }
}
