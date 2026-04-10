import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import * as Sentry from '@sentry/angular';

import type {
  CrashlyticsAdapter,
  CrashBreadcrumb,
  CrashCustomKeys,
  CrashException,
  CrashlyticsConfig,
  CrashSeverity,
  CrashUser,
  AppError,
} from '@nxt1/core/crashlytics';

import { createNoOpCrashlyticsAdapter, DEFAULT_CRASHLYTICS_CONFIG } from '@nxt1/core/crashlytics';

@Injectable({ providedIn: 'root' })
export class SentryCrashlyticsAdapter implements CrashlyticsAdapter {
  private readonly platformId = inject(PLATFORM_ID);

  private _config: Required<CrashlyticsConfig> = { ...DEFAULT_CRASHLYTICS_CONFIG };
  private _ready = true;
  private _enabled = true;
  private readonly noOpAdapter = createNoOpCrashlyticsAdapter();

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private get isServer(): boolean {
    return isPlatformServer(this.platformId);
  }

  async initialize(config?: CrashlyticsConfig): Promise<void> {
    this._config = { ...DEFAULT_CRASHLYTICS_CONFIG, ...config };
    if (this.isServer) {
      await this.noOpAdapter.initialize(this._config);
      this._ready = true;
      return;
    }
    this._enabled = this._config.enabled;
    this._ready = true;
  }

  async isEnabled(): Promise<boolean> {
    if (this.isServer) return this.noOpAdapter.isEnabled();
    return this._enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (this.isServer) return this.noOpAdapter.setEnabled(enabled);
    this._enabled = enabled;
  }

  isReady(): boolean {
    return this._ready;
  }

  async setUserId(userId: string): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.setUserId(userId);
    Sentry.setUser({ id: userId });
  }

  async setUser(user: CrashUser): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.setUser(user);
    Sentry.setUser({ id: user.userId, email: user.email, username: user.displayName });
  }

  async clearUser(): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.clearUser();
    Sentry.setUser(null);
  }

  async setCustomKey(key: string, value: string | number | boolean): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.setCustomKey(key, value);
    Sentry.setTag(key, String(value));
  }

  async setCustomKeys(keys: CrashCustomKeys): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.setCustomKeys(keys);
    Sentry.setTags(keys as any);
  }

  async addBreadcrumb(breadcrumb: CrashBreadcrumb): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.addBreadcrumb(breadcrumb);
    Sentry.addBreadcrumb({
      category: breadcrumb.type,
      message: breadcrumb.message,
      level: 'info',
      data: breadcrumb.data,
    });
  }

  async log(message: string): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.log(message);
    Sentry.addBreadcrumb({ message, level: 'info' });
  }

  async recordException(exception: CrashException): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.recordException(exception);
    Sentry.withScope((scope) => {
      scope.setLevel((exception.severity as Sentry.SeverityLevel) || 'error');
      scope.setExtra('context', exception.context);
      const error = new Error(exception.message);
      if (exception.name) error.name = exception.name;
      if (exception.stacktrace) error.stack = exception.stacktrace;
      Sentry.captureException(error);
    });
  }

  async recordError(error: Error, severity?: CrashSeverity): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.recordError(error, severity);
    Sentry.withScope((scope) => {
      if (severity) scope.setLevel(severity as Sentry.SeverityLevel);
      Sentry.captureException(error);
    });
  }

  async recordAppError(appError: AppError): Promise<void> {
    if (this.isServer || !this._enabled) return;
    Sentry.withScope((scope) => {
      scope.setLevel((appError.severity as Sentry.SeverityLevel) || 'error');
      if (appError.context) scope.setExtras(appError.context);
      if (appError.category) scope.setTag('category', appError.category);
      if (appError.code) scope.setTag('error_code', appError.code);
      Sentry.captureException(new Error(appError.message));
    });
  }

  async crash(): Promise<void> {
    if (this.isServer || !this._enabled) return this.noOpAdapter.crash();
    throw new Error('Test Crash');
  }

  isDebugMode(): boolean {
    return false;
  }

  async sendUnsentReports(): Promise<void> {
    // Sentry handles this automatically
  }

  async deleteUnsentReports(): Promise<void> {
    // Sentry handles this automatically
  }

  async checkForUnsentReports(): Promise<boolean> {
    return false; // Handled by standard Sentry options
  }

  async didCrashOnPreviousExecution(): Promise<boolean> {
    return false; // Handled by standard Sentry options
  }
}
