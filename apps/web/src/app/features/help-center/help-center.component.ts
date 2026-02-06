/**
 * @fileoverview Help Center Home Page - Web
 * @version 3.0.0
 * @description Web-optimized Help Center using Tailwind SSR components.
 *
 * ⭐ WEB-SPECIFIC - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HelpCenterShellWebComponent, type HelpNavigateEvent } from '@nxt1/ui';

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
        break;
    }
  }
}
