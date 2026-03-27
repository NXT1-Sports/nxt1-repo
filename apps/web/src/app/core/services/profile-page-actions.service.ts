/**
 * @fileoverview Profile Page Actions Service
 * @module @nxt1/web/core/services
 *
 * Lightweight signal-based bus that allows the global web-shell's mobile
 * top nav buttons (pencil / three-dot) to trigger profile-page actions
 * (edit, more) without coupling the shell to profile-specific services.
 *
 * Pattern:
 *   web-shell calls `requestEdit()` / `requestMore()`
 *   profile.component reads the signals via effect() and handles them
 */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProfilePageActionsService {
  private readonly _editRequested = signal(0);
  private readonly _moreRequested = signal(0);

  /** Incremented each time the top-nav pencil button is tapped */
  readonly editRequested = this._editRequested.asReadonly();

  /** Incremented each time the top-nav three-dot button is tapped */
  readonly moreRequested = this._moreRequested.asReadonly();

  /** Called by web-shell when the edit (pencil) top-nav button is tapped */
  requestEdit(): void {
    this._editRequested.update((n) => n + 1);
  }

  /** Called by web-shell when the more (three-dot) top-nav button is tapped */
  requestMore(): void {
    this._moreRequested.update((n) => n + 1);
  }

  // ──────────────────────────────────────────────────────────
  // Page-level action visibility — set by page components
  // (team / profile) so the shell knows what buttons to show.
  // ──────────────────────────────────────────────────────────

  private readonly _showEdit = signal(false);
  private readonly _showMore = signal(false);

  /** True when the current page wants the pencil button visible */
  readonly showEditButton = this._showEdit.asReadonly();

  /** True when the current page wants the three-dot button visible */
  readonly showMoreButton = this._showMore.asReadonly();

  /** Called by page components (e.g. TeamComponent) to configure mobile action buttons */
  setMobileActions(options: { showEdit: boolean; showMore: boolean }): void {
    this._showEdit.set(options.showEdit);
    this._showMore.set(options.showMore);
  }

  /** Called on destroy to reset buttons when leaving the page */
  clearMobileActions(): void {
    this._showEdit.set(false);
    this._showMore.set(false);
  }
}
