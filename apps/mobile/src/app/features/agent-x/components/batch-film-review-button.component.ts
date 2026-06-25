/**
 * @fileoverview Mobile Batch Film Review Button Component
 * @module @nxt1/mobile/features/film-review
 *
 * Ionic-compatible batch video review button for mobile.
 * Triggers batch_full_video tool via Agent X with touch-friendly UX.
 */

import { Component, ChangeDetectionStrategy, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { videocam, hourglass } from 'ionicons/icons';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { TEST_IDS } from '@nxt1/core/testing';

export interface BatchReviewRequest {
  filmReviewId: string;
  sourceId: string;
  sport?: string;
  windowDurationSec?: number;
}

addIcons({ videocam, hourglass });

@Component({
  selector: 'app-batch-film-review-button-mobile',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-button
      [attr.data-testid]="testIds.FILM_REVIEW.BATCH_REVIEW_BUTTON"
      [disabled]="isLoading()"
      (click)="onBatchReviewClick()"
      expand="block"
      color="primary"
    >
      @if (isLoading()) {
        <ion-spinner name="crescent" slot="start"></ion-spinner>
        Processing...
      } @else {
        <ion-icon icon="videocam" slot="start"></ion-icon>
        Batch Review
      }
    </ion-button>
  `,
  styles: [
    `
      ion-button {
        --padding-start: 16px;
        --padding-end: 16px;
        font-weight: 600;
        text-transform: none;
        letter-spacing: 0;
      }

      ion-spinner {
        width: 20px;
        height: 20px;
      }
    `,
  ],
})
export class BatchFilmReviewButtonMobileComponent {
  private readonly logger = inject(NxtLoggingService).child('BatchFilmReviewButtonMobile');
  private readonly toast = inject(NxtToastService);

  // Inputs
  readonly filmReviewId = input.required<string>();
  readonly sourceId = input.required<string>();
  readonly sport = input<string | undefined>();
  readonly windowDurationSec = input<number | undefined>();
  readonly isLoading = input(false);

  // Outputs
  readonly batchReviewRequested = output<BatchReviewRequest>();

  protected readonly testIds = TEST_IDS;

  onBatchReviewClick(): void {
    const request: BatchReviewRequest = {
      filmReviewId: this.filmReviewId(),
      sourceId: this.sourceId(),
      sport: this.sport(),
      windowDurationSec: this.windowDurationSec(),
    };

    this.logger.info('Batch review requested (mobile)', {
      filmReviewId: request.filmReviewId,
      sourceId: request.sourceId,
      sport: request.sport,
    });

    this.batchReviewRequested.emit(request);
    this.toast.info('Starting batch video review... This may take a moment.');
  }
}
