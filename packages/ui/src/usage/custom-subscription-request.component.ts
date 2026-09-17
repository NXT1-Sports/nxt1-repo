import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { UsageApiService } from './usage-api.service';
import type { DemoRequestRole } from '@nxt1/core';

export interface CustomSubscriptionProfile {
  readonly name?: string | null;
  readonly email?: string | null;
  readonly organization?: string | null;
  readonly role?: DemoRequestRole | null;
  readonly sport?: string | null;
}

@Component({
  selector: 'nxt1-custom-subscription-request',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (submitted()) {
      <div class="subscription-success" role="status">
        <h3>Thanks, {{ name() }}.</h3>
        <p>Our team will review your needs and reach out to schedule a conversation.</p>
        <button type="button" class="subscription-secondary-btn" (click)="close.emit()">
          Done
        </button>
      </div>
    } @else {
      <p class="subscription-intro">
        Tell us about your organization, usage, and goals so we can shape a subscription around what
        you actually need.
      </p>

      <form class="subscription-form" (submit)="submit($event)">
        <label>
          <span>Name</span>
          <input required type="text" [value]="name()" (input)="name.set(value($event))" />
        </label>
        <label>
          <span>Work Email</span>
          <input required type="email" [value]="email()" (input)="email.set(value($event))" />
        </label>
        <label>
          <span>Organization / Program</span>
          <input
            required
            type="text"
            [value]="organization()"
            (input)="organization.set(value($event))"
          />
        </label>
        <label>
          <span>Role</span>
          <select [value]="role()" (change)="role.set(roleValue($event))">
            <option value="">Select a role</option>
            <option value="coach">Coach</option>
            <option value="director">Athletic Director</option>
            <option value="program-admin">Program Administrator</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span>Sport (optional)</span>
          <input type="text" [value]="sport()" (input)="sport.set(value($event))" />
        </label>
        <label>
          <span>Preferred meeting time (optional)</span>
          <input
            type="text"
            placeholder="e.g. Tuesday afternoon CT"
            [value]="preferredTime()"
            (input)="preferredTime.set(value($event))"
          />
        </label>
        <label class="subscription-form__full-width">
          <span>What should we know about your needs?</span>
          <textarea
            rows="4"
            placeholder="Team size, expected usage, workflows, goals, or anything else that would help us prepare."
            [value]="notes()"
            (input)="notes.set(value($event))"
          ></textarea>
        </label>

        @if (error()) {
          <p class="subscription-error" role="alert">{{ error() }}</p>
        }

        <button
          type="submit"
          class="subscription-submit-btn subscription-form__full-width"
          [disabled]="submitting() || !isValid()"
        >
          {{ submitting() ? 'Sending request...' : 'Request a Subscription Conversation' }}
        </button>
      </form>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .subscription-intro,
      .subscription-success p {
        margin: 0 0 18px;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        line-height: 1.5;
      }
      .subscription-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      label {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      label span {
        color: var(--nxt1-color-text-secondary, #94a3b8);
        font-size: 12px;
        font-weight: 600;
      }
      input,
      select,
      textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: 8px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #f1f5f9);
        padding: 10px 12px;
        font: inherit;
      }
      textarea {
        resize: vertical;
      }
      .subscription-form__full-width {
        grid-column: 1 / -1;
      }
      .subscription-submit-btn,
      .subscription-secondary-btn {
        border: 0;
        border-radius: 8px;
        padding: 11px 16px;
        background: var(--nxt1-color-primary, #fff);
        color: var(--nxt1-color-text-onPrimary, #000);
        font-weight: 700;
        cursor: pointer;
      }
      .subscription-submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .subscription-secondary-btn {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }
      .subscription-success h3 {
        margin: 0 0 8px;
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }
      .subscription-error {
        grid-column: 1 / -1;
        margin: 0;
        color: var(--nxt1-color-error, #ef4444);
        font-size: 13px;
      }
      @media (max-width: 640px) {
        .subscription-form {
          grid-template-columns: 1fr;
        }
        .subscription-form__full-width {
          grid-column: auto;
        }
      }
    `,
  ],
})
export class CustomSubscriptionRequestComponent implements OnInit {
  private readonly usageApi = inject(UsageApiService);

  readonly profile = input<CustomSubscriptionProfile | null>(null);
  readonly close = output<void>();
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly organization = signal('');
  protected readonly role = signal<DemoRequestRole | ''>('');
  protected readonly sport = signal('');
  protected readonly preferredTime = signal('');
  protected readonly notes = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isValid = computed(
    () =>
      this.name().trim().length > 1 &&
      this.email().includes('@') &&
      this.organization().trim().length > 1
  );

  ngOnInit(): void {
    const profile = this.profile();
    this.name.set(profile?.name?.trim() ?? '');
    this.email.set(profile?.email?.trim() ?? '');
    this.organization.set(profile?.organization?.trim() ?? '');
    this.role.set(profile?.role ?? '');
    this.sport.set(profile?.sport?.trim() ?? '');
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected roleValue(event: Event): DemoRequestRole | '' {
    return this.value(event) as DemoRequestRole | '';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.isValid() || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.usageApi.submitCustomSubscriptionRequest({
        requestType: 'subscription',
        name: this.name().trim(),
        email: this.email().trim(),
        organization: this.organization().trim(),
        role: this.role() || undefined,
        sport: this.sport().trim() || undefined,
        preferredDemoTime: this.preferredTime().trim() || undefined,
        notes: `[Custom subscription inquiry] ${this.notes().trim() || 'Customer requested a custom subscription conversation.'}`,
      });
      this.submitted.set(true);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Unable to send your request. Please try again.'
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
