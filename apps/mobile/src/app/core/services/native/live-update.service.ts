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
 *   3. If a new bundle is eligible → download → set as active.
 *   4. The plugin reloads the WebView the next time the app is brought to
 *      foreground (Capgo behaviour) so the new code takes effect cleanly.
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
import type { ILogger } from '@nxt1/core/logging';
import { environment } from '../../../../environments/environment';

const STATE_KEY = 'nxt1.liveUpdate.state.v1';

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

  private readonly _checking = signal(false);
  private readonly _applying = signal(false);
  private readonly _currentVersion = signal<string | null>(null);
  private readonly _lastResult = signal<LiveUpdateCheckResult | null>(null);

  readonly checking = computed(() => this._checking());
  readonly applying = computed(() => this._applying());
  readonly currentVersion = computed(() => this._currentVersion());
  readonly lastResult = computed(() => this._lastResult());

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

    const result = await this.checkForUpdate(updater);
    this._lastResult.set(result);

    if (result.status === 'available') {
      await this.applyUpdate(updater, result.manifest);
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
    manifest: LiveUpdateManifest
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
    const state = await this.loadState();
    try {
      this.logger.info('OTA download starting', {
        version: manifest.version,
        size: manifest.bundleSize,
      });
      const bundle = await updater.download({
        url: manifest.bundleUrl,
        version: manifest.version,
        checksum: manifest.bundleHash,
      });
      // Use next() instead of set() so we DON'T destroy the user's current
      // session. The new bundle is applied automatically when the app is
      // backgrounded or killed and reopened (Apple-friendly UX).
      await updater.next({ id: bundle.id });
      this.logger.info('OTA bundle staged for next launch', {
        version: manifest.version,
      });
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
    try {
      const { value } = await Preferences.get({ key: STATE_KEY });
      if (value) return JSON.parse(value) as LiveUpdateState;
    } catch {
      /* fall through */
    }
    return { currentVersion: null, lastCheckedAt: null, failureCount: 0 };
  }

  private async saveState(state: LiveUpdateState): Promise<void> {
    try {
      await Preferences.set({ key: STATE_KEY, value: JSON.stringify(state) });
    } catch (err) {
      this.logger.warn('Failed to persist OTA state', { err: String(err) });
    }
  }
}
