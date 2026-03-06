/**
 * @fileoverview Brand Page — Mobile App Wrapper
 * @module @nxt1/mobile/features/brand
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Brand shell
 * from @nxt1/ui and handles platform-specific navigation.
 *
 * Uses Ionic components for native mobile UX.
 * When a category is selected, opens Agent X as a bottom sheet.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { IonHeader, IonContent, IonToolbar } from '@ionic/angular/standalone';
import {
  BrandShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  BrandService,
  NxtBottomSheetService,
  SHEET_PRESETS,
  AgentXOperationChatComponent,
} from '@nxt1/ui';
import type { BrandCategory } from '@nxt1/core';

@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, BrandShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-brand-shell
        (avatarClick)="onAvatarClick()"
        (categorySelect)="onCategorySelect($event)"
      />
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
export class BrandComponent implements OnInit {
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly brand = inject(BrandService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly logger = inject(NxtLoggingService).child('BrandComponent');

  ngOnInit(): void {
    this.brand.trackPageView();
  }

  onAvatarClick(): void {
    this.sidenavService.toggle();
  }

  async onCategorySelect(category: BrandCategory): Promise<void> {
    this.logger.info('Opening Agent X for Brand category', { categoryId: category.id });

    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: `brand-${category.id}`,
        contextTitle: category.label,
        contextIcon: category.icon,
        contextType: 'command' as const,
        quickActions: [{ id: 'brand-prompt', label: category.agentPrompt, icon: category.icon }],
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'agent-x-operation-sheet',
    });
  }
}
