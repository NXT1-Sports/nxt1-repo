/**
 * @fileoverview Release Notes Modal Service — Adaptive What's New modal
 * @module @nxt1/ui/release-notes
 *
 * Checks whether the user has seen the latest release, then presents a
 * platform-adaptive modal:
 * - Native mobile  → NxtBottomSheetService (Ionic drag sheet)
 * - Web / desktop  → NxtOverlayService (pure Angular centered overlay)
 *
 * Call `checkAndPrompt()` once after auth resolves on app boot.
 */

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtPlatformService } from '../services/platform';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { NxtOverlayService } from '../components/overlay';
import { NxtLoggingService } from '../services/logging';
import { NxtBreadcrumbService } from '../services/breadcrumb';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { SystemReleaseNote } from '@nxt1/core';
import { NxtReleaseNotesContentComponent } from './release-notes-content.component';
import { NxtReleaseNotesModalComponent } from './release-notes-modal.component';

const LS_KEY = 'nxt1_last_seen_release';
const PROMPT_DELAY_MS = 1500;

/** Compare two semver strings; returns true when `incoming` is newer than `seen`. */
function isNewer(incoming: string, seen: string | null | undefined): boolean {
  if (!seen) return true;
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [ia, ib, ic] = parse(incoming);
  const [sa, sb, sc] = parse(seen);
  if (ia !== sa) return ia > sa;
  if (ib !== sb) return ib > sb;
  return ic > sc;
}

@Injectable({ providedIn: 'root' })
export class ReleaseNotesModalService {
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger = inject(NxtLoggingService).child('ReleaseNotesModalService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  private readonly _latestNote = signal<SystemReleaseNote | null>(null);
  private readonly _loading = signal(false);

  readonly latestNote = computed(() => this._latestNote());
  readonly loading = computed(() => this._loading());

  /**
   * Fetch the latest release note and show the modal if it is newer than
   * what the user has last seen.
   *
   * @param getLatest  - Async function that fetches the latest SystemReleaseNote
   * @param lastSeenVersion - Version from the user's stored preferences (may be undefined for new users)
   * @param onDismiss  - Called after modal closes; receives the `lastSeenVersion` to persist
   */
  async checkAndPrompt(
    getLatest: () => Promise<SystemReleaseNote | null>,
    lastSeenVersion: string | null | undefined,
    onDismiss: (version: string) => Promise<void>
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this._loading.set(true);
    this.breadcrumb.trackStateChange('release-notes: checking');

    try {
      const note = await getLatest();
      this._latestNote.set(note);

      if (!note) return;

      // Prefer in-memory preference value; fall back to localStorage
      const localSeen = localStorage.getItem(LS_KEY);
      const effectiveSeen = lastSeenVersion || localSeen;

      if (!isNewer(note.version, effectiveSeen)) return;

      this.logger.info('New release note detected — scheduling prompt', { version: note.version });
      this.breadcrumb.trackStateChange(`release-notes: prompt-scheduled v${note.version}`);

      await new Promise<void>((resolve) => setTimeout(resolve, PROMPT_DELAY_MS));

      await this.openModal(note);
      await this.markSeen(note.version, onDismiss);
    } catch (err) {
      this.logger.error('Failed to check / prompt release notes', err as Error);
    } finally {
      this._loading.set(false);
    }
  }

  /** Manually open the release notes modal for a specific note (e.g., from Settings). */
  async openModal(note: SystemReleaseNote): Promise<void> {
    this.analytics?.trackEvent(APP_EVENTS.RELEASE_NOTES_VIEWED, { version: note.version });
    this.breadcrumb.trackStateChange(`release-notes: modal-opened v${note.version}`);
    this.logger.info('Opening release notes modal', { version: note.version });

    if (this.platform.isNative()) {
      await this.openBottomSheet(note);
    } else {
      await this.openOverlay(note);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async openBottomSheet(note: SystemReleaseNote): Promise<void> {
    await this.bottomSheet.openSheet({
      component: NxtReleaseNotesModalComponent,
      componentProps: { note },
      ...SHEET_PRESETS.TALL,
      showHandle: true,
      backdropDismiss: true,
      canDismiss: true,
      cssClass: 'nxt1-release-notes-modal',
    });
  }

  private async openOverlay(note: SystemReleaseNote): Promise<void> {
    const ref = this.overlay.open<NxtReleaseNotesContentComponent, { action: string }>({
      component: NxtReleaseNotesContentComponent,
      inputs: { note },
      size: 'md',
      showCloseButton: true,
      backdropDismiss: true,
      ariaLabel: `What's New in NXT1 ${note.version}`,
    });
    await ref.closed;
  }

  private async markSeen(
    version: string,
    onDismiss: (version: string) => Promise<void>
  ): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(LS_KEY, version);
    }
    try {
      await onDismiss(version);
    } catch (err) {
      this.logger.warn('Failed to persist lastSeenReleaseVersion to backend', {
        error: String(err),
      });
    }
    this.logger.info('Marked release note as seen', { version });
  }
}
