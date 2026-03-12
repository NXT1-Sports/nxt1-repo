/**
 * @fileoverview Help Center Page Component (Mobile)
 * @module apps/mobile/features/help-center
 * @version 2.0.0
 *
 * Main page component for help center feature on mobile.
 * Clean, minimal implementation using shared @nxt1/ui components.
 *
 * Following 2026 NXT1 Architecture:
 * - Standalone component with OnPush change detection
 * - NavController for Ionic navigation
 * - Thin wrapper around shared shell
 */

import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import { HelpCenterShellComponent, HelpCenterService, type HelpNavigateEvent } from '@nxt1/ui';
import { NxtBrowserService } from '@nxt1/ui';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import type { HelpUserType } from '@nxt1/core';

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [CommonModule, IonHeader, IonContent, IonToolbar, HelpCenterShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-help-center-shell [showBack]="true" (back)="onBack()" (navigate)="onNavigate($event)" />
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterComponent {
  private readonly nav = inject(NavController);
  private readonly helpService = inject(HelpCenterService);
  private readonly authFlow = inject(AuthFlowService);
  private readonly browser = inject(NxtBrowserService);

  constructor() {
    // Reactively sync user role to help center service
    effect(() => {
      const role = this.authFlow.userRole();
      this.helpService.setUserRole((role as HelpUserType) ?? null);
    });

    // Load home data from backend API
    this.helpService.loadHome();
  }

  protected onBack(): void {
    this.nav.back();
  }

  protected onNavigate(event: HelpNavigateEvent): void {
    switch (event.type) {
      case 'article':
        if (event.slug) {
          this.nav.navigateForward(`/help-center/article/${event.slug}`);
        }
        break;
      case 'category':
        if (event.id) {
          this.nav.navigateForward(`/help-center/category/${event.id}`);
        }
        break;
      case 'faq':
        // For now, FAQs open inline or navigate to category
        break;
      case 'contact':
        this.contactSupport();
        break;
    }
  }

  private async contactSupport(): Promise<void> {
    await this.browser.openMailto({
      to: 'support@nxt1sports.com',
      subject: 'Support Request - NXT1 Sports',
      body: ['Hi NXT1 Support Team,', '', 'I need help with:', '', 'My account email:'].join('\n'),
    });
  }
}
