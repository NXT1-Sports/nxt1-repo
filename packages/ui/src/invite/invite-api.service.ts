/**
 * @fileoverview Invite Angular HTTP Adapter Service
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Angular HTTP client adapter for invite API.
 * Wraps the pure @nxt1/core API factory with Angular's HttpClient.
 *
 * ⭐ WEB APP ONLY - Mobile uses Capacitor HTTP ⭐
 */

import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createInviteApi } from '@nxt1/core';

/**
 * Injection token for Invite API base URL.
 * Apps should provide this in their config:
 *
 * ```typescript
 * { provide: INVITE_API_BASE_URL, useFactory: () => environment.apiUrl }
 * ```
 */
export const INVITE_API_BASE_URL = new InjectionToken<string>('INVITE_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/**
 * Angular wrapper for Invite API.
 * Delegates to the pure TypeScript API factory.
 */
@Injectable({ providedIn: 'root' })
export class InviteApiService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = inject(INVITE_API_BASE_URL);

  private readonly httpAdapter = {
    get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
    post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
    put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
    patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
    delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
  };

  private readonly api = createInviteApi(this.httpAdapter, this.baseUrl);

  // Expose all API methods directly
  readonly generateLink = this.api.generateLink;
  readonly sendInvite = this.api.sendInvite;
  readonly sendBulkInvites = this.api.sendBulkInvites;
  readonly getHistory = this.api.getHistory;
  readonly validateCode = this.api.validateCode;
  readonly acceptInvite = this.api.acceptInvite;
}
