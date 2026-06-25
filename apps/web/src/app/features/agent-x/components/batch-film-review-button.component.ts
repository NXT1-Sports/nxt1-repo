/**
 * @fileoverview Batch Film Review Button Component
 * @module @nxt1/web/features/film-review
 *
 * Allows coaches to initiate batch video review with a single click.
 * Triggers the batch_full_video tool via Agent X, which splits footage
 * into 5-min windows and prepares for analysis.
 */

import { Component, ChangeDetectionStrategy, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { TEST_IDS } from '@nxt1/core/testing';

export interface BatchReviewRequest {
  filmReviewId: string;
  sourceId: string;
  sport?: string;
  windowDurationSec?: number;
}

@Component({
  selector: 'app-batch-film-review-button',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [attr.data-testid]="testIds.FILM_REVIEW.BATCH_REVIEW_BUTTON"
      [disabled]="isLoading()"
      (click)="onBatchReviewClick()"
      class="batch-review-btn"
      [class.is-loading]="isLoading()"
    >
      <nxt1-icon [name]="isLoading() ? 'hourglass' : 'videocam'" size="20" />
      <span>{{ isLoading() ? 'Processing...' : 'Batch Review' }}</span>
    </button>
  `,
  styles: [
    `
      .batch-review-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;

        &:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }

        &:active:not(:disabled) {
          transform: translateY(0);
        }

        &:disabled,
        &.is-loading {
          opacity: 0.7;
          cursor: not-allowed;
        }

        nxt1-icon {
          width: 20px;
          height: 20px;
        }
      }
    `,
  ],
})
export class BatchFilmReviewButtonComponent {
  private readonly logger = inject(NxtLoggingService).child('BatchFilmReviewButton');
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

    this.logger.info('Batch review requested', {
      filmReviewId: request.filmReviewId,
      sourceId: request.sourceId,
      sport: request.sport,
    });

    this.batchReviewRequested.emit(request);
    this.toast.info('Starting batch video review... This may take a moment.');
  }
}
