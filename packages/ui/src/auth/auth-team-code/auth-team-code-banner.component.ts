/**
 * @fileoverview AuthTeamCodeBannerComponent - Cross-Platform Team Banner
 * @module @nxt1/ui/auth
 *
 * Compact team banner shown when a team has been validated.
 * Displays team name with option to clear/change.
 *
 * Usage:
 * ```html
 * <nxt1-auth-team-code-banner
 *   [team]="validatedTeam()"
 *   variant="compact"
 *   (clear)="onClearTeamCode()"
 * />
 * ```
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ValidatedTeamInfo } from '@nxt1/core';

/**
 * Banner display variant
 */
export type TeamCodeBannerVariant = 'full' | 'compact';

@Component({
  selector: 'nxt1-auth-team-code-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (team) {
      @if (variant === 'compact') {
        <!-- Compact Banner (for email form view) -->
        <div
          class="bg-surface-tertiary mb-3 flex items-center gap-2 rounded-lg p-2"
          data-testid="team-banner-compact"
        >
          <div class="bg-primary/20 flex h-6 w-6 items-center justify-center rounded-full">
            <span class="text-primary text-xs font-bold">{{ team.teamName.charAt(0) }}</span>
          </div>
          <p class="text-text-secondary flex-1 text-xs">
            Joining <span class="text-text-primary font-medium">{{ team.teamName }}</span>
          </p>
        </div>
      } @else {
        <!-- Full Banner (for social buttons view) -->
        <div
          class="bg-surface-tertiary mb-4 rounded-xl border border-green-500/30 p-3"
          data-testid="team-banner"
        >
          <div class="flex items-center gap-2">
            <div class="bg-primary/20 flex h-8 w-8 items-center justify-center rounded-full">
              <span class="text-primary text-sm font-bold">{{ team.teamName.charAt(0) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-text-primary truncate text-sm font-medium">
                Joining {{ team.teamName }}
              </p>
            </div>
            @if (variant === 'full') {
              <button
                type="button"
                (click)="clear.emit()"
                class="text-text-tertiary hover:text-text-secondary p-1"
                aria-label="Remove team code"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            }
          </div>
        </div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthTeamCodeBannerComponent {
  /** Team info to display */
  @Input() team: ValidatedTeamInfo | null | undefined = null;

  /** Banner display variant: 'full' shows with clear button, 'compact' is smaller without clear */
  @Input() variant: TeamCodeBannerVariant = 'full';

  /** Emits when user clicks clear */
  @Output() clear = new EventEmitter<void>();
}
