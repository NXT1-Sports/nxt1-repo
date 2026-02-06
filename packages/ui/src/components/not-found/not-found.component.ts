/**
 * @fileoverview 404 Not Found Page Component
 * @module @nxt1/ui/components/not-found
 *
 * Standalone Angular component for 404 error page.
 * Works cross-platform for both web and mobile apps.
 *
 * @example
 * ```typescript
 * // In routes:
 * {
 *   path: '**',
 *   loadComponent: () => import('@nxt1/ui').then(m => m.NotFoundComponent)
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NxtLogoComponent } from '../logo/logo.component';
import { NxtIconComponent } from '../icon/icon.component';

@Component({
  selector: 'nxt1-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtLogoComponent, NxtIconComponent],
  template: `
    <div class="bg-surface flex min-h-screen flex-col items-center justify-center p-6">
      <!-- Logo -->
      <div class="mb-8 animate-pulse">
        <nxt1-logo size="lg" />
      </div>

      <!-- 404 Icon -->
      <div class="text-surface-variant mb-6">
        <nxt1-icon name="alert-circle-outline" class="text-8xl" />
      </div>

      <!-- Error Message -->
      <div class="max-w-md space-y-4 text-center">
        <h1 class="text-on-surface text-6xl font-bold">404</h1>
        <h2 class="text-on-surface text-2xl font-semibold">Page Not Found</h2>
        <p class="text-surface-variant">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <!-- Action Buttons -->
        <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            (click)="goBack()"
            class="bg-surface-container text-on-surface hover:bg-surface-container-high rounded-lg px-6 py-3 transition-colors"
          >
            <div class="flex items-center justify-center gap-2">
              <nxt1-icon name="arrow-back-outline" />
              <span>Go Back</span>
            </div>
          </button>

          <button
            [routerLink]="['/']"
            class="bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container rounded-lg px-6 py-3 transition-colors"
          >
            <div class="flex items-center justify-center gap-2">
              <nxt1-icon name="home-outline" />
              <span>Go Home</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Helpful Links -->
      <div class="mt-12 text-center">
        <p class="text-surface-variant mb-3 text-sm">Need help?</p>
        <div class="flex justify-center gap-4 text-sm">
          <a [routerLink]="['/help-center']" class="text-primary hover:underline"> Help Center </a>
          <span class="text-surface-variant">•</span>
          <a [routerLink]="['/tabs/agent']" class="text-primary hover:underline">
            Contact Agent X
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
  private router = inject(Router);

  goBack(): void {
    const navigation = this.router.getCurrentNavigation();
    const hasHistory = window.history.length > 2;

    if (hasHistory && navigation?.previousNavigation) {
      window.history.back();
    } else {
      this.router.navigate(['/']);
    }
  }
}
