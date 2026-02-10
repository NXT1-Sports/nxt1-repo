/**
 * @fileoverview Wallet Shell Component — Main Container
 * @module @nxt1/ui/wallet
 * @version 1.0.0
 *
 * Top-level container component for the Credit Wallet feature.
 * Orchestrates balance hero, bundle grid, transaction history,
 * and wallet settings in a section-accordion layout.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Can be placed as:
 * - A standalone page (`<nxt1-wallet-shell />`)
 * - Inside a bottom sheet (via `WalletBottomSheetService`)
 * - Inside a modal or route
 *
 * @example
 * ```html
 * <!-- Standalone page -->
 * <nxt1-wallet-shell
 *   (close)="onClose()"
 *   (sectionAction)="onSectionAction($event)"
 * />
 *
 * <!-- In bottom sheet (showHeader=false) -->
 * <nxt1-wallet-shell [showHeader]="false" (close)="onDismiss()" />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonIcon,
  IonRippleEffect,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  walletOutline,
  cartOutline,
  timeOutline,
  settingsOutline,
  chevronForwardOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { WalletService } from './wallet.service';
import { WalletSkeletonComponent } from './wallet-skeleton.component';
import {
  WalletBalanceSectionComponent,
  WalletBundlesSectionComponent,
  WalletHistorySectionComponent,
  WalletSettingsSectionComponent,
} from './sections';
import type { WalletSectionId } from './wallet.mock-data';

addIcons({
  closeOutline,
  walletOutline,
  cartOutline,
  timeOutline,
  settingsOutline,
  chevronForwardOutline,
  alertCircleOutline,
});

/** Event emitted when the wallet shell requests close */
export interface WalletCloseEvent {
  readonly purchased: boolean;
}

@Component({
  selector: 'nxt1-wallet-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonRippleEffect,
    WalletSkeletonComponent,
    WalletBalanceSectionComponent,
    WalletBundlesSectionComponent,
    WalletHistorySectionComponent,
    WalletSettingsSectionComponent,
  ],
  template: `
    <div class="wallet-shell">
      <!-- Header (Full — for standalone page) -->
      @if (showHeader()) {
        <header class="wallet-header">
          <button
            type="button"
            class="header-btn header-btn--close"
            (click)="onClose()"
            aria-label="Close"
          >
            <ion-icon name="close-outline"></ion-icon>
          </button>

          <h1 class="header-title">Wallet</h1>

          <div class="header-spacer"></div>
        </header>
      }

      <!-- Sheet Header (Minimal — for bottom sheet context) -->
      @if (!showHeader()) {
        <header class="wallet-sheet-header">
          <h1 class="sheet-title">Wallet</h1>
          <button
            type="button"
            class="sheet-done-btn"
            (click)="onClose()"
            aria-label="Done"
          >
            <span>Done</span>
          </button>
        </header>
      }

      <div class="wallet-content">
        @if (wallet.isLoading()) {
          <nxt1-wallet-skeleton />
        } @else if (wallet.error()) {
          <div class="error-state">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <p>{{ wallet.error() }}</p>
            <button class="retry-btn" (click)="loadWallet()">Try Again</button>
          </div>
        } @else {
          <!-- Section Accordion -->
          <div class="sections-container">
            @for (section of wallet.sections(); track section.id) {
              <div
                class="section-card"
                [class.section-card--expanded]="wallet.expandedSection() === section.id"
              >
                <!-- Section Header -->
                <button
                  type="button"
                  class="section-header"
                  (click)="wallet.toggleSection(section.id)"
                >
                  <ion-ripple-effect></ion-ripple-effect>

                  <div class="section-icon" [style.background]="getSectionColor(section.id)">
                    <ion-icon [name]="section.icon"></ion-icon>
                  </div>

                  <div class="section-info">
                    <h3 class="section-title">{{ section.title }}</h3>
                    <span class="section-description">{{ section.description }}</span>
                  </div>

                  <div class="section-meta">
                    @if (section.id === 'balance') {
                      <span class="meta-badge">{{ wallet.totalCredits() }}</span>
                    }
                    @if (section.id === 'history') {
                      <span class="meta-count">{{ wallet.transactionCount() }}</span>
                    }
                    <ion-icon name="chevron-forward-outline" class="chevron"></ion-icon>
                  </div>
                </button>

                <!-- Section Content -->
                @if (wallet.expandedSection() === section.id) {
                  <div class="section-content">
                    @switch (section.id) {
                      @case ('balance') {
                        <nxt1-wallet-balance-section
                          [balance]="wallet.balance()"
                          (addCredits)="wallet.expandSection('bundles')"
                        />
                      }
                      @case ('bundles') {
                        <nxt1-wallet-bundles-section
                          [bundles]="wallet.bundles()"
                          [selectedId]="wallet.selectedBundleId()"
                          [isPurchasing]="wallet.isPurchasing()"
                          (bundleSelected)="wallet.selectBundle($event)"
                          (purchase)="onPurchase($event)"
                        />
                      }
                      @case ('history') {
                        <nxt1-wallet-history-section
                          [transactions]="wallet.transactions()"
                          (viewAll)="onViewAllHistory()"
                        />
                      }
                      @case ('settings') {
                        <nxt1-wallet-settings-section
                          [autoReload]="wallet.autoReload()"
                          (toggleAutoReload)="wallet.toggleAutoReload()"
                          (managePayment)="onManagePayment()"
                        />
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Bottom Spacer -->
          <div class="bottom-spacer"></div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       WALLET SHELL — 2026 Design Tokens
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .wallet-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
        position: relative;
      }

      /* ============================================
         HEADER (Full — standalone page)
         ============================================ */

      .wallet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        min-height: 56px;
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .header-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .header-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-lg);
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 24px;
        }

        &:active:not(:disabled) {
          transform: scale(0.95);
          background: var(--nxt1-color-surface-200);
        }
      }

      .header-spacer {
        width: 44px;
      }

      /* ============================================
         SHEET HEADER (Minimal — bottom sheet context)
         ============================================ */

      .wallet-sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4) var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-primary);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .sheet-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .sheet-done-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        min-height: 36px;
        border: none;
        background: transparent;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-primary);
        cursor: pointer;
        border-radius: var(--nxt1-radius-lg);
        transition: all var(--nxt1-transition-fast);

        &:active {
          transform: scale(0.95);
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .wallet-content {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        background: var(--nxt1-color-bg-primary);
        -webkit-overflow-scrolling: touch;
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        text-align: center;

        ion-icon {
          font-size: 48px;
          color: var(--nxt1-color-error);
        }

        p {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-base);
          color: var(--nxt1-color-text-secondary);
          margin: 0;
        }
      }

      .retry-btn {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-6);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);

        &:active {
          transform: scale(0.95);
        }
      }

      /* ============================================
         SECTIONS CONTAINER
         ============================================ */

      .sections-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        max-width: 800px;
        margin: 0 auto;
      }

      /* ============================================
         SECTION CARD
         ============================================ */

      .section-card {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);
      }

      .section-card--expanded {
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 4px 12px color-mix(in srgb, var(--nxt1-color-shadow) 10%, transparent);
      }

      .section-header {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: transparent;
        border: none;
        cursor: pointer;
        overflow: hidden;
        text-align: left;
      }

      .section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
        flex-shrink: 0;

        ion-icon {
          font-size: 22px;
          color: var(--nxt1-color-text-onPrimary);
        }
      }

      .section-info {
        flex: 1;
        min-width: 0;
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 2px;
      }

      .section-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .section-meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .meta-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 var(--nxt1-spacing-2);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        border-radius: var(--nxt1-radius-full);
      }

      .meta-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
      }

      .chevron {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary);
        transition: transform var(--nxt1-transition-fast);
      }

      .section-card--expanded .chevron {
        transform: rotate(90deg);
      }

      .section-content {
        padding: 0 var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        animation: slideDown var(--nxt1-transition-fast) ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         BOTTOM SPACER
         ============================================ */

      .bottom-spacer {
        height: var(--nxt1-spacing-8);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletShellComponent implements OnInit {
  readonly wallet = inject(WalletService);

  /** Whether to show the full header (false in bottom sheet context) */
  readonly showHeader = input(true);

  /** Optional initial section to expand on load */
  readonly initialSection = input<WalletSectionId | null>(null);

  /** Close event */
  readonly close = output<WalletCloseEvent>();

  /** Section action event */
  readonly sectionAction = output<{
    section: WalletSectionId;
    action: string;
    data?: unknown;
  }>();

  /** Track whether a purchase happened during this session */
  private didPurchase = false;

  ngOnInit(): void {
    const initialSection = this.initialSection();
    if (initialSection) {
      this.wallet.expandSection(initialSection);
    }
    this.loadWallet();
  }

  /** Load wallet data */
  loadWallet(): void {
    this.wallet.loadWallet();
  }

  /** Handle close/dismiss */
  onClose(): void {
    this.close.emit({ purchased: this.didPurchase });
  }

  /** Handle credit bundle purchase */
  async onPurchase(bundleId: string): Promise<void> {
    const success = await this.wallet.purchaseBundle(bundleId);
    if (success) {
      this.didPurchase = true;
    }
  }

  /** Handle view all history navigation */
  onViewAllHistory(): void {
    this.sectionAction.emit({ section: 'history', action: 'viewAll' });
  }

  /** Handle manage payment method navigation */
  onManagePayment(): void {
    this.sectionAction.emit({ section: 'settings', action: 'managePayment' });
  }

  /** Section color mapping (design-token based) */
  getSectionColor(sectionId: WalletSectionId): string {
    const colors: Record<WalletSectionId, string> = {
      balance: 'var(--nxt1-color-primary)',
      bundles: 'var(--nxt1-color-secondary)',
      history: 'var(--nxt1-color-tertiary)',
      settings: 'var(--nxt1-color-info)',
    };
    return colors[sectionId] ?? 'var(--nxt1-color-primary)';
  }
}
