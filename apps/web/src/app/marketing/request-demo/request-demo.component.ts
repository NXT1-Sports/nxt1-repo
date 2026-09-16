/**
 * @fileoverview Request Demo — Public Lead Capture Page
 * @module apps/web/features/marketing/request-demo
 *
 * Public, unauthenticated demo request form reached from the landing hero's
 * secondary CTA. Submits to the public /marketing/demo-request endpoint.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TEST_IDS } from '@nxt1/core/testing';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import type { DemoRequestRole } from '@nxt1/core';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { PerformanceService } from '../../core/services/infrastructure/performance.service';
import { SeoService } from '../../core/services/web/seo.service';
import { DemoRequestApiService } from './request-demo-api.service';

const DEMO_REQUEST_ROLES: ReadonlyArray<{
  readonly value: DemoRequestRole;
  readonly label: string;
}> = [
  { value: 'coach', label: 'Coach' },
  { value: 'director', label: 'Athletic Director' },
  { value: 'program-admin', label: 'Program Administrator' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-request-demo',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <main class="request-demo" id="main-content" role="main">
      <section class="request-demo__card" aria-labelledby="request-demo-title">
        @if (submitted()) {
          <div [attr.data-testid]="testIds.SUCCESS_STATE" class="request-demo__success">
            <h1 id="request-demo-title" class="request-demo__title">You're on the list.</h1>
            <p class="request-demo__subtitle">
              Thanks{{ name() ? ', ' + name() : '' }} — our team will reach out shortly to schedule
              your NXT1 demo.
            </p>
            <a routerLink="/" class="request-demo__back-link">Back to NXT1</a>
          </div>
        } @else {
          <h1 id="request-demo-title" class="request-demo__title">Request a Demo</h1>
          <p class="request-demo__subtitle">
            Tell us about your program and we'll set up a personalized walkthrough of NXT1.
          </p>

          <form
            [attr.data-testid]="testIds.FORM"
            class="request-demo__form"
            (submit)="onSubmit($event)"
          >
            <label class="request-demo__field">
              <span class="request-demo__label">Name</span>
              <input
                type="text"
                required
                [attr.data-testid]="testIds.INPUT_NAME"
                [value]="name()"
                (input)="name.set(inputValue($event))"
              />
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Work Email</span>
              <input
                type="email"
                required
                [attr.data-testid]="testIds.INPUT_EMAIL"
                [value]="email()"
                (input)="email.set(inputValue($event))"
              />
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Organization / Program</span>
              <input
                type="text"
                required
                [attr.data-testid]="testIds.INPUT_ORGANIZATION"
                [value]="organization()"
                (input)="organization.set(inputValue($event))"
              />
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Role</span>
              <select [value]="role()" (change)="role.set(roleValue($event))">
                <option value="">Select a role</option>
                @for (option of roleOptions; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Sport (optional)</span>
              <input
                type="text"
                [attr.data-testid]="testIds.INPUT_SPORT"
                [value]="sport()"
                (input)="sport.set(inputValue($event))"
              />
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Preferred Demo Date (optional)</span>
              <input
                type="date"
                [attr.data-testid]="testIds.INPUT_PREFERRED_DATE"
                [value]="preferredDemoDate()"
                (input)="preferredDemoDate.set(inputValue($event))"
              />
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Preferred Time (optional)</span>
              <input
                type="text"
                [attr.data-testid]="testIds.INPUT_PREFERRED_TIME"
                [value]="preferredDemoTime()"
                (input)="preferredDemoTime.set(inputValue($event))"
                placeholder="e.g. 3 PM CT"
              />
            </label>

            <label class="request-demo__field">
              <span class="request-demo__label">Notes (optional)</span>
              <textarea
                rows="3"
                [attr.data-testid]="testIds.INPUT_NOTES"
                [value]="notes()"
                (input)="notes.set(inputValue($event))"
              ></textarea>
            </label>

            @if (errorMessage()) {
              <p [attr.data-testid]="testIds.ERROR_STATE" class="request-demo__error" role="alert">
                {{ errorMessage() }}
              </p>
            }

            <button
              type="submit"
              class="request-demo__submit"
              [attr.data-testid]="testIds.SUBMIT_BUTTON"
              [disabled]="submitting() || !isFormValid()"
            >
              {{ submitting() ? 'Submitting…' : 'Request Demo' }}
            </button>
          </form>
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }

      .request-demo {
        display: flex;
        justify-content: center;
        padding: var(--nxt1-spacing-10) var(--nxt1-spacing-4);
      }

      .request-demo__card {
        width: 100%;
        max-width: 32rem;
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      .request-demo__title {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .request-demo__subtitle {
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .request-demo__form {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      .request-demo__field {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
      }

      .request-demo__label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
      }

      .request-demo__field input,
      .request-demo__field select,
      .request-demo__field textarea {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        padding: var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
      }

      .request-demo__error {
        color: var(--nxt1-color-error, #ef4444);
        font-size: var(--nxt1-fontSize-sm);
        margin: 0;
      }

      .request-demo__submit {
        border: none;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        cursor: pointer;
      }

      .request-demo__submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .request-demo__back-link {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDemoComponent implements OnInit {
  private readonly demoRequestApi = inject(DemoRequestApiService);
  private readonly seoService = inject(SeoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly logger = inject(NxtLoggingService).child('RequestDemoComponent');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PerformanceService);

  protected readonly testIds = TEST_IDS.DEMO_REQUEST;
  protected readonly roleOptions = DEMO_REQUEST_ROLES;

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly organization = signal('');
  protected readonly role = signal<DemoRequestRole | ''>('');
  protected readonly sport = signal('');
  protected readonly preferredDemoDate = signal('');
  protected readonly preferredDemoTime = signal('');
  protected readonly notes = signal('');

  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly isFormValid = computed(
    () =>
      this.name().trim().length > 1 &&
      this.email().includes('@') &&
      this.organization().trim().length > 1
  );

  ngOnInit(): void {
    this.seoService.applySeoConfig({
      page: {
        title: 'Request a Demo | NXT1 Sports',
        description:
          'Request a personalized demo of Agent X, the AI command center for sports programs.',
        canonicalUrl: 'https://nxt1sports.com/request-demo',
      },
    });
    this.analytics?.trackEvent(APP_EVENTS.DEMO_REQUEST_VIEWED, {});
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected roleValue(event: Event): DemoRequestRole | '' {
    return (event.target as HTMLSelectElement).value as DemoRequestRole | '';
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.isFormValid() || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.breadcrumb.trackStateChange('request-demo:submitting');

    try {
      await this.performance.trace(TRACE_NAMES.DEMO_REQUEST_SUBMIT, () =>
        this.demoRequestApi.submit({
          name: this.name().trim(),
          email: this.email().trim(),
          organization: this.organization().trim(),
          role: this.role() || undefined,
          sport: this.sport().trim() || undefined,
          preferredDemoDate: this.preferredDemoDate() || undefined,
          preferredDemoTime: this.preferredDemoTime().trim() || undefined,
          notes: this.notes().trim() || undefined,
        })
      );

      this.submitted.set(true);
      this.logger.info('Demo request submitted');
      this.analytics?.trackEvent(APP_EVENTS.DEMO_REQUEST_SUBMITTED, {});
      if (isPlatformBrowser(this.platformId)) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit demo request';
      this.logger.error('Failed to submit demo request', err);
      this.analytics?.trackEvent(APP_EVENTS.DEMO_REQUEST_ERROR, {});
      this.errorMessage.set(message);
    } finally {
      this.submitting.set(false);
    }
  }
}
