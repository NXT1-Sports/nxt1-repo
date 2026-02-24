import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-header-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="nxt-header-shell" [attr.aria-labelledby]="titleId()">
      <article
        class="nxt-header-card"
        [class.nxt-header-card--mobile-full-bleed]="mobileFullBleed()"
      >
        <div class="nxt-header-bg" aria-hidden="true">
          <ng-content select="[nxtHeaderBackground]" />
        </div>

        <div class="nxt-header-content">
          <div class="nxt-header-copy">
            <ng-content select="[nxtHeaderBadge]" />

            <h1 [id]="titleId()" class="nxt-header-title">{{ title() }}</h1>

            <ng-content select="[nxtHeaderSubtitle]" />

            <div class="nxt-header-actions">
              <ng-content select="[nxtHeaderActions]" />
            </div>

            <ng-content select="[nxtHeaderFooter]" />
          </div>
        </div>

        <ng-content select="[nxtHeaderOverlay]" />
      </article>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .nxt-header-shell {
        margin: 0 auto;
        max-width: var(--nxt1-root-shell-max-width, 88rem);
        padding: var(--nxt1-spacing-4);
      }

      .nxt-header-card {
        position: relative;
        isolation: isolate;
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-3xl);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 36px color-mix(in srgb, var(--nxt1-color-bg-primary) 24%, transparent);
      }

      .nxt-header-bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
      }

      .nxt-header-content {
        position: relative;
        z-index: 2;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: var(--nxt1-header-min-height, calc(var(--nxt1-spacing-10) * 8));
        padding: var(--nxt1-header-padding, var(--nxt1-spacing-7) var(--nxt1-spacing-5));
      }

      .nxt-header-copy {
        width: 100%;
        max-width: var(--nxt1-header-content-max-width, var(--nxt1-root-shell-max-width, 88rem));
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .nxt-header-title {
        margin: var(--nxt1-header-title-margin, 0);
        max-width: var(--nxt1-header-title-max-width, 18ch);
        color: var(--nxt1-header-title-color, var(--nxt1-color-text-primary));
        font-size: var(
          --nxt1-header-title-size,
          var(--nxt1-fontSize-5xl, var(--nxt1-fontSize-4xl))
        );
        line-height: var(--nxt1-header-title-line-height, 1.08);
        font-weight: var(--nxt1-header-title-weight, var(--nxt1-fontWeight-bold));
        text-wrap: balance;
      }

      .nxt-header-actions {
        margin-top: var(--nxt1-header-actions-margin-top, var(--nxt1-spacing-5));
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
      }

      .nxt-header-actions:empty {
        display: none;
      }

      @media (max-width: 1024px) {
        .nxt-header-content {
          min-height: var(
            --nxt1-header-min-height-tablet,
            var(--nxt1-header-min-height, calc(var(--nxt1-spacing-10) * 8))
          );
        }
      }

      @media (max-width: 768px) {
        .nxt-header-shell {
          padding: var(--nxt1-header-shell-padding-mobile, var(--nxt1-spacing-3));
        }

        .nxt-header-card--mobile-full-bleed {
          overflow: hidden;
          border-radius: 0;
          border-left: none;
          border-right: none;
        }

        .nxt-header-content {
          min-height: var(
            --nxt1-header-min-height-mobile,
            var(--nxt1-header-min-height, calc(var(--nxt1-spacing-10) * 8))
          );
          padding: var(
            --nxt1-header-padding-mobile,
            var(--nxt1-header-padding, var(--nxt1-spacing-7) var(--nxt1-spacing-5))
          );
        }

        .nxt-header-title {
          font-size: var(--nxt1-header-title-size-mobile, var(--nxt1-fontSize-3xl, 2.25rem));
        }
      }

      @media (max-width: 480px) {
        .nxt-header-shell {
          padding: var(--nxt1-header-shell-padding-xs, var(--nxt1-spacing-2));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtHeaderCardComponent {
  readonly title = input.required<string>();
  readonly titleId = input('nxt-header-title');
  readonly mobileFullBleed = input(false);
}
