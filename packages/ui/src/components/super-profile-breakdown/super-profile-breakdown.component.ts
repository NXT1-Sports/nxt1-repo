import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';
import { NxtSectionHeaderComponent } from '../section-header';

export interface SuperProfileHotspot {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly icon: string;
  readonly top: string;
  readonly left: string;
  readonly tooltipAlign?: 'left' | 'right';
}

const DEFAULT_HOTSPOTS: readonly SuperProfileHotspot[] = [
  {
    id: 'verified-badge',
    title: 'Verified Badge',
    detail: 'Data sanctioned by your coach/circuit.',
    icon: 'shield-checkmark-outline',
    top: '16%',
    left: '70%',
    tooltipAlign: 'left',
  },
  {
    id: 'biometrics',
    title: 'Biometrics',
    detail: 'Height/Weight/Wingspan verified.',
    icon: 'barbell-outline',
    top: '36%',
    left: '18%',
    tooltipAlign: 'right',
  },
  {
    id: 'academics',
    title: 'Academics',
    detail: 'GPA & Transcript access (secure).',
    icon: 'school-outline',
    top: '46%',
    left: '82%',
    tooltipAlign: 'left',
  },
  {
    id: 'video-vault',
    title: 'Video Vault',
    detail: 'Unlimited highlight storage.',
    icon: 'videocam-outline',
    top: '64%',
    left: '20%',
    tooltipAlign: 'right',
  },
  {
    id: 'nil-valuation',
    title: 'NIL Valuation',
    detail: 'Market visibility metrics and valuation readiness signals.',
    icon: 'sparkles-outline',
    top: '74%',
    left: '76%',
    tooltipAlign: 'left',
  },
  {
    id: 'live-feed',
    title: 'Recruitment Engine',
    detail: 'Live highlight feed with active recruiter engagement data.',
    icon: 'pulse-outline',
    top: '84%',
    left: '40%',
    tooltipAlign: 'right',
  },
] as const;

@Component({
  selector: 'nxt1-super-profile-breakdown',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="breakdown" aria-labelledby="super-profile-breakdown-title">
      <nxt1-section-header
        titleId="super-profile-breakdown-title"
        eyebrow="Super Profile Breakdown"
        [headingLevel]="2"
        align="center"
        variant="hero"
        title="Digital Resume,"
        accentText=" Not a Bio."
        subtitle="More than a profile. It's your athletic resume, verified."
        support="Recruitment Engine (Live Data): Verified biometrics, embedded transcripts, NIL valuation, and a live highlight feed built for real recruiting decisions."
      />

      <div class="breakdown__stage" aria-label="Exploded profile feature map">
        <div class="stage-glow" aria-hidden="true"></div>

        <div class="phone" aria-hidden="true">
          <div class="phone__notch"></div>

          <div class="phone__content">
            <header class="phone__header">
              <span class="phone__status">NXT1 Super Profile</span>
              <span class="phone__state">LIVE</span>
            </header>

            <div class="phone__hero">
              <div class="phone__avatar"></div>
              <div class="phone__identity">
                <span class="phone__name">Athlete Resume</span>
                <span class="phone__meta">Verified • Recruiting Active</span>
              </div>
            </div>

            <div class="phone__chips">
              <span class="phone__chip">Biometrics</span>
              <span class="phone__chip">Transcript</span>
              <span class="phone__chip">NIL</span>
              <span class="phone__chip">Video Vault</span>
            </div>

            <div class="phone__panels">
              <article class="phone__panel"></article>
              <article class="phone__panel"></article>
              <article class="phone__panel"></article>
            </div>
          </div>
        </div>

        @for (hotspot of hotspots(); track hotspot.id) {
          <button
            type="button"
            class="hotspot"
            [class.hotspot--active]="activeHotspotId() === hotspot.id"
            [class.hotspot--align-left]="hotspot.tooltipAlign === 'left'"
            [class.hotspot--align-right]="hotspot.tooltipAlign !== 'left'"
            [style.top]="hotspot.top"
            [style.left]="hotspot.left"
            [attr.aria-label]="hotspot.title + ': ' + hotspot.detail"
            (mouseenter)="setActiveHotspot(hotspot.id)"
            (mouseleave)="clearActiveHotspot()"
            (focus)="setActiveHotspot(hotspot.id)"
            (blur)="clearActiveHotspot()"
            (click)="toggleHotspot(hotspot.id)"
          >
            <span class="hotspot__ping" aria-hidden="true"></span>
            <span class="hotspot__dot" aria-hidden="true"></span>

            <span class="hotspot__card">
              <span class="hotspot__card-title">
                <nxt1-icon [name]="hotspot.icon" size="16" />
                {{ hotspot.title }}
              </span>
              <span class="hotspot__card-text">{{ hotspot.detail }}</span>
            </span>
          </button>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .breakdown {
        width: 100%;
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-8);
        background: transparent;
      }

      .breakdown__stage {
        position: relative;
        min-height: 36rem;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-3xl);
        background:
          linear-gradient(
            145deg,
            var(--nxt1-color-alpha-primary4) 0%,
            var(--nxt1-color-alpha-primary5) 30%,
            transparent 70%
          ),
          var(--nxt1-color-surface-100);
        overflow: hidden;
        isolation: isolate;
      }

      .stage-glow {
        position: absolute;
        inset: 18% 20% 8%;
        background: var(--nxt1-color-alpha-primary12);
        filter: blur(60px);
        pointer-events: none;
        z-index: 0;
      }

      .phone {
        position: absolute;
        inset: 11% auto auto 50%;
        width: min(25rem, 74vw);
        aspect-ratio: 9 / 18;
        transform: translateX(-50%) rotate(-10deg) skewY(-1deg);
        transform-style: preserve-3d;
        border-radius: var(--nxt1-borderRadius-3xl);
        border: 1px solid var(--nxt1-color-border-primary);
        background: var(--nxt1-color-bg-primary);
        box-shadow:
          0 24px 52px var(--nxt1-color-alpha-primary12),
          0 8px 18px var(--nxt1-color-alpha-primary10);
        z-index: 1;
      }

      .phone::before,
      .phone::after {
        content: '';
        position: absolute;
        border-radius: inherit;
        pointer-events: none;
      }

      .phone::before {
        inset: 0.5rem;
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .phone::after {
        inset: 0;
        transform: translate3d(0.6rem, 0.8rem, -1px);
        background: var(--nxt1-color-alpha-primary6);
        z-index: -1;
      }

      .phone__notch {
        width: 34%;
        height: 0.55rem;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-400);
        margin: var(--nxt1-spacing-3) auto var(--nxt1-spacing-2);
      }

      .phone__content {
        padding: var(--nxt1-spacing-4);
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .phone__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .phone__status {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .phone__state {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .phone__hero {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-bg-secondary);
      }

      .phone__avatar {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: var(--nxt1-borderRadius-full);
        border: 2px solid var(--nxt1-color-primary);
        background: linear-gradient(
          145deg,
          var(--nxt1-color-primary) 0%,
          var(--nxt1-color-primaryLight) 100%
        );
      }

      .phone__identity {
        display: grid;
        gap: var(--nxt1-spacing-1);
        min-width: 0;
      }

      .phone__name {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .phone__meta {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
      }

      .phone__chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1_5);
      }

      .phone__chip {
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .phone__panels {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .phone__panel {
        height: 3.375rem;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          90deg,
          var(--nxt1-color-surface-200) 0%,
          var(--nxt1-color-surface-300) 50%,
          var(--nxt1-color-surface-200) 100%
        );
      }

      .hotspot {
        position: absolute;
        width: 0;
        height: 0;
        border: none;
        padding: 0;
        background: transparent;
        cursor: pointer;
        z-index: 2;
      }

      .hotspot::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 5.6rem;
        border-top: 1px dashed var(--nxt1-color-border-primary);
        opacity: 0.7;
        transform: translateY(-50%);
      }

      .hotspot--align-left::before {
        right: calc(50% + var(--nxt1-spacing-2));
        left: auto;
      }

      .hotspot--align-right::before {
        left: calc(50% + var(--nxt1-spacing-2));
      }

      .hotspot__ping,
      .hotspot__dot {
        position: absolute;
        top: 50%;
        left: 50%;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .hotspot__ping {
        width: 1.75rem;
        height: 1.75rem;
        transform: translate(-50%, -50%);
        background: var(--nxt1-color-alpha-primary10);
        animation: hotspot-pulse var(--nxt1-motion-duration-slow) var(--nxt1-motion-easing-standard)
          infinite;
      }

      .hotspot__dot {
        width: 0.75rem;
        height: 0.75rem;
        transform: translate(-50%, -50%);
        background: var(--nxt1-color-primary);
        border: 2px solid var(--nxt1-color-text-onPrimary);
        box-shadow: 0 0 0 4px var(--nxt1-color-alpha-primary10);
      }

      .hotspot__card {
        position: absolute;
        top: 50%;
        display: grid;
        gap: var(--nxt1-spacing-1);
        min-width: 12.25rem;
        max-width: 14rem;
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        box-shadow: 0 8px 20px var(--nxt1-color-alpha-primary6);
        opacity: 0;
        pointer-events: none;
        transition:
          opacity var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard),
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-standard);
      }

      .hotspot--align-left .hotspot__card {
        right: calc(100% + var(--nxt1-spacing-8));
        transform: translateY(-50%) translateX(var(--nxt1-spacing-2));
      }

      .hotspot--align-right .hotspot__card {
        left: calc(100% + var(--nxt1-spacing-8));
        transform: translateY(-50%) translateX(calc(-1 * var(--nxt1-spacing-2)));
      }

      .hotspot:hover .hotspot__card,
      .hotspot:focus-visible .hotspot__card,
      .hotspot--active .hotspot__card {
        opacity: 1;
      }

      .hotspot--align-left:hover .hotspot__card,
      .hotspot--align-left:focus-visible .hotspot__card,
      .hotspot--align-left.hotspot--active .hotspot__card {
        transform: translateY(-50%) translateX(0);
      }

      .hotspot--align-right:hover .hotspot__card,
      .hotspot--align-right:focus-visible .hotspot__card,
      .hotspot--align-right.hotspot--active .hotspot__card {
        transform: translateY(-50%) translateX(0);
      }

      .hotspot__card-title {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .hotspot__card-text {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @keyframes hotspot-pulse {
        0% {
          transform: translate(-50%, -50%) scale(0.85);
          opacity: 0.85;
        }
        70% {
          transform: translate(-50%, -50%) scale(1.3);
          opacity: 0;
        }
        100% {
          transform: translate(-50%, -50%) scale(1.3);
          opacity: 0;
        }
      }

      @media (max-width: 991px) {
        .breakdown {
          padding-top: var(--nxt1-spacing-8);
          padding-bottom: var(--nxt1-spacing-8);
        }

        .breakdown__stage {
          min-height: 42rem;
        }

        .phone {
          width: min(20rem, 82vw);
          inset: 9% auto auto 50%;
        }

        .hotspot::before {
          width: 3.75rem;
        }

        .hotspot__card {
          min-width: 10rem;
          max-width: 11.75rem;
        }
      }

      @media (max-width: 640px) {
        .breakdown__stage {
          min-height: 44rem;
        }

        .phone {
          top: 8%;
          transform: translateX(-50%) rotate(-7deg);
        }

        .hotspot--align-left .hotspot__card,
        .hotspot--align-right .hotspot__card {
          left: 50%;
          right: auto;
          top: calc(100% + var(--nxt1-spacing-5));
          transform: translateX(-50%);
        }

        .hotspot--align-left::before,
        .hotspot--align-right::before {
          left: 50%;
          right: auto;
          width: 1px;
          height: 2.5rem;
          border-top: none;
          border-left: 1px dashed var(--nxt1-color-border-primary);
          transform: translateX(-50%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .hotspot__ping {
          animation: none;
        }

        .hotspot__card {
          transition: none;
        }

        .phone {
          transform: translateX(-50%);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSuperProfileBreakdownComponent {
  readonly hotspots = input<readonly SuperProfileHotspot[]>(DEFAULT_HOTSPOTS);

  protected readonly activeHotspotId = signal<string | null>(null);

  protected setActiveHotspot(id: string): void {
    this.activeHotspotId.set(id);
  }

  protected clearActiveHotspot(): void {
    this.activeHotspotId.set(null);
  }

  protected toggleHotspot(id: string): void {
    this.activeHotspotId.update((current) => (current === id ? null : id));
  }
}
