/**
 * @fileoverview Help Center Home Page - Web
 * @version 3.0.0
 * @description Web-optimized Help Center using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { HelpCenterShellWebComponent, type HelpNavigateEvent } from '@nxt1/ui/help-center';
import { HelpCenterService } from '@nxt1/ui/help-center';
import { NxtBrowserService } from '@nxt1/ui/services/browser';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import type { HelpUserType } from '@nxt1/core';

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [HelpCenterShellWebComponent],
  template: `
    <nxt1-help-center-shell-web
      [showBack]="true"
      (back)="onBack()"
      (navigate)="onNavigate($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterComponent {
  private readonly router = inject(Router);
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
    this.router.navigate(['/settings']);
  }

  protected onNavigate(event: HelpNavigateEvent): void {
    switch (event.type) {
      case 'article':
        if (event.slug) {
          this.router.navigate(['/help-center', 'article', event.slug]);
        }
        break;
      case 'category':
        if (event.id) {
          this.router.navigate(['/help-center', 'category', event.id]);
        }
        break;
      case 'faq':
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
