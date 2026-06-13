/**
 * @fileoverview LiveUpdateService - Self-hosted OTA bundle updates
 * @module @nxt1/mobile
 *
 * Reads the OTA manifest from Firestore (`AppUpdates/{platform}_{channel}`),
 * downloads the bundle ZIP from Firebase Storage via the (free, MIT-licensed)
 * `@capgo/capacitor-updater` plugin, verifies the SHA-256 hash, and swaps the
 * active web bundle. The Capgo Cloud service is NOT used — only the
 * open-source plugin runtime, pointed at our own Firebase infrastructure.
 *
 * Flow on cold start:
 *   1. notifyAppReady() — confirms the previously applied bundle didn't crash.
 *   2. checkForUpdate() — fetches the manifest, applies rollout/native checks.
 *   3. On the very first cold start after install, an eligible bundle is
 *      downloaded and applied immediately via `set()`.
 *   4. On subsequent launches, eligible bundles are staged via `next()` and
 *      activated on the next reopen (Capgo behaviour).
 *
 * Failure handling: failure counter persisted in Preferences; after
 * LIVE_UPDATE_MAX_FAILURES consecutive failures we reset to the native bundle
 * and stop trying until the next native shell update.
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import {
  type LiveUpdateChannel,
  type LiveUpdateCheckResult,
  type LiveUpdateManifest,
  type LiveUpdatePlatform,
  type LiveUpdateState,
  LIVE_UPDATE_MAX_FAILURES,
  LIVE_UPDATE_PATHS,
  compareVersions,
  isInRollout,
} from '@nxt1/core';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import { environment } from '../../../../environments/environment';

const STATE_KEY = 'nxt1.liveUpdate.state.v1';

interface PersistedLiveUpdateState extends LiveUpdateState {
  /** Ensures "download + set()" only happens on the first cold start after install. */
  readonly firstLaunchHandled?: boolean;
}

interface LiveUpdaterPlugin {
  notifyAppReady(): Promise<void>;
  download(options: {
    url: string;
    version: string;
    checksum?: string;
  }): Promise<{ id: string; version: string }>;
  next(options: { id: string }): Promise<void>;
  set(options: { id: string }): Promise<void>;
  reset(options?: { toLastSuccessful?: boolean }): Promise<void>;
  current(): Promise<{ bundle: { id: string; version: string } }>;
}

@Injectable({ providedIn: 'root' })
export class LiveUpdateService {
  private readonly firestore = inject(Firestore);
  private readonly logger: ILogger = inject(NxtLoggingService).child('LiveUpdateService');
  private readonly toast = inject(NxtToastService);

  private readonly _checking = signal(false);
  private readonly _applying = signal(false);
  private readonly _updateStaged = signal(false);
  private readonly _currentVersion = signal<string | null>(null);
  private readonly _lastResult = signal<LiveUpdateCheckResult | null>(null);

  readonly checking = computed(() => this._checking());
  readonly applying = computed(() => this._applying());
  /** True after a new bundle has been successfully staged (ready on next launch). */
  readonly updateStaged = computed(() => this._updateStaged());
  readonly currentVersion = computed(() => this._currentVersion());
  readonly lastResult = computed(() => this._lastResult());

  /** Local Xcode/dev bundles should never be replaced by staged OTA content. */
  readonly otaEnabled = computed(() => !this.isLocalDevelopmentBuild);

  private get isLocalDevelopmentBuild(): boolean {
    return (
      !environment.production &&
      (environment.appVersion.includes('-dev') || environment.apiUrl.startsWith('http://'))
    );
  }

  /** Resolved channel for the currently running build. */
  private get channel(): LiveUpdateChannel {
    return environment.production ? 'production' : 'staging';
  }

  /**
   * Lazily resolves the Capgo updater plugin. We avoid a static import so the
   * web build (and SSR) doesn't pull native code paths.
   */
  private updaterInstance: LiveUpdaterPlugin | null = null;
  private updaterLoaded = false;

  /**
   * Capacitor's registerPlugin() returns a Proxy that traps ALL property
   * access — including `.then()`. The Promise/A+ spec requires that any
   * value resolved from a Promise is checked for a `.then()` method
   * (thenable assimilation). This means we can NEVER resolve a Promise
   * with a Capacitor plugin Proxy, or the runtime will call `.then()`
   * on it and the native bridge will throw.
   *
   * Solution: load the plugin synchronously into a field via a void
   * Promise, then access it via a sync getter.
   */
  private ensureUpdaterLoaded(): Promise<void> {
    if (this.updaterLoaded) return Promise.resolve();
    if (!Capacitor.isNativePlatform()) {
      this.updaterLoaded = true;
      return Promise.resolve();
    }
    return import('@capgo/capacitor-updater').then(
      (mod) => {
        this.updaterInstance = mod.CapacitorUpdater as unknown as LiveUpdaterPlugin;
        this.updaterLoaded = true;
      },
      (err) => {
        this.logger.warn('Capgo updater plugin not installed; skipping OTA', { err: String(err) });
        this.updaterLoaded = true;
      }
    );
  }

  /**
   * Run the full OTA check + apply flow. Safe to call on every cold start;
   * silently no-ops on web and when the plugin is missing.
   */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this._lastResult.set({ status: 'skipped', reason: 'not-native' });
      return;
    }

    if (this.isLocalDevelopmentBuild) {
      this.logger.info('Skipping OTA for local development build', {
        appVersion: environment.appVersion,
        apiUrl: environment.apiUrl,
      });
      this._lastResult.set({ status: 'skipped', reason: 'disabled' });
      this._currentVersion.set(null);
      return;
    }

    await this.ensureUpdaterLoaded();
    const updater = this.updaterInstance;
    if (!updater) {
      this._lastResult.set({ status: 'skipped', reason: 'not-native' });
      return;
    }

    // Mark the previously applied bundle as good. If the app got this far
    // without crashing, the bundle is healthy.
    try {
      await updater.notifyAppReady();
    } catch (err) {
      this.logger.warn('notifyAppReady failed', { err: String(err) });
    }

    // Persist the currently active version for diagnostics.
    try {
      const current = await updater.current();
      this._currentVersion.set(current.bundle?.version ?? null);
    } catch {
      this._currentVersion.set(null);
    }

    const forceImmediateOnFirstLaunch = !(await this.hasHandledFirstLaunch());

    try {
      const result = await this.checkForUpdate(updater);
      this._lastResult.set(result);

      if (result.status === 'available') {
        await this.applyUpdate(updater, result.manifest, {
          immediate: forceImmediateOnFirstLaunch,
        });
      }
    } finally {
      if (forceImmediateOnFirstLaunch) {
        await this.markFirstLaunchHandled();
      }
    }
  }

  /**
   * Pure check (no apply). Useful for surfacing "Update available" UI without
   * triggering the download immediately.
   */
  async checkForUpdate(_updater?: LiveUpdaterPlugin | null): Promise<LiveUpdateCheckResult> {
    if (!Capacitor.isNativePlatform()) {
      return { status: 'skipped', reason: 'not-native' };
    }

    if (this.isLocalDevelopmentBuild) {
      return { status: 'skipped', reason: 'disabled' };
    }

    this._checking.set(true);
    try {
      const platform = Capacitor.getPlatform() as LiveUpdatePlatform;
      const manifest = await this.fetchManifest(platform, this.channel);

      if (!manifest) {
        return { status: 'up-to-date', currentVersion: this._currentVersion() };
      }

      if (!manifest.enabled) {
        return { status: 'skipped', reason: 'disabled' };
      }

      // Native shell version gate.
      const nativeInfo = await CapacitorApp.getInfo();
      const nativeVersion = nativeInfo.version;
      if (compareVersions(nativeVersion, manifest.minNativeVersion) < 0) {
        this.logger.info('OTA skipped: native shell too old', {
          nativeVersion,
          required: manifest.minNativeVersion,
        });
        return { status: 'skipped', reason: 'native-too-old' };
      }

      // Already running this version (or newer).
      const current = this._currentVersion();
      if (current && compareVersions(current, manifest.version) >= 0) {
        return { status: 'up-to-date', currentVersion: current };
      }

      // Honour rollout percentage.
      const installId = await this.getInstallId();
      if (!isInRollout(installId, manifest.rolloutPercentage)) {
        return { status: 'skipped', reason: 'rollout-excluded' };
      }

      // Respect failure circuit breaker.
      const state = await this.loadState();
      if (state.failureCount >= LIVE_UPDATE_MAX_FAILURES) {
        this.logger.warn('OTA disabled after repeated failures', {
          failureCount: state.failureCount,
        });
        return { status: 'skipped', reason: 'previous-failures' };
      }

      return { status: 'available', manifest, currentVersion: current };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('OTA check failed', err, { channel: this.channel });
      return { status: 'error', error: message };
    } finally {
      this._checking.set(false);
    }
  }

  /**
   * Pure OTA check — no `notifyAppReady`, no download, no apply.
   * Updates the `lastResult` signal so the dev UI reflects the outcome.
   * Safe to call from developer tools at any time.
   */
  async checkOnly(): Promise<LiveUpdateCheckResult> {
    const result = await this.checkForUpdate();
    this._lastResult.set(result);
    return result;
  }

  /**
   * Re-reads the currently active Capgo bundle from the native plugin and
   * refreshes the `currentVersion` signal. Safe to call at any time —
   * no-ops on web and when the plugin is not installed.
   *
   * Call this from developer tools whenever you need an up-to-date view of
   * the active bundle (e.g., when the Dev Settings page opens, or after an
   * OTA operation completes).
   */
  async refreshCurrentVersion(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await this.ensureUpdaterLoaded();
    const updater = this.updaterInstance;
    if (!updater) return;
    try {
      const current = await updater.current();
      this._currentVersion.set(current.bundle?.version ?? null);
    } catch {
      this._currentVersion.set(null);
    }
  }

  /**
   * Fetch the raw Firestore manifest for the current platform + channel.
   * Returns null when not on a native platform or when no document exists.
   * Used by developer tools for diagnostics.
   */
  async getManifest(): Promise<LiveUpdateManifest | null> {
    if (!Capacitor.isNativePlatform()) return null;
    if (this.isLocalDevelopmentBuild) return null;
    try {
      const platform = Capacitor.getPlatform() as LiveUpdatePlatform;
      return await this.fetchManifest(platform, this.channel);
    } catch {
      return null;
    }
  }

  /**
   * Download the latest OTA bundle and apply it **immediately** (uses
   * `set()` instead of `next()` so the WebView reloads right away).
   * For developer / QA use only — do not call in production flows.
   */
  async downloadAndApplyNow(): Promise<void> {
    if (!Capacitor.isNativePlatform()) throw new Error('Not running on a native platform');
    if (this.isLocalDevelopmentBuild) {
      throw new Error('OTA is disabled for local development builds');
    }
    await this.ensureUpdaterLoaded();
    const updater = this.updaterInstance;
    if (!updater) throw new Error('Capgo updater plugin not available');

    const platform = Capacitor.getPlatform() as LiveUpdatePlatform;
    const manifest = await this.fetchManifest(platform, this.channel);
    if (!manifest) throw new Error('No OTA manifest found in Firestore');
    if (!manifest.enabled) throw new Error('OTA is disabled in the manifest');

    this._applying.set(true);
    try {
      this.logger.info('DEV: Force-downloading OTA bundle', { version: manifest.version });
      const bundle = await updater.download({
        url: manifest.bundleUrl,
        version: manifest.version,
        checksum: manifest.bundleHash,
      });
      // set() = apply immediately (WebView reloads now)
      await updater.set({ id: bundle.id });
      this.logger.info('DEV: OTA bundle applied immediately', { version: manifest.version });
      await this.saveState({
        currentVersion: manifest.version,
        lastCheckedAt: new Date().toISOString(),
        failureCount: 0,
      });
      this._currentVersion.set(manifest.version);
    } finally {
      this._applying.set(false);
    }
  }

  /**
   * Force-reset to the native shell bundle. Used when a bundle keeps
   * crashing or for manual rollback.
   */
  async resetToNativeBundle(): Promise<void> {
    await this.ensureUpdaterLoaded();
    const updater = this.updaterInstance;
    if (!updater) return;
    try {
      await updater.reset({ toLastSuccessful: false });
      this._currentVersion.set(null);
      await this.saveState({
        currentVersion: null,
        lastCheckedAt: new Date().toISOString(),
        failureCount: 0,
      });
      this.logger.info('OTA bundle reset to native shell');
    } catch (err) {
      this.logger.error('OTA reset failed', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────────

  private async applyUpdate(
    updater: LiveUpdaterPlugin,
    manifest: LiveUpdateManifest,
    options: { immediate?: boolean } = {}
  ): Promise<void> {
    // Don't burn user's cellular data with bundle downloads.
    try {
      const status = await Network.getStatus();
      if (status.connectionType !== 'wifi' && status.connectionType !== 'unknown') {
        this.logger.info('OTA deferred: not on Wi-Fi', {
          connectionType: status.connectionType,
        });
        return;
      }
    } catch {
      // If Network plugin fails, fall through and try anyway.
    }

    this._applying.set(true);
    this._updateStaged.set(false);
    // Notify user that a background update is in progress.
    this.toast.info('Downloading update...');
    const state = await this.loadState();
    try {
      this.logger.info('OTA download starting', {
        version: manifest.version,
        size: manifest.bundleSize,
        immediate: options.immediate === true,
      });
      const bundle = await updater.download({
        url: manifest.bundleUrl,
        version: manifest.version,
        checksum: manifest.bundleHash,
      });

      if (options.immediate) {
        // Persist the first-launch marker before `set()` reloads the WebView.
        await this.saveState(
          {
            currentVersion: manifest.version,
            lastCheckedAt: new Date().toISOString(),
            failureCount: 0,
          },
          { firstLaunchHandled: true }
        );
        this._currentVersion.set(manifest.version);
        this.logger.info('OTA bundle applying immediately on first launch', {
          version: manifest.version,
        });
        this.toast.info('Installing latest update...');
        await updater.set({ id: bundle.id });
        return;
      }

      // Use next() instead of set() so we DON'T destroy the user's current
      // session. The new bundle is applied automatically when the app is
      // backgrounded or killed and reopened (Apple-friendly UX).
      await updater.next({ id: bundle.id });
      this._updateStaged.set(true);
      this.logger.info('OTA bundle staged for next launch', {
        version: manifest.version,
      });
      // Inform the user the update is ready and will apply on next launch.
      this.toast.success('Update ready! Close and reopen the app to apply.');
      await this.saveState({
        currentVersion: manifest.version,
        lastCheckedAt: new Date().toISOString(),
        failureCount: 0,
      });
    } catch (err) {
      const failureCount = state.failureCount + 1;
      this.logger.error('OTA apply failed', err, {
        version: manifest.version,
        failureCount,
        immediate: options.immediate === true,
      });
      await this.saveState({
        ...state,
        lastCheckedAt: new Date().toISOString(),
        failureCount,
      });
    } finally {
      this._applying.set(false);
    }
  }

  private async fetchManifest(
    platform: LiveUpdatePlatform,
    channel: LiveUpdateChannel
  ): Promise<LiveUpdateManifest | null> {
    const docId = LIVE_UPDATE_PATHS.manifestDocId(platform, channel);
    const ref = doc(this.firestore, LIVE_UPDATE_PATHS.COLLECTION, docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as LiveUpdateManifest;
    // Defensive: ensure the doc isn't malformed.
    if (
      typeof data.version !== 'string' ||
      typeof data.bundleUrl !== 'string' ||
      typeof data.bundleHash !== 'string'
    ) {
      this.logger.warn('OTA manifest malformed', { docId });
      return null;
    }
    return data;
  }

  private async getInstallId(): Promise<string> {
    try {
      const id = await Device.getId();
      return id.identifier;
    } catch {
      return 'unknown';
    }
  }

  private async loadState(): Promise<LiveUpdateState> {
    const state = await this.loadPersistedState();
    return {
      currentVersion: state.currentVersion,
      lastCheckedAt: state.lastCheckedAt,
      failureCount: state.failureCount,
    };
  }

  private async loadPersistedState(): Promise<PersistedLiveUpdateState> {
    try {
      const { value } = await Preferences.get({ key: STATE_KEY });
      if (value) {
        const state = JSON.parse(value) as Partial<PersistedLiveUpdateState>;
        return {
          currentVersion: state.currentVersion ?? null,
          lastCheckedAt: state.lastCheckedAt ?? null,
          failureCount: state.failureCount ?? 0,
          firstLaunchHandled: state.firstLaunchHandled === true,
        };
      }
    } catch {
      /* fall through */
    }
    return {
      currentVersion: null,
      lastCheckedAt: null,
      failureCount: 0,
      firstLaunchHandled: false,
    };
  }

  private async saveState(
    state: LiveUpdateState,
    options: { firstLaunchHandled?: boolean } = {}
  ): Promise<void> {
    try {
      const existing = await this.loadPersistedState();
      await Preferences.set({
        key: STATE_KEY,
        value: JSON.stringify({
          ...existing,
          ...state,
          firstLaunchHandled: options.firstLaunchHandled ?? existing.firstLaunchHandled ?? false,
        } satisfies PersistedLiveUpdateState),
      });
    } catch (err) {
      this.logger.warn('Failed to persist OTA state', { err: String(err) });
    }
  }

  private async hasHandledFirstLaunch(): Promise<boolean> {
    const state = await this.loadPersistedState();
    return state.firstLaunchHandled === true;
  }

  private async markFirstLaunchHandled(): Promise<void> {
    const state = await this.loadPersistedState();
    if (state.firstLaunchHandled) return;
    await this.saveState(state, { firstLaunchHandled: true });
  }
}
