/**
 * @fileoverview Agent X Parameter Form Card — Inline Input Form
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a small inline form card in the Agent X chat timeline.
 * Supports text, number, select, and toggle field types.
 * Emits the collected key/value pairs when the user submits.
 * One-shot: disables after submission.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  AgentXRichCard,
  AgentXParameterField,
  AgentXParameterFormPayload,
} from '@nxt1/core/ai';

/** Event emitted when the user submits the parameter form. */
export interface ParameterFormSubmitEvent {
  /** The card title (for context). */
  readonly cardTitle: string;
  /** Key/value map of the submitted field values. */
  readonly values: Record<string, string | number | boolean>;
}

@Component({
  selector: 'nxt1-agent-x-parameter-form-card',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-card" [class.form-card--submitted]="submitted()">
      <div class="form-card__header">
        <svg class="form-card__icon" viewBox="0 0 20 20" fill="none">
          <rect
            x="3"
            y="3"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <line
            x1="6"
            y1="7"
            x2="14"
            y2="7"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <line
            x1="6"
            y1="10"
            x2="12"
            y2="10"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <line
            x1="6"
            y1="13"
            x2="10"
            y2="13"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </svg>
        <span class="form-card__title">{{ card().title }}</span>
      </div>

      <form class="form-card__body" (ngSubmit)="onSubmit()">
        @for (field of fields(); track field.key) {
          <div class="form-field">
            <label class="form-field__label" [for]="'agx-param-' + field.key">{{
              field.label
            }}</label>

            @if (field.type === 'text') {
              <input
                class="form-field__input"
                type="text"
                [id]="'agx-param-' + field.key"
                [placeholder]="field.placeholder ?? ''"
                [disabled]="submitted()"
                [ngModel]="formValues()[field.key]"
                (ngModelChange)="onFieldChange(field.key, $event)"
                [name]="field.key"
              />
            } @else if (field.type === 'number') {
              <input
                class="form-field__input"
                type="number"
                [id]="'agx-param-' + field.key"
                [placeholder]="field.placeholder ?? ''"
                [disabled]="submitted()"
                [ngModel]="formValues()[field.key]"
                (ngModelChange)="onFieldChange(field.key, $event)"
                [name]="field.key"
              />
            } @else if (field.type === 'select') {
              <select
                class="form-field__select"
                [id]="'agx-param-' + field.key"
                [disabled]="submitted()"
                [ngModel]="formValues()[field.key]"
                (ngModelChange)="onFieldChange(field.key, $event)"
                [name]="field.key"
              >
                @for (opt of field.options ?? []; track opt) {
                  <option [value]="opt">{{ opt }}</option>
                }
              </select>
            } @else if (field.type === 'toggle') {
              <label class="form-field__toggle">
                <input
                  type="checkbox"
                  [id]="'agx-param-' + field.key"
                  [disabled]="submitted()"
                  [ngModel]="formValues()[field.key]"
                  (ngModelChange)="onFieldChange(field.key, $event)"
                  [name]="field.key"
                />
                <span class="form-field__toggle-track"></span>
              </label>
            }
          </div>
        }

        <button class="form-card__submit" type="submit" [disabled]="submitted()">
          @if (submitted()) {
            ✓ Submitted
          } @else {
            {{ submitLabel() }}
          }
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .form-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
      }

      .form-card--submitted {
        opacity: 0.7;
      }

      .form-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .form-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-primary, #ccff00);
      }

      .form-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .form-card__body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
      }

      /* ── Field row ── */

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .form-field__label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .form-field__input,
      .form-field__select {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.15));
        border-radius: 8px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 0.8125rem;
        outline: none;
        transition: border-color 0.15s ease;
        box-sizing: border-box;
      }

      .form-field__input::placeholder {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .form-field__input:focus,
      .form-field__select:focus {
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .form-field__input:disabled,
      .form-field__select:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .form-field__select option {
        background: var(--nxt1-color-surface-300, #1a1a1a);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* ── Toggle ── */

      .form-field__toggle {
        position: relative;
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        width: 40px;
        height: 22px;
      }

      .form-field__toggle input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      .form-field__toggle-track {
        width: 40px;
        height: 22px;
        border-radius: 11px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.12));
        position: relative;
        transition: background 0.2s ease;
      }

      .form-field__toggle-track::after {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: white;
        transition: transform 0.2s ease;
      }

      .form-field__toggle input:checked + .form-field__toggle-track {
        background: var(--nxt1-color-primary, #ccff00);
      }

      .form-field__toggle input:checked + .form-field__toggle-track::after {
        transform: translateX(18px);
      }

      .form-field__toggle input:disabled + .form-field__toggle-track {
        opacity: 0.5;
        cursor: default;
      }

      /* ── Submit ── */

      .form-card__submit {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        font-size: 0.8125rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .form-card__submit:hover:not(:disabled) {
        background: var(--nxt1-color-primary-hover, #b8e600);
      }

      .form-card__submit:active:not(:disabled) {
        background: var(--nxt1-color-primary-active, #a3cc00);
      }

      .form-card__submit:disabled {
        opacity: 0.6;
        cursor: default;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXParameterFormCardComponent implements OnInit {
  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user submits the form. */
  readonly formSubmitted = output<ParameterFormSubmitEvent>();

  /** Whether the form has been submitted (one-shot). */
  protected readonly submitted = signal(false);

  /** Current form values (mutable internal state). */
  protected readonly formValues = signal<Record<string, string | number | boolean>>({});

  /** Extract fields from the parameter-form payload. */
  protected readonly fields = computed<readonly AgentXParameterField[]>(() => {
    const payload = this.card().payload as AgentXParameterFormPayload;
    return Array.isArray(payload?.fields) ? payload.fields : [];
  });

  /** Extract submit button label. */
  protected readonly submitLabel = computed<string>(() => {
    const payload = this.card().payload as AgentXParameterFormPayload;
    return typeof payload?.submitLabel === 'string' ? payload.submitLabel : 'Submit';
  });

  ngOnInit(): void {
    // Seed default values
    const defaults: Record<string, string | number | boolean> = {};
    for (const field of this.fields()) {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      } else if (field.type === 'toggle') {
        defaults[field.key] = false;
      } else if (field.type === 'select' && field.options?.length) {
        defaults[field.key] = field.options[0];
      } else {
        defaults[field.key] = '';
      }
    }
    this.formValues.set(defaults);
  }

  protected onFieldChange(key: string, value: string | number | boolean): void {
    this.formValues.update((prev) => ({ ...prev, [key]: value }));
  }

  protected onSubmit(): void {
    if (this.submitted()) return;
    this.submitted.set(true);
    this.formSubmitted.emit({
      cardTitle: this.card().title,
      values: { ...this.formValues() },
    });
  }
}
