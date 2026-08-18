/**
 * @fileoverview Release Notes API Service — Mobile Capacitor adapter
 * @module @nxt1/mobile/core/services/api
 *
 * Mirrors the web equivalent but uses CapacitorHttpAdapter for native HTTP
 * calls that bypass CORS on iOS/Android.
 */

import { Injectable, inject } from '@angular/core';
import type { SystemReleaseNote } from '@nxt1/core';
import { CapacitorHttpAdapter } from '../../infrastructure';
import { environment } from '../../../../environments/environment';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ReleaseNotesApiService {
  private readonly http = inject(CapacitorHttpAdapter);
  private readonly baseUrl = environment.apiUrl;

  async getLatest(): Promise<SystemReleaseNote | null> {
    try {
      const res = await this.http.get<ApiResponse<SystemReleaseNote | null>>(
        `${this.baseUrl}/system/release-notes/latest`
      );
      return res.success ? (res.data ?? null) : null;
    } catch {
      return null;
    }
  }

  async markSeen(version: string): Promise<void> {
    try {
      await this.http.patch<ApiResponse<unknown>>(
        `${this.baseUrl}/settings/preferences/lastSeenReleaseVersion`,
        { value: version }
      );
    } catch {
      // Non-blocking — Capacitor Preferences is the offline fallback
    }
  }
}
