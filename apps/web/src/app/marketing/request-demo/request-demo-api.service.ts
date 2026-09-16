/**
 * @fileoverview Demo Request Angular HTTP Adapter Service
 * @module apps/web/features/marketing/request-demo
 *
 * Wraps the pure @nxt1/core API factory with Angular's HttpClient.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createDemoRequestApi, type DemoRequestApi } from '@nxt1/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DemoRequestApiService implements DemoRequestApi {
  private readonly http = inject(HttpClient);

  private readonly httpAdapter = {
    get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
    post: <T>(url: string, body: unknown) => firstValueFrom(this.http.post<T>(url, body)),
    put: <T>(url: string, body: unknown) => firstValueFrom(this.http.put<T>(url, body)),
    patch: <T>(url: string, body: unknown) => firstValueFrom(this.http.patch<T>(url, body)),
    delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
  };

  private readonly api = createDemoRequestApi(this.httpAdapter, environment.apiURL);

  readonly submit = this.api.submit;
}
