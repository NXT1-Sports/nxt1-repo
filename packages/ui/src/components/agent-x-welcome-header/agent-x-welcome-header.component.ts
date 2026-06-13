import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { NxtMarketingInputBarComponent } from '../marketing-input-bar';

@Component({
  selector: 'nxt1-agent-x-welcome-header',
  standalone: true,
  imports: [CommonModule, NxtMarketingInputBarComponent],
  template: `
    <section class="agentx-hero" aria-labelledby="agentx-title">
      <div class="agentx-header__bg" aria-hidden="true">
        <div class="agentx-orb agentx-orb--one"></div>
        <div class="agentx-orb agentx-orb--two"></div>
        <div class="agentx-grid"></div>
      </div>

      <div class="agentx-hero__content">
        <div class="agentx-copy">
          <p class="agentx-badge">Agent X • Online</p>

          <h1 id="agentx-title" class="agentx-title">
            <span class="agentx-title__line">Your Sports Intelligence</span>
            <span class="agentx-title__line">Command Center</span>
          </h1>

          <div class="agentx-typed-container">
            <p class="agentx-typed-ghost" aria-hidden="true">{{ message() }}&nbsp;</p>
            <p class="agentx-typed" [attr.aria-label]="message()">
              {{ displayText() }}<span class="agentx-cursor" aria-hidden="true"></span>
            </p>
          </div>

          <div class="agentx-command-zone">
            <nxt1-marketing-input-bar
              [placeholder]="commandPlaceholder()"
              [value]="commandInput()"
              ariaLabel="Command Agent X"
              buttonLabel="Ask NXT1"
              [active]="true"
              (valueChange)="commandInput.set($event)"
              (submitCommand)="onCommandSubmit($event)"
              (submitButtonClick)="navigateToAuth()"
            />
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        --nxt1-agentx-hero-min-height: clamp(
          40rem,
          calc(100vh - var(--nxt1-nav-height, 56px) - (var(--nxt1-spacing-4) * 2)),
          54rem
        );
        --nxt1-agentx-hero-min-height-tablet: clamp(36rem, 82vh, 50rem);
        --nxt1-agentx-hero-min-height-mobile: clamp(34rem, 84vh, 44rem);
      }

      .agentx-hero {
        position: relative;
        min-height: var(--nxt1-agentx-hero-min-height);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
      }

      .agentx-header__bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .agentx-hero__content {
        position: relative;
        z-index: 1;
        width: 100%;
        padding: clamp(var(--nxt1-spacing-8), 6vw, var(--nxt1-spacing-10))
          clamp(var(--nxt1-spacing-5), 4vw, var(--nxt1-spacing-8));
      }

      .agentx-copy {
        width: 100%;
        max-width: min(70rem, 100%);
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .agentx-orb {
        position: absolute;
        border-radius: 9999px;
        filter: blur(48px);
        opacity: 0.45;
        animation: orbFloat 10s ease-in-out infinite;
      }

      .agentx-orb--one {
        top: -120px;
        left: -80px;
        width: 280px;
        height: 280px;
        background: color-mix(in srgb, var(--nxt1-color-primary) 35%, transparent);
      }

      .agentx-orb--two {
        right: -80px;
        bottom: -140px;
        width: 300px;
        height: 300px;
        background: color-mix(in srgb, var(--nxt1-color-secondary) 32%, transparent);
        animation-delay: 1.5s;
      }

      .agentx-grid {
        position: absolute;
        inset: 0;
        opacity: 0.18;
        background-image:
          linear-gradient(
            to right,
            color-mix(in srgb, var(--nxt1-color-border-default) 65%, transparent) 1px,
            transparent 1px
          ),
          linear-gradient(
            to bottom,
            color-mix(in srgb, var(--nxt1-color-border-default) 65%, transparent) 1px,
            transparent 1px
          );
        background-size: 24px 24px;
      }

      .agentx-badge {
        display: inline-flex;
        align-items: center;
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 80%, transparent);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .agentx-title {
        margin: var(--nxt1-spacing-3) 0 var(--nxt1-spacing-2) 0;
        max-width: 22ch;
        color: var(--nxt1-color-text-primary);
        font-size: clamp(3rem, 7vw, 4.75rem);
        line-height: 1.05;
        font-weight: var(--nxt1-fontWeight-bold);
        text-wrap: balance;
      }

      .agentx-title__line {
        display: block;
      }

      .agentx-typed-container {
        position: relative;
        max-width: min(72ch, 100%);
      }

      .agentx-typed-ghost {
        visibility: hidden;
        margin: 0;
        font-size: clamp(1.05rem, 1.8vw, 1.35rem);
        line-height: 1.5;
      }

      .agentx-typed {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-size: clamp(1.05rem, 1.8vw, 1.35rem);
        line-height: 1.5;
      }

      .agentx-command-zone {
        width: 100%;
        max-width: 38rem;
        margin-top: var(--nxt1-spacing-6);
        margin-bottom: var(--nxt1-spacing-5);
      }

      .agentx-cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        margin-left: 6px;
        vertical-align: -0.15em;
        background: var(--nxt1-color-primary);
        animation: blink 1s step-end infinite;
      }

      @media (max-width: 768px) {
        .agentx-hero {
          min-height: var(--nxt1-agentx-hero-min-height-mobile);
        }

        .agentx-hero__content {
          padding: var(--nxt1-spacing-7) var(--nxt1-spacing-4) var(--nxt1-spacing-8);
        }

        .agentx-title {
          font-size: clamp(2.5rem, 9vw, 3.5rem);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .agentx-orb,
        .agentx-cursor {
          animation: none;
        }
      }

      @keyframes orbFloat {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-12px);
        }
      }

      @keyframes blink {
        0%,
        45% {
          opacity: 1;
        }
        46%,
        100% {
          opacity: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXWelcomeHeaderComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private typingStarted = false;
  private placeholderTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly commandPlaceholderPhrases = [
    'What do you need Agent X to execute?',
    'Build the game plan for this week...',
    'Analyze film and surface the edge...',
    'Create the briefing for staff review...',
    'Package content and publish the rollout...',
  ] as const;

  readonly message = input(
    "Hi, I'm Agent X — the execution engine for athletes, coaches, directors, and programs. I build the briefings, creative, film packages, and intelligence that keep your operation moving."
  );
  readonly typingSpeedMs = input(24);
  readonly animateOnLoad = input(true);
  protected readonly commandInput = signal('');
  private readonly _commandPlaceholder = signal<string>(this.commandPlaceholderPhrases[0]);
  protected readonly commandPlaceholder = computed(() => this._commandPlaceholder());

  private readonly _displayText = signal('');
  readonly displayText = computed(() => this._displayText());

  ngOnInit(): void {
    if (!this.animateOnLoad()) {
      this._displayText.set(this.message());
      return;
    }

    if (!isPlatformBrowser(this.platformId)) {
      this._displayText.set(this.message());
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      this._displayText.set(this.message());
      return;
    }

    this.startPlaceholderAnimation();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.startTyping();
            observer.disconnect();
            break;
          }
        }
      },
      {
        threshold: 0.2,
      }
    );

    observer.observe(this.hostElement.nativeElement);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();

      if (this.placeholderTimer) {
        clearTimeout(this.placeholderTimer);
      }
    });
  }

  protected onCommandSubmit(command: string): void {
    if (!command.trim()) {
      return;
    }

    this.commandInput.set('');
    void this.navigateToAuth(command.trim());
  }

  protected navigateToAuth(command?: string): Promise<boolean> {
    return this.router.navigate(['/auth'], {
      queryParams: command ? { q: command } : undefined,
    });
  }

  private startTyping(): void {
    if (this.typingStarted) {
      return;
    }

    this.typingStarted = true;

    const fullText = this.message();
    let index = 0;

    const timer = window.setInterval(
      () => {
        index += 1;
        this._displayText.set(fullText.slice(0, index));

        if (index >= fullText.length) {
          window.clearInterval(timer);
        }
      },
      Math.max(12, this.typingSpeedMs())
    );

    this.destroyRef.onDestroy(() => window.clearInterval(timer));
  }

  private startPlaceholderAnimation(): void {
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    const typingSpeed = 26;
    const deletingSpeed = 15;
    const pauseBetweenPhrases = 1200;

    const animate = () => {
      const currentPhrase = this.commandPlaceholderPhrases[phraseIndex];

      if (isDeleting) {
        charIndex -= 1;

        if (charIndex < 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % this.commandPlaceholderPhrases.length;
          this.placeholderTimer = setTimeout(animate, 280);
          return;
        }
      } else {
        charIndex += 1;

        if (charIndex > currentPhrase.length) {
          isDeleting = true;
          this.placeholderTimer = setTimeout(animate, pauseBetweenPhrases);
          return;
        }
      }

      this._commandPlaceholder.set(currentPhrase.slice(0, charIndex));
      this.placeholderTimer = setTimeout(animate, isDeleting ? deletingSpeed : typingSpeed);
    };

    animate();
  }
}
