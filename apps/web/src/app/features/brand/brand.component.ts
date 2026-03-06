/**
 * @fileoverview Brand Page — Web App Wrapper
 * @module @nxt1/web/features/brand
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Brand shell
 * from @nxt1/ui and handles platform-specific navigation.
 *
 * When a brand category is selected, opens the Agent X FAB
 * chat panel with the category's pre-filled prompt.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { BrandShellWebComponent } from '@nxt1/ui/brand/web';
import { BrandService } from '@nxt1/ui/brand';
import { AgentXService } from '@nxt1/ui/agent-x';
import { AgentXFabService } from '@nxt1/ui/agent-x/fab';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import type { BrandCategory } from '@nxt1/core';

@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [BrandShellWebComponent],
  template: ` <nxt1-brand-shell-web (categorySelect)="onCategorySelect($event)" /> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandComponent implements OnInit {
  private readonly brand = inject(BrandService);
  private readonly agentX = inject(AgentXService);
  private readonly fabService = inject(AgentXFabService);
  private readonly logger = inject(NxtLoggingService).child('BrandComponent');

  ngOnInit(): void {
    this.brand.trackPageView();
  }

  async onCategorySelect(category: BrandCategory): Promise<void> {
    this.logger.info('Opening Agent X FAB from Brand', { categoryId: category.id });

    this.agentX.setUserMessage(category.agentPrompt);
    this.fabService.open();
    await this.agentX.sendMessage();
  }
}
