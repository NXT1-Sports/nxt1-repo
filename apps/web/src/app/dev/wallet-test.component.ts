/**
 * @fileoverview Wallet UI Test Page
 * @module @nxt1/web/dev
 *
 * ⚠️ DEVELOPMENT ONLY — Remove before production
 *
 * Test page to preview the wallet UI in different modes:
 * - Full page (shell rendered directly)
 * - Bottom sheet (via WalletBottomSheetService)
 * - Direct to bundles (low-balance intercept scenario)
 * - Direct to history (transaction review scenario)
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalletShellComponent, WalletBottomSheetService, type WalletSheetResult } from '@nxt1/ui';

@Component({
  selector: 'app-wallet-test',
  standalone: true,
  imports: [CommonModule, WalletShellComponent],
  template: `
    <div class="test-page">
      <!-- Mode Selector -->
      <div class="test-controls">
        <h1 class="test-title">Wallet UI Test</h1>

        <div class="button-group">
          <button class="test-button" [class.active]="mode() === 'page'" (click)="setMode('page')">
            Full Page
          </button>
          <button
            class="test-button"
            [class.active]="mode() === 'sheet'"
            (click)="setMode('sheet')"
          >
            Bottom Sheets
          </button>
        </div>

        <!-- Bottom Sheet Actions -->
        @if (mode() === 'sheet') {
          <div class="sheet-actions">
            <button class="action-btn" (click)="openDefaultSheet()">Open Wallet (Default)</button>
            <button class="action-btn" (click)="openBundlesSheet()">
              Open Bundles (Low Balance)
            </button>
            <button class="action-btn" (click)="openHistorySheet()">Open History</button>
            <button class="action-btn" (click)="openFullScreenSheet()">Open Full Screen</button>
          </div>

          @if (lastResult()) {
            <div class="result-display">
              <strong>Last Result:</strong>
              <pre>{{ lastResult() | json }}</pre>
            </div>
          }
        }
      </div>

      <!-- Full Page Mode — Render Wallet Shell -->
      @if (mode() === 'page') {
        <div class="wallet-container">
          <nxt1-wallet-shell
            [showHeader]="true"
            (close)="onWalletClose($event)"
            (sectionAction)="onSectionAction($event)"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .test-page {
        min-height: 100vh;
        background: var(--nxt1-color-surface-100, #0a0a0a);
        color: var(--nxt1-color-text-primary, #fff);
      }

      .test-controls {
        padding: 20px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border-bottom: 1px solid var(--nxt1-color-border-default, #333);
      }

      .test-title {
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 16px;
      }

      .button-group {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }

      .test-button {
        padding: 10px 20px;
        border: 1px solid var(--nxt1-color-border-default, #333);
        border-radius: 8px;
        background: var(--nxt1-color-surface-300, #2a2a2a);
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .test-button:hover {
        background: var(--nxt1-color-surface-400, #3a3a3a);
      }

      .test-button.active {
        background: var(--nxt1-color-primary, #ff6b00);
        border-color: var(--nxt1-color-primary, #ff6b00);
        color: #fff;
      }

      .sheet-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }

      .action-btn {
        padding: 12px 20px;
        border: none;
        border-radius: 8px;
        background: var(--nxt1-color-primary, #ff6b00);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .action-btn:hover {
        opacity: 0.9;
      }

      .result-display {
        padding: 12px;
        background: var(--nxt1-color-surface-100, #0a0a0a);
        border-radius: 8px;
        font-size: 12px;
      }

      .result-display pre {
        margin: 8px 0 0;
        color: var(--nxt1-color-text-secondary, #888);
      }

      .wallet-container {
        height: calc(100vh - 140px);
        overflow: hidden;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletTestComponent {
  private readonly walletSheet = inject(WalletBottomSheetService);

  protected readonly mode = signal<'page' | 'sheet'>('page');
  protected readonly lastResult = signal<WalletSheetResult | null>(null);

  protected setMode(mode: 'page' | 'sheet'): void {
    this.mode.set(mode);
    this.lastResult.set(null);
  }

  protected async openDefaultSheet(): Promise<void> {
    const result = await this.walletSheet.open();
    this.lastResult.set(result);
  }

  protected async openBundlesSheet(): Promise<void> {
    const result = await this.walletSheet.openBundles();
    this.lastResult.set(result);
  }

  protected async openHistorySheet(): Promise<void> {
    const result = await this.walletSheet.openHistory();
    this.lastResult.set(result);
  }

  protected async openFullScreenSheet(): Promise<void> {
    const result = await this.walletSheet.openFullScreen();
    this.lastResult.set(result);
  }

  protected onWalletClose(event: any): void {
    console.log('Wallet closed:', event);
  }

  protected onSectionAction(event: any): void {
    console.log('Section action:', event);
  }
}
