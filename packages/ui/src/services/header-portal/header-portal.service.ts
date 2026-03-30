/**
 * @fileoverview NxtHeaderPortalService — Contextual Top Nav Center Content
 * @module @nxt1/ui/services/header-portal
 *
 * Allows child pages to "teleport" their own navigation (tabs, breadcrumbs,
 * page title) into the global top nav center slot. This creates a
 * Perplexity / Linear-style contextual header without double headers.
 *
 * Pattern:
 *  - Page injects this service on init and calls setCenterContent(templateRef)
 *  - The NxtHeaderComponent renders the template in its empty center slot
 *  - Page calls clearCenterContent() on destroy (auto-cleanup)
 *
 * SSR-safe: TemplateRef is null on server (no DOM), header renders empty center.
 */

import { Injectable, signal, type TemplateRef } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NxtHeaderPortalService {
  /** The active center content template (set by child pages) */
  private readonly _centerContent = signal<TemplateRef<unknown> | null>(null);

  /** The active right-side action template — rendered inline before the bell */
  private readonly _rightContent = signal<TemplateRef<unknown> | null>(null);

  /** Public readonly accessors */
  readonly centerContent = this._centerContent.asReadonly();
  readonly rightContent = this._rightContent.asReadonly();

  /** Set the center content template for the top nav. */
  setCenterContent(template: TemplateRef<unknown>): void {
    this._centerContent.set(template);
  }

  /** Set the right-side action template (renders before the bell). */
  setRightContent(template: TemplateRef<unknown>): void {
    this._rightContent.set(template);
  }

  /** Clear all portal slots. Call from ngOnDestroy. */
  clearCenterContent(): void {
    this._centerContent.set(null);
  }

  clearRightContent(): void {
    this._rightContent.set(null);
  }

  clearAll(): void {
    this._centerContent.set(null);
    this._rightContent.set(null);
  }
}
