import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DEFAULT_SOCIAL_LINKS, type SocialLink } from '@nxt1/core';
import { NxtLogoComponent } from '../logo';
import { NxtIconComponent } from '../icon';
import { NxtMarketingInputBarComponent } from '../marketing-input-bar';

@Component({
  selector: 'nxt1-site-footer-compact',
  standalone: true,
  imports: [RouterLink, NxtLogoComponent, NxtIconComponent, NxtMarketingInputBarComponent],
  template: `
    <footer class="site-footer-compact" role="contentinfo" aria-label="Site footer">
      <div class="site-footer-compact__inner">
        <div class="site-footer-compact__card">
          <div class="site-footer-compact__brand">
            <nxt1-logo variant="footer" size="sm" />
          </div>

          <div class="site-footer-compact__command-slot">
            <nxt1-marketing-input-bar
              class="site-footer-compact__input"
              [value]="commandText"
              [placeholder]="footerCommandPlaceholder()"
              ariaLabel="Ask Agent X"
              buttonLabel="Ask NXT1"
              [active]="true"
              (valueChange)="commandText = $event"
              (submitCommand)="onSubmitCommand($event)"
              (submitButtonClick)="onSubmitButtonClick()"
            />
          </div>

          <nav class="site-footer-compact__links" aria-label="Footer links">
            <div class="site-footer-compact__links-row site-footer-compact__links-row--primary">
              <a class="site-footer-compact__link" routerLink="/agent-x">Agent X</a>
              <a class="site-footer-compact__link" routerLink="/programs">Programs</a>
              <a class="site-footer-compact__link" routerLink="/terms">Terms</a>
              <a class="site-footer-compact__link" routerLink="/privacy">Privacy</a>
            </div>

            <div class="site-footer-compact__links-row site-footer-compact__links-row--social">
              <span class="site-footer-compact__follow-label">Follow Us</span>
              <div class="site-footer-compact__social" aria-label="Social media links">
                @for (social of socials; track social.id) {
                  <a
                    class="site-footer-compact__social-link"
                    [href]="social.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    [attr.aria-label]="social.ariaLabel"
                  >
                    <nxt1-icon [name]="social.icon" [size]="16" />
                  </a>
                }
              </div>
            </div>
          </nav>

          <p class="site-footer-compact__copyright">
            &copy; {{ currentYear }} {{ companyName() }}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .site-footer-compact {
        background: transparent;
      }

      .site-footer-compact__inner {
        max-width: var(--nxt1-root-shell-max-width, 88rem);
        margin: 0 auto;
        padding: var(--nxt1-spacing-6, 24px) var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-8, 32px);
      }

      .site-footer-compact__card {
        border: 1px solid color-mix(in srgb, var(--nxt1-color-border-default) 45%, transparent);
        border-radius: var(--nxt1-borderRadius-xl, 16px);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 72%, transparent);
        backdrop-filter: blur(16px);
        padding: var(--nxt1-spacing-5, 20px);
        display: grid;
        gap: var(--nxt1-spacing-4, 16px);
        grid-template-columns: 1fr;
        grid-template-areas:
          'brand'
          'command'
          'links'
          'copyright';
      }

      .site-footer-compact__brand {
        display: grid;
        gap: var(--nxt1-spacing-2, 8px);
        grid-area: brand;
      }

      .site-footer-compact__command-slot {
        display: flex;
        align-items: center;
        grid-area: command;
      }

      .site-footer-compact__input {
        width: 100%;
      }

      @media (min-width: 1024px) {
        .site-footer-compact__card {
          grid-template-columns: minmax(0, 1fr) minmax(360px, 520px);
          grid-template-areas:
            'brand command'
            'links command'
            'copyright command';
          align-items: center;
          column-gap: var(--nxt1-spacing-6, 24px);
        }

        .site-footer-compact__command-slot {
          justify-content: flex-end;
        }
      }

      .site-footer-compact__links {
        display: grid;
        gap: var(--nxt1-spacing-2, 8px);
        grid-area: links;
      }

      .site-footer-compact__links-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        row-gap: var(--nxt1-spacing-2, 8px);
      }

      .site-footer-compact__link,
      .site-footer-compact__follow-label {
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary, #6b7280);
      }

      .site-footer-compact__link {
        text-decoration: none;
        transition: color 0.15s ease;
      }

      .site-footer-compact__link:hover,
      .site-footer-compact__link:focus-visible {
        color: var(--nxt1-color-text-primary, #111827);
      }

      .site-footer-compact__link:focus-visible,
      .site-footer-compact__social-link:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #3b82f6);
        outline-offset: 2px;
        border-radius: var(--nxt1-borderRadius-sm, 4px);
      }

      .site-footer-compact__social {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5, 6px);
      }

      .site-footer-compact__social-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        text-decoration: none;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        transition:
          background-color 0.15s ease,
          color 0.15s ease;
      }

      .site-footer-compact__social-link:hover {
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 55%, transparent);
        color: var(--nxt1-color-text-primary, #111827);
      }

      .site-footer-compact__copyright {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        grid-area: copyright;
      }

      @media (max-width: 640px) {
        .site-footer-compact__inner {
          padding-left: var(--nxt1-spacing-3, 12px);
          padding-right: var(--nxt1-spacing-3, 12px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .site-footer-compact__link,
        .site-footer-compact__social-link {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSiteFooterCompactComponent {
  readonly companyName = input<string>('NXT1 Sports');
  protected readonly socials: readonly SocialLink[] = DEFAULT_SOCIAL_LINKS;
  protected readonly currentYear = new Date().getFullYear();

  protected commandText = '';

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly footerTypewriterPhrases = [
    'Ask Agent X to execute a workflow...',
    'Analyze film and generate actionable intel...',
    "Build this week's execution playbook...",
    'Create media and publish in one flow...',
    'Run operations while you focus on performance...',
  ];

  private readonly _displayedPlaceholder = signal(this.footerTypewriterPhrases[0]);
  protected readonly footerCommandPlaceholder = computed(() => this._displayedPlaceholder());

  private placeholderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => {
      this.startPlaceholderAnimation();
    });

    this.destroyRef.onDestroy(() => {
      if (this.placeholderTimer) {
        clearTimeout(this.placeholderTimer);
      }
    });
  }

  private startPlaceholderAnimation(): void {
    if (typeof window === 'undefined') return;

    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const typingSpeed = 25;
    const deletingSpeed = 15;
    const pauseBetweenPhrases = 1000;

    const animate = () => {
      const currentPhrase = this.footerTypewriterPhrases[phraseIndex];

      if (isDeleting) {
        charIndex--;
        if (charIndex < 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % this.footerTypewriterPhrases.length;
          this.placeholderTimer = setTimeout(animate, 300);
          return;
        }
      } else {
        charIndex++;
        if (charIndex > currentPhrase.length) {
          isDeleting = true;
          this.placeholderTimer = setTimeout(animate, pauseBetweenPhrases);
          return;
        }
      }

      this._displayedPlaceholder.set(currentPhrase.substring(0, charIndex));
      this.placeholderTimer = setTimeout(animate, isDeleting ? deletingSpeed : typingSpeed);
    };

    animate();
  }

  protected onSubmitCommand(command: string): void {
    if (!command) return;
    this.router.navigate(['/auth']);
    this.commandText = '';
  }

  protected onSubmitButtonClick(): void {
    this.router.navigate(['/auth']);
  }
}
