/**
 * @fileoverview Live View Launcher — Native side-panel UI for starting live browser sessions.
 * @module @nxt1/ui/agent-x/web
 *
 * Renders inside the Agent X shell's expanded side panel instead of immediately
 * spinning up a Firecrawl container. Users pick a connected account or enter a
 * custom URL, *then* the session begins.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { z } from 'zod';
import { NxtIconComponent } from '../../components/icon';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { resolveLiveViewLauncherPlatform } from './live-view-launcher.utils';

/**
 * Quick-launch platform card shown in the launcher grid.
 */
export interface LauncherPlatform {
  readonly key: string;
  readonly label: string;
  readonly platformKey: string;
  readonly url: string;
  readonly icon: string;
  readonly faviconUrl?: string;
}

/**
 * Event emitted when the user chooses a destination from the launcher.
 */
export interface LiveViewLaunchEvent {
  /** The URL to open in the Firecrawl live-view session. */
  readonly url: string;
  /** Optional platform key (e.g. 'hudl') for analytics/profile lookup. */
  readonly platformKey?: string;
  /** How the user triggered the launch. */
  readonly source: 'account' | 'custom-url';
}

interface LiveViewStoryBenefit {
  readonly title: string;
  readonly copy: string;
}

interface LiveViewStory {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly urlSectionTitle: string;
  readonly urlSectionDescription: string;
  readonly helperText: string;
  readonly quickLaunchDescription: string;
  readonly tipText: string;
  readonly benefits: readonly LiveViewStoryBenefit[];
}

interface LauncherPlatformConfig {
  readonly key: string;
  readonly label: string;
  readonly fallbackUrl: string;
  readonly icon: string;
  readonly faviconUrl?: string;
}

/** Default platforms shown in the launcher grid. */
const LAUNCHER_PLATFORM_CONFIG: readonly LauncherPlatformConfig[] = [
  {
    key: 'hudl',
    label: 'Hudl',
    fallbackUrl: 'https://www.hudl.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=hudl.com&sz=64',
  },
  {
    key: 'maxpreps',
    label: 'MaxPreps',
    fallbackUrl: 'https://www.maxpreps.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=maxpreps.com&sz=64',
  },
  {
    key: 'twitter',
    label: 'X / Twitter',
    fallbackUrl: 'https://x.com',
    icon: 'twitter',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
  },
  {
    key: '247sports',
    label: '247Sports',
    fallbackUrl: 'https://247sports.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=247sports.com&sz=64',
  },
  {
    key: 'rivals',
    label: 'Rivals',
    fallbackUrl: 'https://www.rivals.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=rivals.com&sz=64',
  },
  {
    key: 'on3',
    label: 'On3',
    fallbackUrl: 'https://www.on3.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=on3.com&sz=64',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    fallbackUrl: 'https://www.instagram.com',
    icon: 'instagram',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64',
  },
  {
    key: 'ncsa',
    label: 'NCSA',
    fallbackUrl: 'https://www.ncsasports.org',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=ncsasports.org&sz=64',
  },
];

const LAUNCHER_PLATFORMS: readonly LauncherPlatform[] = LAUNCHER_PLATFORM_CONFIG.map((platform) => {
  const resolvedPlatform = resolveLiveViewLauncherPlatform(platform.key, platform.fallbackUrl);

  return {
    key: platform.key,
    label: platform.label,
    platformKey: resolvedPlatform.platformKey,
    url: resolvedPlatform.url,
    icon: platform.icon,
    ...(platform.faviconUrl ? { faviconUrl: platform.faviconUrl } : {}),
  };
});

const LiveViewStoryBenefitSchema = z.object({
  title: z.string().min(1),
  copy: z.string().min(1),
});

const LiveViewStorySchema = z.object({
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  urlSectionTitle: z.string().min(1),
  urlSectionDescription: z.string().min(1),
  helperText: z.string().min(1),
  quickLaunchDescription: z.string().min(1),
  tipText: z.string().min(1),
  benefits: z.array(LiveViewStoryBenefitSchema).length(3),
});

const LiveViewStoriesSchema = z.object({
  athlete: LiveViewStorySchema,
  coach: LiveViewStorySchema,
  director: LiveViewStorySchema,
});

const LiveViewRoleSchema = z
  .string()
  .trim()
  .transform((value) => {
    const normalized = value.toLowerCase();
    if (normalized.includes('director')) return 'director' as const;
    if (normalized.includes('coach')) return 'coach' as const;
    return 'athlete' as const;
  })
  .catch('athlete' as const);

const LIVE_VIEW_ROLE_STORIES = LiveViewStoriesSchema.parse({
  athlete: {
    eyebrow: 'Your Personal Scout, Always On',
    title: 'Point Agent X at any page and it tells you what actually matters.',
    description:
      'Think of Live View like having a scout ride shotgun while you browse. You pull up your Hudl film, a rankings page, or a college program site — and Agent X watches it with you, breaks it down, and tells you what to do with it. No more staring at numbers trying to figure out what they mean.',
    urlSectionTitle: 'Drop in Any Link',
    urlSectionDescription:
      'Found a highlight reel, a college roster, a camp page, or an article about a program you are targeting? Paste the link and Agent X will pull out the stuff that actually matters to your recruitment and tell you how to use it.',
    helperText:
      'Agent X reads the page the same way a scout or coach would — looking for things that help or hurt your case and explaining what to pay attention to next.',
    quickLaunchDescription:
      'Jump straight into the platforms where your film lives, your rankings show up, and your recruiting activity happens. No link needed — just pick and go.',
    tipText:
      'You can drop a link into any conversation with Agent X and say "open this" — it will pull up the page and start working through it with you right there.',
    benefits: [
      {
        title: 'Watch your film with a second set of eyes',
        copy: 'Open your Hudl page and ask Agent X what a college coach would notice first. It watches the same clips you do and gives you an honest read.',
      },
      {
        title: 'Know where you actually stand',
        copy: 'Pull up rankings, scouting profiles, or recruiting boards and let Agent X explain what the numbers mean and what is worth chasing.',
      },
      {
        title: 'Research programs the smart way',
        copy: 'Instead of guessing about a school, open their roster, schedule, or social page and let Agent X gather the details that help you make a real decision.',
      },
    ],
  },
  coach: {
    eyebrow: 'Game Prep, Live and in Real Time',
    title: 'Open any page mid-planning and let Agent X do the research for you.',
    description:
      'You are breaking down an opponent, researching a recruit, or trying to understand where your program stands — and you need real information fast. Live View lets Agent X look at the same pages you are looking at and actually help you think through them instead of just pointing you toward more reading.',
    urlSectionTitle: 'Open Any Page You Are Already Looking At',
    urlSectionDescription:
      'Paste a roster page, an opponent film library, a schedule, a recruiting profile, or an article. Agent X will go through it and pull out the information that actually changes how you prepare or who you pursue.',
    helperText:
      'Agent X works through the page the way your staff would in a film session — picking out patterns, flagging things worth noting, and helping you figure out what to do next.',
    quickLaunchDescription:
      'Jump directly into the platforms your staff is already using for film, player research, and program visibility. No setup, no link hunting.',
    tipText:
      'You can ask Agent X to open a page any time during a conversation — mid-game-plan, mid-email draft, mid-recruiting discussion. It fits into how you already work.',
    benefits: [
      {
        title: 'Break down opponents without the extra hours',
        copy: 'Open a team page, film hub, or schedule and ask Agent X to help you prep. It spots tendencies and surfaces the stuff your staff needs to know before tip-off or kickoff.',
      },
      {
        title: 'Research recruits from the source',
        copy: "Instead of reading through pages on your own, open a prospect's profile or highlight page and let Agent X gather what matters and explain what it sees.",
      },
      {
        title: 'Stay connected to live information',
        copy: 'Rankings shift, rosters change, news breaks. Live View means Agent X is always working from what is actually on the page right now, not a cached summary.',
      },
    ],
  },
  director: {
    eyebrow: 'Program Intelligence Without the Legwork',
    title: 'Open any live page and let Agent X turn it into something you can actually act on.',
    description:
      'You are tracking multiple programs, watching how your department looks publicly, keeping tabs on competing schools, and trying to stay ahead of what is happening across your conference. Live View lets Agent X do the information gathering so you can spend your time making decisions instead of hunting for context.',
    urlSectionTitle: 'Open Any Page You Want Reviewed',
    urlSectionDescription:
      'Paste a program site, conference page, staffing announcement, news story, social channel, or public results page. Agent X will read it, summarize what is operationally important, and help you connect it to what your program needs to do.',
    helperText:
      'Agent X reads like a sharp analyst would — looking for what signals risk, what shows momentum, and what your program should respond to before it becomes a bigger issue.',
    quickLaunchDescription:
      'Get into the platforms that show you where programs stand on performance, visibility, and competitive positioning — without having to hunt down links every time.',
    tipText:
      'Ask Agent X to open Live View any time you are mid-conversation and need to ground a decision in something real — a page, a result, an announcement, a ranking.',
    benefits: [
      {
        title: 'Keep a pulse on the full picture',
        copy: 'Open live team pages, department sites, and public channels and let Agent X tell you what is actually worth your attention instead of wading through everything yourself.',
      },
      {
        title: 'Turn scattered information into clear direction',
        copy: 'Agent X takes what is on the page and translates it into executive-level context — what the signal means, what the risk is, and what you should be thinking about next.',
      },
      {
        title: 'Work from what is real, not what is remembered',
        copy: 'Schedules, results, announcements, and social activity change constantly. Live View means Agent X is always starting from the actual source instead of an outdated summary.',
      },
    ],
  },
});

@Component({
  selector: 'nxt1-live-view-launcher',
  standalone: true,
  imports: [FormsModule, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (story(); as story) {
      <div class="launcher" [attr.data-testid]="testIds.CONTAINER">
        <section class="launcher__section" [attr.data-testid]="testIds.URL_SECTION">
          <h3 class="launcher__section-title">{{ story.urlSectionTitle }}</h3>
          <p class="launcher__section-desc">{{ story.urlSectionDescription }}</p>
          <form class="launcher__url-form" (ngSubmit)="onUrlSubmit()">
            <div class="launcher__url-input-wrap">
              <svg
                class="launcher__url-input-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="url"
                class="launcher__url-input"
                placeholder="https://www.hudl.com/profile/12345"
                [(ngModel)]="customUrl"
                name="customUrl"
                autocomplete="url"
                [attr.data-testid]="testIds.URL_INPUT"
              />
            </div>
            <button
              type="submit"
              class="launcher__url-submit"
              [disabled]="!isValidUrl()"
              [attr.data-testid]="testIds.URL_SUBMIT_BUTTON"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </form>
          <p class="launcher__helper-text">{{ story.helperText }}</p>
        </section>

        <section class="launcher__section" [attr.data-testid]="testIds.ACCOUNTS_SECTION">
          <h3 class="launcher__section-title">Quick Launch</h3>
          <p class="launcher__section-desc">{{ story.quickLaunchDescription }}</p>
          <div class="launcher__grid">
            @for (platform of platforms; track platform.key) {
              <button
                type="button"
                class="launcher__card"
                (click)="onAccountSelect(platform)"
                [attr.data-testid]="testIds.ACCOUNT_CARD"
                [attr.data-platform]="platform.key"
              >
                <div class="launcher__card-icon">
                  @if (platform.faviconUrl) {
                    <img
                      [src]="platform.faviconUrl"
                      [alt]="platform.label"
                      class="launcher__card-favicon"
                      width="24"
                      height="24"
                    />
                  } @else {
                    <nxt1-icon [name]="platform.icon" [size]="22"></nxt1-icon>
                  }
                </div>
                <span class="launcher__card-label">{{ platform.label }}</span>
              </button>
            }
          </div>
        </section>

        <div class="launcher__tip">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{{ story.tipText }}</span>
        </div>

        <section class="launcher__hero" aria-label="About live view">
          <p class="launcher__eyebrow">{{ story.eyebrow }}</p>
          <h2 class="launcher__hero-title">{{ story.title }}</h2>
          <p class="launcher__hero-desc">{{ story.description }}</p>

          <div class="launcher__benefits" aria-label="Live view benefits">
            @for (benefit of story.benefits; track benefit.title) {
              <article class="launcher__benefit">
                <h3 class="launcher__benefit-title">{{ benefit.title }}</h3>
                <p class="launcher__benefit-copy">{{ benefit.copy }}</p>
              </article>
            }
          </div>
        </section>
      </div>
    }
  `,
  styles: `
    .launcher {
      --launcher-surface: var(--agent-surface, var(--nxt1-color-surface-100));
      --launcher-surface-hover: var(--agent-surface-hover, var(--nxt1-color-surface-200));
      --launcher-border: var(--agent-border, var(--nxt1-color-border-subtle));
      --launcher-text-primary: var(--agent-text-primary, var(--nxt1-color-text-primary));
      --launcher-text-muted: var(--agent-text-muted, var(--nxt1-color-text-tertiary));
      --launcher-accent: var(--agent-primary, var(--nxt1-color-primary));
      --launcher-accent-glow: var(--agent-primary-glow, var(--nxt1-color-alpha-primary10));
      --launcher-accent-contrast: var(--nxt1-color-bg-primary);

      display: flex;
      flex-direction: column;
      gap: var(--nxt1-spacing-5, 20px);
      padding: var(--nxt1-spacing-5, 20px);
      height: 100%;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .launcher__hero {
      display: flex;
      flex-direction: column;
      gap: var(--nxt1-spacing-3, 12px);
      padding: var(--nxt1-spacing-4, 16px);
      background: var(--launcher-surface-hover);
      border: 1px solid var(--launcher-border);
      border-radius: 16px;
    }

    .launcher__eyebrow {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--launcher-accent);
    }

    .launcher__hero-title {
      margin: 0;
      font-size: 1.125rem;
      line-height: 1.25;
      color: var(--launcher-text-primary);
    }

    .launcher__hero-desc {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--launcher-text-muted);
    }

    .launcher__benefits {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__benefit {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: var(--nxt1-spacing-3, 12px);
      background: var(--launcher-surface);
      border: 1px solid var(--launcher-border);
      border-radius: 12px;
    }

    .launcher__benefit-title {
      margin: 0;
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--launcher-text-primary);
    }

    .launcher__benefit-copy {
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--launcher-text-muted);
    }

    .launcher__section {
      display: flex;
      flex-direction: column;
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__section-title {
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--launcher-text-primary);
      margin: 0;
    }

    .launcher__section-desc {
      font-size: 0.8125rem;
      color: var(--launcher-text-muted);
      margin: 0 0 var(--nxt1-spacing-2, 8px);
      line-height: 1.4;
    }

    .launcher__url-form {
      display: flex;
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__helper-text {
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--launcher-text-muted);
    }

    .launcher__url-input-wrap {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .launcher__url-input-icon {
      position: absolute;
      left: 12px;
      color: var(--launcher-text-muted);
      pointer-events: none;
    }

    .launcher__url-input {
      width: 100%;
      padding: 10px 12px 10px 36px;
      font-size: 0.875rem;
      font-family: inherit;
      color: var(--launcher-text-primary);
      background: var(--launcher-surface);
      border: 1px solid var(--launcher-border);
      border-radius: 10px;
      outline: none;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        background-color 0.15s ease;
    }

    .launcher__url-input::placeholder {
      color: var(--launcher-text-muted);
    }

    .launcher__url-input:focus {
      border-color: var(--launcher-accent);
      box-shadow: 0 0 0 1px var(--launcher-accent-glow);
    }

    .launcher__url-submit {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      min-width: 40px;
      height: 40px;
      border: none;
      border-radius: 10px;
      background: var(--launcher-accent);
      color: var(--launcher-accent-contrast);
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.1s ease;
      box-shadow: 0 0 0 1px var(--launcher-accent-glow);
    }

    .launcher__url-submit:hover:not(:disabled) {
      background: color-mix(in srgb, var(--launcher-accent) 88%, white);
    }

    .launcher__url-submit:active:not(:disabled) {
      transform: scale(0.95);
    }

    .launcher__url-submit:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .launcher__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--nxt1-spacing-2, 8px);
      padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
      background: var(--launcher-surface);
      border: 1px solid var(--launcher-border);
      border-radius: 12px;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease,
        transform 0.1s ease;
      color: var(--launcher-text-primary);
      font-family: inherit;
    }

    .launcher__card:hover {
      border-color: var(--launcher-accent);
      background: color-mix(in srgb, var(--launcher-accent) 8%, var(--launcher-surface));
    }

    .launcher__card:active {
      transform: scale(0.97);
    }

    .launcher__card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--launcher-accent-glow) 72%, transparent);
    }

    .launcher__card-favicon {
      border-radius: 6px;
      object-fit: contain;
    }

    .launcher__card-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-align: center;
      line-height: 1.2;
      word-break: break-word;
    }

    .launcher__tip {
      display: flex;
      align-items: center;
      gap: var(--nxt1-spacing-2, 8px);
      padding: var(--nxt1-spacing-3, 12px);
      font-size: 0.75rem;
      color: var(--launcher-text-muted);
      background: var(--launcher-surface-hover);
      border: 1px solid var(--launcher-border);
      border-radius: 10px;
      line-height: 1.4;
      margin-top: auto;
    }

    .launcher__tip svg {
      flex-shrink: 0;
    }

    @media (min-width: 640px) {
      .launcher__benefits {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class LiveViewLauncherComponent {
  readonly role = input<string | null>(null);

  private readonly logger = inject(NxtLoggingService).child('LiveViewLauncher');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  protected readonly testIds = TEST_IDS.LIVE_VIEW_LAUNCHER;
  readonly launch = output<LiveViewLaunchEvent>();

  protected customUrl = '';
  protected readonly platforms = LAUNCHER_PLATFORMS;
  protected readonly story = computed<LiveViewStory>(() => {
    const normalizedRole = LiveViewRoleSchema.parse(this.role() ?? '');
    return LIVE_VIEW_ROLE_STORIES[normalizedRole];
  });

  protected isValidUrl(): boolean {
    const url = this.customUrl.trim();
    return url.length > 0 && /^https?:\/\/.+\..+/.test(url);
  }

  constructor() {
    this.logger.info('Launcher opened');
    this.breadcrumb.trackStateChange('live-view-launcher-opened');
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_LAUNCHER_OPENED);
  }

  protected async onAccountSelect(platform: LauncherPlatform): Promise<void> {
    await this.haptics.impact('light');
    this.logger.info('Account selected', { platform: platform.key });
    this.breadcrumb.trackStateChange('live-view-account-selected', { platformKey: platform.key });
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_LAUNCHER_ACCOUNT_SELECTED, {
      platformKey: platform.key,
    });

    this.launch.emit({
      url: platform.url,
      platformKey: platform.platformKey,
      source: 'account',
    });
  }

  protected async onUrlSubmit(): Promise<void> {
    const url = this.customUrl.trim();
    if (!url || !this.isValidUrl()) return;

    await this.haptics.impact('light');
    this.logger.info('Custom URL submitted', { url });
    this.breadcrumb.trackStateChange('live-view-url-submitted');
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_LAUNCHER_URL_SUBMITTED);

    this.launch.emit({
      url,
      source: 'custom-url',
    });
  }
}
