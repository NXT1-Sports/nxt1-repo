/**
 * @fileoverview Developer Settings Page Component
 * @module @nxt1/mobile/features
 *
 * Hidden developer settings page for testing Crashlytics and other debug features.
 * Only accessible in non-production builds.
 *
 * Following Firebase 2026 best practices:
 * @see https://firebase.google.com/docs/crashlytics/ios/test-implementation
 * @see https://firebase.google.com/docs/crashlytics/android/test-implementation
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonBadge,
  IonToggle,
  IonSpinner,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  bugOutline,
  warningOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  refreshOutline,
  cloudUploadOutline,
  cloudDownloadOutline,
  personOutline,
  keyOutline,
  analyticsOutline,
  sendOutline,
  trashOutline,
  informationCircleOutline,
  documentTextOutline,
  flashOutline,
  wifiOutline,
} from 'ionicons/icons';

import { CrashlyticsService } from '../../core/services/infrastructure/crashlytics.service';
import { LiveUpdateService } from '../../core/services/native/live-update.service';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { CRASH_KEYS } from '@nxt1/core/crashlytics';
import { environment } from '../../../environments/environment';

/**
 * Developer Settings Page
 *
 * Provides test controls for Firebase Crashlytics verification.
 * Features:
 * - Force test crash (fatal)
 * - Record non-fatal errors
 * - Set test user context
 * - Add custom keys
 * - Add breadcrumbs
 * - Send unsent reports
 * - Check Crashlytics status
 */
@Component({
  selector: 'app-dev-settings',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonBackButton,
    IonButtons,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonBadge,
    IonToggle,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" />
        </ion-buttons>
        <ion-title>Developer Settings</ion-title>
        <ion-buttons slot="end">
          <ion-badge color="warning">DEV ONLY</ion-badge>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Environment Info -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            <ion-icon name="information-circle-outline" /> Environment
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item>
              <ion-label>
                <h3>Environment</h3>
                <p>{{ isProduction() ? 'Production' : 'Development/Staging' }}</p>
              </ion-label>
              <ion-badge slot="end" [color]="isProduction() ? 'danger' : 'success'">
                {{ isProduction() ? 'PROD' : 'DEV' }}
              </ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Firebase Project</h3>
                <p>{{ firebaseProject() }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>App Version</h3>
                <p>{{ appVersion() }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- OTA Live Update Debug -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            <ion-icon name="refresh-outline" /> OTA Live Update
            @if (otaChecking()) {
              <ion-spinner name="crescent" style="width:18px;height:18px;margin-left:8px" />
            }
            @if (otaApplying()) {
              <ion-spinner
                name="dots"
                color="warning"
                style="width:18px;height:18px;margin-left:8px"
              />
            }
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <!-- Status grid -->
          <ion-list lines="none">
            <ion-item>
              <ion-label>
                <h3>Platform / Channel</h3>
                <p>{{ otaPlatform() }} — {{ otaChannel() }}</p>
              </ion-label>
              <ion-badge slot="end" color="primary">{{ otaChannel() }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Native Binary Version</h3>
                <p>
                  {{ nativeVersion() || '(fetching…)'
                  }}{{ nativeBuildNumber() ? ' (' + nativeBuildNumber() + ')' : '' }}
                </p>
              </ion-label>
              <ion-badge slot="end" color="tertiary">BINARY</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Active Bundle (Capgo)</h3>
                <p>{{ otaCurrentVersion() ?? '(native shell — no OTA applied)' }}</p>
              </ion-label>
              <ion-badge slot="end" [color]="otaCurrentVersion() ? 'success' : 'medium'">
                {{ otaCurrentVersion() ? 'OTA' : 'NATIVE' }}
              </ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Last Check Result</h3>
                <p>{{ otaLastResultText() }}</p>
              </ion-label>
              <ion-badge slot="end" [color]="otaStatusColor()">{{ otaStatusBadge() }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Circuit Breaker</h3>
                <p>
                  {{ otaFailureCount() }} / 3 failures —
                  {{ otaFailureCount() >= 3 ? '🔴 TRIPPED (OTA blocked)' : '🟢 OK' }}
                </p>
              </ion-label>
              <ion-badge slot="end" [color]="otaFailureCount() >= 3 ? 'danger' : 'success'">
                {{ otaFailureCount() >= 3 ? 'TRIPPED' : 'OK' }}
              </ion-badge>
            </ion-item>
            <ion-item>
              <ion-label>
                <h3>Last Checked At</h3>
                <p>{{ otaLastCheckedAt() ?? 'never' }}</p>
              </ion-label>
            </ion-item>
          </ion-list>

          <!-- Actions -->
          <ion-list lines="full" style="margin-top: 8px">
            <ion-item button detail="false" [disabled]="otaChecking()" (click)="otaForceCheck()">
              <ion-icon name="refresh-outline" slot="start" color="primary" />
              <ion-label>
                <h2>Check for Update</h2>
                <p>Pure check — shows detailed result alert (no download)</p>
              </ion-label>
              @if (otaChecking()) {
                <ion-spinner slot="end" name="crescent" />
              }
            </ion-item>

            <ion-item button detail="false" (click)="otaFetchManifest()">
              <ion-icon name="document-text-outline" slot="start" color="secondary" />
              <ion-label>
                <h2>Fetch Firestore Manifest</h2>
                <p>Show raw manifest doc from AppUpdates collection</p>
              </ion-label>
            </ion-item>

            <ion-item
              button
              detail="false"
              [disabled]="otaApplying()"
              (click)="otaDownloadApplyNow()"
            >
              <ion-icon name="flash-outline" slot="start" color="warning" />
              <ion-label>
                <h2>Download &amp; Apply NOW</h2>
                <p>Force-download bundle and reload WebView immediately (set)</p>
              </ion-label>
              @if (otaApplying()) {
                <ion-spinner slot="end" name="dots" color="warning" />
              }
            </ion-item>

            <ion-item button detail="false" (click)="otaResetCircuitBreaker()">
              <ion-icon name="warning-outline" slot="start" color="warning" />
              <ion-label>
                <h2>Reset Circuit Breaker</h2>
                <p>Clear failure count — allows OTA to retry</p>
              </ion-label>
            </ion-item>

            <ion-item button detail="false" (click)="otaResetToNative()">
              <ion-icon name="trash-outline" slot="start" color="danger" />
              <ion-label>
                <h2>Reset to Native Bundle</h2>
                <p>Rollback to built-in JS — removes all OTA bundles</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Crashlytics Status -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            <ion-icon name="analytics-outline" /> Crashlytics Status
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item>
              <ion-icon
                name="checkmark-circle-outline"
                slot="start"
                [color]="crashlyticsReady() ? 'success' : 'medium'"
              />
              <ion-label>
                <h3>SDK Ready</h3>
                <p>{{ crashlyticsReady() ? 'Initialized' : 'Not initialized' }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-icon
                name="cloud-upload-outline"
                slot="start"
                [color]="crashlyticsEnabled() ? 'success' : 'warning'"
              />
              <ion-label>
                <h3>Collection Enabled</h3>
                <p>{{ crashlyticsEnabled() ? 'Active' : 'Disabled' }}</p>
              </ion-label>
              <ion-toggle
                slot="end"
                [checked]="crashlyticsEnabled()"
                (ionChange)="toggleCrashlytics($event)"
              />
            </ion-item>
            <ion-item>
              <ion-icon
                name="alert-circle-outline"
                slot="start"
                [color]="didCrashPreviously() ? 'danger' : 'success'"
              />
              <ion-label>
                <h3>Previous Crash</h3>
                <p>
                  {{ didCrashPreviously() ? 'App crashed on last run' : 'Clean exit on last run' }}
                </p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Test Actions -->
      <ion-card>
        <ion-card-header>
          <ion-card-title> <ion-icon name="bug-outline" /> Test Actions </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p class="ion-padding-bottom" style="color: var(--ion-color-medium)">
            Use these buttons to test your Crashlytics integration. After triggering a crash, reopen
            the app and check the
            <a
              href="https://console.firebase.google.com/project/{{ firebaseProject() }}/crashlytics"
              target="_blank"
            >
              Firebase Console </a
            >.
          </p>

          <ion-list lines="full">
            <!-- Fatal Crash Test -->
            <ion-item button detail="false" (click)="testFatalCrash()">
              <ion-icon name="close-circle-outline" slot="start" color="danger" />
              <ion-label>
                <h2>Force Test Crash</h2>
                <p>Triggers a fatal crash (app will close)</p>
              </ion-label>
              <ion-badge slot="end" color="danger">FATAL</ion-badge>
            </ion-item>

            <!-- Non-Fatal Error -->
            <ion-item button detail="false" (click)="testNonFatalError()">
              <ion-icon name="warning-outline" slot="start" color="warning" />
              <ion-label>
                <h2>Record Non-Fatal Error</h2>
                <p>Logs an error without crashing</p>
              </ion-label>
              <ion-badge slot="end" color="warning">NON-FATAL</ion-badge>
            </ion-item>

            <!-- JavaScript Exception -->
            <ion-item button detail="false" (click)="testJavaScriptException()">
              <ion-icon name="alert-circle-outline" slot="start" color="tertiary" />
              <ion-label>
                <h2>Throw JS Exception</h2>
                <p>Triggers an uncaught JavaScript error</p>
              </ion-label>
              <ion-badge slot="end" color="tertiary">JS ERROR</ion-badge>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Context & Logging -->
      <ion-card>
        <ion-card-header>
          <ion-card-title> <ion-icon name="key-outline" /> Context & Logging </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="full">
            <ion-item button detail="false" (click)="setTestUser()">
              <ion-icon name="person-outline" slot="start" color="primary" />
              <ion-label>
                <h2>Set Test User</h2>
                <p>Sets a test user ID for crash context</p>
              </ion-label>
            </ion-item>

            <ion-item button detail="false" (click)="addTestCustomKeys()">
              <ion-icon name="key-outline" slot="start" color="secondary" />
              <ion-label>
                <h2>Add Custom Keys</h2>
                <p>Adds test custom keys for filtering</p>
              </ion-label>
            </ion-item>

            <ion-item button detail="false" (click)="addTestBreadcrumb()">
              <ion-icon name="analytics-outline" slot="start" color="success" />
              <ion-label>
                <h2>Add Breadcrumb</h2>
                <p>Logs a navigation breadcrumb</p>
              </ion-label>
            </ion-item>

            <ion-item button detail="false" (click)="logTestMessage()">
              <ion-icon name="send-outline" slot="start" color="medium" />
              <ion-label>
                <h2>Log Message</h2>
                <p>Sends a custom log message</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Report Management -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            <ion-icon name="cloud-upload-outline" /> Report Management
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="full">
            <ion-item button detail="false" (click)="sendUnsentReports()">
              <ion-icon name="cloud-upload-outline" slot="start" color="primary" />
              <ion-label>
                <h2>Send Unsent Reports</h2>
                <p>Forces upload of any pending crash reports</p>
              </ion-label>
            </ion-item>

            <ion-item button detail="false" (click)="deleteUnsentReports()">
              <ion-icon name="trash-outline" slot="start" color="danger" />
              <ion-label>
                <h2>Delete Unsent Reports</h2>
                <p>Clears any pending crash reports</p>
              </ion-label>
            </ion-item>

            <ion-item button detail="false" (click)="refreshStatus()">
              <ion-icon name="refresh-outline" slot="start" color="medium" />
              <ion-label>
                <h2>Refresh Status</h2>
                <p>Re-check Crashlytics status</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <!-- Instructions -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Testing Instructions</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ol style="padding-left: 20px; color: var(--ion-color-medium-shade)">
            <li>
              <strong>Build the app</strong> in Release mode (Debug builds may intercept crashes)
            </li>
            <li>
              <strong>Disconnect the debugger</strong> - Run app from device home screen, not
              Xcode/Android Studio
            </li>
            <li><strong>Trigger a test crash</strong> using the "Force Test Crash" button above</li>
            <li><strong>Reopen the app</strong> - This sends the crash report to Firebase</li>
            <li><strong>Wait 5-10 minutes</strong> - Check the Firebase Console for your crash</li>
          </ol>
          <p style="margin-top: 16px; color: var(--ion-color-warning-shade)">
            <strong>⚠️ Important:</strong> The Xcode/Android Studio debugger prevents crash reports
            from being sent. Always test crashes with the debugger disconnected.
          </p>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [
    `
      ion-card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
      }

      ion-card-title ion-icon {
        font-size: 20px;
      }

      ion-item h2 {
        font-weight: 500;
      }

      ion-item h3 {
        font-weight: 500;
        margin-bottom: 4px;
      }

      a {
        color: var(--ion-color-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevSettingsComponent {
  private readonly crashlytics = inject(CrashlyticsService);
  private readonly liveUpdate = inject(LiveUpdateService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  // Computed values from environment
  readonly isProduction = signal(environment.production);
  readonly firebaseProject = signal(environment.firebase.projectId);
  readonly appVersion = signal(environment.appVersion);

  // Crashlytics status signals
  readonly crashlyticsReady = signal(false);
  readonly crashlyticsEnabled = signal(false);
  readonly didCrashPreviously = signal(false);

  // Native binary version (from CapacitorApp.getInfo() — used for minNativeVersion check)
  readonly nativeVersion = signal('');
  readonly nativeBuildNumber = signal('');

  // OTA signals — live from service
  readonly otaCurrentVersion = this.liveUpdate.currentVersion;
  readonly otaChecking = this.liveUpdate.checking;
  readonly otaApplying = this.liveUpdate.applying;
  readonly otaFailureCount = signal(0);
  readonly otaLastCheckedAt = signal<string | null>(null);
  readonly otaPlatform = signal(Capacitor.getPlatform());
  readonly otaChannel = signal(environment.production ? 'production' : 'staging');

  readonly otaLastResultText = computed(() => {
    const r = this.liveUpdate.lastResult();
    if (!r) return '(not checked yet — tap "Check for Update")';
    if (r.status === 'skipped') return `skipped: ${r.reason}`;
    if (r.status === 'error') return `error: ${r.error}`;
    if (r.status === 'available')
      return `🆕 available → v${r.manifest.version} (minNative: ${r.manifest.minNativeVersion})`;
    return `✅ up-to-date (${r.currentVersion ?? 'native shell'})`;
  });
  readonly otaStatusColor = computed(() => {
    const r = this.liveUpdate.lastResult();
    if (!r) return 'medium';
    if (r.status === 'error') return 'danger';
    if (r.status === 'skipped') return 'warning';
    if (r.status === 'available') return 'success';
    return 'primary';
  });
  readonly otaStatusBadge = computed(() => {
    const r = this.liveUpdate.lastResult();
    if (!r) return '?';
    return r.status.toUpperCase();
  });

  constructor() {
    // Register Ionicons
    addIcons({
      bugOutline,
      warningOutline,
      alertCircleOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      refreshOutline,
      cloudUploadOutline,
      cloudDownloadOutline,
      personOutline,
      keyOutline,
      analyticsOutline,
      sendOutline,
      trashOutline,
      informationCircleOutline,
      documentTextOutline,
      flashOutline,
      wifiOutline,
    });

    // Silent init on page open — no toast
    void this.initializeOtaStatus();
    void this.refreshStatusSilent();
  }

  /** Fetches the real native binary version + refreshes OTA state on page open. */
  private async initializeOtaStatus(): Promise<void> {
    // Fetch the actual native binary version (what the OTA minNativeVersion check uses)
    if (Capacitor.isNativePlatform()) {
      try {
        const info = await CapacitorApp.getInfo();
        this.nativeVersion.set(info.version);
        this.nativeBuildNumber.set(info.build);
      } catch {
        this.nativeVersion.set('(unavailable)');
      }
    } else {
      this.nativeVersion.set('web / browser');
    }

    // Refresh the Capgo active bundle version signal from the plugin
    await this.liveUpdate.refreshCurrentVersion();

    // Sync local OTA state (failure count, last checked at)
    await this.loadOtaState();
  }

  /** Refresh Crashlytics status without showing a toast (used on init). */
  private async refreshStatusSilent(): Promise<void> {
    this.crashlyticsReady.set(this.crashlytics.isReady());
    this.crashlyticsEnabled.set(await this.crashlytics.isEnabled());
    this.didCrashPreviously.set(await this.crashlytics.didCrashOnPreviousExecution());
  }

  async loadOtaState(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'nxt1.liveUpdate.state.v1' });
      if (value) {
        const state = JSON.parse(value) as { failureCount: number; lastCheckedAt: string | null };
        this.otaFailureCount.set(state.failureCount ?? 0);
        this.otaLastCheckedAt.set(state.lastCheckedAt ?? null);
      }
    } catch {
      /* ignore */
    }
  }

  async otaForceCheck(): Promise<void> {
    try {
      // checkOnly() = pure Firestore read, no notifyAppReady, no download
      const result = await this.liveUpdate.checkOnly();
      // Refresh the active bundle version from the plugin and persist state
      await this.liveUpdate.refreshCurrentVersion();
      await this.loadOtaState();

      let title = '';
      let message = '';
      let color: 'success' | 'warning' | 'danger' | 'primary' = 'primary';

      if (result.status === 'skipped') {
        title = 'OTA Skipped';
        color = 'warning';
        const reasons: Record<string, string> = {
          'not-native': 'Running in browser/web — plugin not active',
          disabled: 'OTA is disabled in the Firestore manifest',
          'native-too-old': 'Native shell version is too old for this bundle',
          'rollout-excluded': 'Device is excluded from current rollout %',
          'previous-failures': 'Circuit breaker tripped (3+ failures)',
          'already-current': 'Bundle version already current',
        };
        message =
          reasons[(result as { reason: string }).reason] ??
          `reason: ${(result as { reason: string }).reason}`;
      } else if (result.status === 'up-to-date') {
        title = '✅ Up to Date';
        color = 'success';
        message = `Running: ${result.currentVersion ?? 'native shell'}\nNo newer bundle in Firestore.`;
      } else if (result.status === 'available') {
        title = '🆕 Update Available!';
        color = 'success';
        const m = result.manifest;
        message = [
          `New version: ${m.version}`,
          `Current:     ${result.currentVersion ?? 'native shell'}`,
          `Min native:  ${m.minNativeVersion}`,
          `Rollout:     ${m.rolloutPercentage}%`,
          `Size:        ${(m.bundleSize / 1024).toFixed(1)} KB`,
          `Published:   ${m.publishedAt}`,
          m.releaseNotes ? `Notes: ${m.releaseNotes}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      } else if (result.status === 'error') {
        title = '❌ OTA Check Failed';
        color = 'danger';
        message = result.error;
      }

      const alert = await this.alertController.create({
        header: title,
        message: message.replace(/\n/g, '<br>'),
        buttons: ['OK'],
        cssClass: `ota-result-alert ota-${color}`,
      });
      await alert.present();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.showToast(`OTA check failed: ${message}`, 'danger');
    }
  }

  async otaFetchManifest(): Promise<void> {
    try {
      const manifest = await this.liveUpdate.getManifest();
      if (!manifest) {
        const alert = await this.alertController.create({
          header: 'No Manifest Found',
          message: `No document exists in Firestore at:<br><br><code>AppUpdates/${this.otaPlatform()}_${this.otaChannel()}</code><br><br>OTA has never been deployed to this channel, or the document was deleted.`,
          buttons: ['OK'],
        });
        await alert.present();
        return;
      }

      const lines = [
        `version:      ${manifest.version}`,
        `enabled:      ${manifest.enabled}`,
        `channel:      ${manifest.channel}`,
        `platform:     ${manifest.platform}`,
        `minNative:    ${manifest.minNativeVersion}`,
        `rollout:      ${manifest.rolloutPercentage}%`,
        `size:         ${(manifest.bundleSize / 1024).toFixed(1)} KB`,
        `published:    ${manifest.publishedAt}`,
        `git sha:      ${manifest.gitSha ?? 'n/a'}`,
        `bundleUrl:    ${manifest.bundleUrl.substring(0, 60)}...`,
        `hash(sha256): ${manifest.bundleHash.substring(0, 16)}...`,
        manifest.releaseNotes ? `notes: ${manifest.releaseNotes}` : '',
      ]
        .filter(Boolean)
        .join('<br>');

      const alert = await this.alertController.create({
        header: `📦 Manifest v${manifest.version}`,
        message: `<small>${lines}</small>`,
        buttons: ['OK'],
      });
      await alert.present();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.showToast(`Manifest fetch failed: ${message}`, 'danger');
    }
  }

  async otaDownloadApplyNow(): Promise<void> {
    const confirm = await this.alertController.create({
      header: 'Download & Apply NOW',
      message:
        'This will download the latest bundle from Firestore and immediately reload the WebView (set — not next). The app screen will flash/reload. Proceed?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Apply Now',
          role: 'confirm',
          handler: async () => {
            try {
              await this.liveUpdate.downloadAndApplyNow();
              await this.liveUpdate.refreshCurrentVersion();
              await this.loadOtaState();
              await this.showToast('✅ Bundle applied — WebView reloaded', 'success');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              await this.showToast(`Apply failed: ${message}`, 'danger');
            }
          },
        },
      ],
    });
    await confirm.present();
  }

  async otaResetCircuitBreaker(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: 'nxt1.liveUpdate.state.v1' });
      const state = value ? JSON.parse(value) : {};
      await Preferences.set({
        key: 'nxt1.liveUpdate.state.v1',
        value: JSON.stringify({ ...state, failureCount: 0 }),
      });
      this.otaFailureCount.set(0);
      await this.showToast('Circuit breaker reset — failure count = 0', 'success');
    } catch {
      await this.showToast('Failed to reset', 'danger');
    }
  }

  async otaResetToNative(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reset to Native Bundle',
      message: 'This will rollback to the original built-in JS bundle. The app will reload.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reset',
          role: 'destructive',
          handler: async () => {
            await this.liveUpdate.resetToNativeBundle();
            await this.liveUpdate.refreshCurrentVersion();
            await this.loadOtaState();
            await this.showToast('Reset to native bundle', 'warning');
          },
        },
      ],
    });
    await alert.present();
  }

  async refreshStatus(): Promise<void> {
    this.crashlyticsReady.set(this.crashlytics.isReady());
    this.crashlyticsEnabled.set(await this.crashlytics.isEnabled());
    this.didCrashPreviously.set(await this.crashlytics.didCrashOnPreviousExecution());
    // Also refresh OTA state so "Refresh Status" button updates everything
    await this.liveUpdate.refreshCurrentVersion();
    await this.loadOtaState();
    await this.showToast('Status refreshed', 'success');
  }

  async toggleCrashlytics(event: CustomEvent): Promise<void> {
    const enabled = event.detail.checked;
    await this.crashlytics.setEnabled(enabled);
    this.crashlyticsEnabled.set(enabled);
    await this.showToast(
      `Crashlytics ${enabled ? 'enabled' : 'disabled'}`,
      enabled ? 'success' : 'warning'
    );
  }

  async testFatalCrash(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Force Test Crash',
      message:
        'This will crash the app! Make sure you are NOT connected to the debugger (run from device home screen). ' +
        'After the crash, reopen the app to send the report to Firebase.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Crash Now',
          role: 'destructive',
          handler: async () => {
            // Log that we're about to crash
            await this.crashlytics.log('Test crash triggered by developer from DevSettings');
            await this.crashlytics.setCustomKey('test_crash_time', new Date().toISOString());

            // Trigger the crash
            await this.crashlytics.crash();
          },
        },
      ],
    });
    await alert.present();
  }

  async testNonFatalError(): Promise<void> {
    const error = new Error('NXT1 Test Non-Fatal Error');
    error.name = 'TestNonFatalError';

    await this.crashlytics.recordError(error, 'error');
    await this.showToast('Non-fatal error recorded', 'success');
  }

  async testJavaScriptException(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Throw JS Exception',
      message:
        'This will throw an uncaught JavaScript exception. ' +
        'The global error handler should catch it and report to Crashlytics.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Throw Exception',
          role: 'destructive',
          handler: () => {
            // Throw an uncaught exception after alert closes
            setTimeout(() => {
              throw new Error('NXT1 Test Uncaught JavaScript Exception');
            }, 100);
          },
        },
      ],
    });
    await alert.present();
  }

  async setTestUser(): Promise<void> {
    const testUserId = `test_user_${Date.now()}`;
    await this.crashlytics.setUser({
      userId: testUserId,
      email: 'test@nxt1sports.com',
      displayName: 'Test Developer',
    });
    await this.showToast(`User set: ${testUserId}`, 'success');
  }

  async addTestCustomKeys(): Promise<void> {
    await this.crashlytics.setCustomKeys({
      [CRASH_KEYS.USER_ROLE]: 'athlete',
      [CRASH_KEYS.ACTIVE_SPORT]: 'football',
      [CRASH_KEYS.SCREEN_NAME]: 'dev_settings',
      test_key: 'test_value_' + Date.now(),
      dev_testing: true,
    });
    await this.showToast('Custom keys added', 'success');
  }

  async addTestBreadcrumb(): Promise<void> {
    await this.crashlytics.addBreadcrumb({
      type: 'navigation',
      message: 'Test breadcrumb from DevSettings',
      data: {
        from: '/home',
        to: '/dev-settings',
        timestamp: new Date().toISOString(),
      },
    });
    await this.showToast('Breadcrumb added', 'success');
  }

  async logTestMessage(): Promise<void> {
    const message = `Test log message at ${new Date().toISOString()}`;
    await this.crashlytics.log(message);
    await this.showToast('Message logged', 'success');
  }

  async sendUnsentReports(): Promise<void> {
    await this.crashlytics.sendUnsentReports();
    await this.showToast('Unsent reports sent', 'success');
  }

  async deleteUnsentReports(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete Unsent Reports',
      message: 'This will permanently delete any crash reports that have not been sent yet.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.crashlytics.deleteUnsentReports();
            await this.showToast('Unsent reports deleted', 'warning');
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
      cssClass: ['nxt-toast', `nxt-toast-${color === 'danger' ? 'error' : color}`],
    });

    let isDismissing = false;
    const onTap = (): void => {
      if (isDismissing) {
        return;
      }

      isDismissing = true;
      toast.classList.add('nxt-toast--slide-away');

      setTimeout(() => {
        void toast.dismiss();
      }, 140);
    };

    toast.addEventListener('click', onTap, { passive: true });
    toast.onDidDismiss().then(() => {
      toast.removeEventListener('click', onTap);
    });

    await toast.present();
  }
}
