import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

type AgentXLibraryLoadingCardKind = 'library' | 'viewer' | 'toolbar';

const DEFAULT_LIBRARY_LOADING_CARDS: readonly AgentXLibraryLoadingCardKind[] = [
  'library',
  'library',
  'viewer',
  'toolbar',
];

@Component({
  selector: 'nxt1-agent-x-library-loading-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="film-state film-state--loading" [attr.data-testid]="testId">
      <div class="film-loading" aria-hidden="true">
        @for (card of cards; track $index) {
          <div
            class="film-loading__card"
            [class.film-loading__card--viewer]="card === 'viewer'"
            [class.film-loading__card--toolbar]="card === 'toolbar'"
          ></div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .film-state--loading {
        border: 0;
        border-radius: 0;
        padding: 0;
        text-align: left;
        background: transparent;
      }

      .film-loading {
        display: grid;
        gap: 10px;
      }

      .film-loading__card {
        border-radius: var(--nxt1-radius-md, 12px);
        min-height: 88px;
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer var(--nxt1-skeleton-animation-duration, 1.5s) infinite
          ease-in-out;
      }

      .film-loading__card--viewer {
        min-height: 180px;
      }

      .film-loading__card--toolbar {
        min-height: 56px;
      }

      @media (prefers-reduced-motion: reduce) {
        .film-loading__card {
          animation: none;
        }
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 100% 50%;
        }

        100% {
          background-position: 0 50%;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXLibraryLoadingStateComponent {
  @Input() testId: string | null = null;
  @Input() cards: readonly AgentXLibraryLoadingCardKind[] = DEFAULT_LIBRARY_LOADING_CARDS;
}
