/**
 * @fileoverview Usage Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/usage
 * @version 2.2.0
 *
 * Thin wrapper component that renders the shared Usage shell
 * from @nxt1/ui. Wraps in ion-header + ion-content for proper
 * Ionic navigation lifecycle and animations.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 */

import { Component, ChangeDetectionStrategy, inject, DestroyRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IonHeader,
  IonContent,
  IonToolbar,
  IonRouterOutlet,
  NavController,
} from '@ionic/angular/standalone';
import { UsageShellComponent, UsageService, type UsageSection } from '@nxt1/ui';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, UsageShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-usage-shell [user]="null" [showPageHeader]="true" (back)="navigateBack()" />
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
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageComponent {
  private readonly navController = inject(NavController);
  private readonly routerOutlet = inject(IonRouterOutlet, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly usage = inject(UsageService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly usageSections: readonly UsageSection[] = [
    'overview',
    'metered-usage',
    'breakdown',
    'budgets',
    'payment-info',
  ] as const;

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((params) => this.toUsageSection(params.get('section'))),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((section) => {
        if (section) {
          this.usage.setActiveSection(section);
        }
      });
  }

  private toUsageSection(value: string | null): UsageSection | null {
    if (!value) return null;
    return this.usageSections.includes(value as UsageSection) ? (value as UsageSection) : null;
  }

  protected navigateBack(): void {
    this.navController.back();
  }
}
