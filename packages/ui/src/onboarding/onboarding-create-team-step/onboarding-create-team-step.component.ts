import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type CreateTeamProfileFormData, type OnboardingTeamType } from '@nxt1/core/api';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtFormFieldComponent } from '../../components/form-field';
import { NxtIconComponent } from '../../components/icon';

@Component({
  selector: 'nxt1-onboarding-create-team-step',
  standalone: true,
  imports: [FormsModule, NxtFormFieldComponent, NxtIconComponent],
  template: `
    <div class="space-y-6" [attr.data-testid]="testIds.CONTAINER">
      <!-- Program Name -->
      <nxt1-form-field label="Program/School Name" [required]="true">
        <input
          class="nxt1-input"
          type="text"
          placeholder="e.g. Katy High School"
          [ngModel]="programName()"
          (ngModelChange)="updateField('programName', $event)"
          [disabled]="disabled()"
          [attr.data-testid]="testIds.INPUT_PROGRAM_NAME"
        />
      </nxt1-form-field>

      <!-- Team Type (High School, Club, College) -->
      <nxt1-form-field label="Program Type" [required]="true">
        <div class="grid grid-cols-2 gap-4">
          @for (type of TEAM_TYPES; track type.value) {
            <label
              class="hover:bg-surface-200 relative flex cursor-pointer rounded-lg border p-4 transition-colors"
              [class.border-brand-500]="teamType() === type.value"
              [class.bg-brand-50]="teamType() === type.value"
              [class.border-border-subtle]="teamType() !== type.value"
            >
              <input
                type="radio"
                name="teamTypeBox"
                class="peer sr-only"
                [value]="type.value"
                [ngModel]="teamType()"
                (ngModelChange)="updateField('teamType', $event)"
                [disabled]="disabled()"
                [attr.data-testid]="testIds.INPUT_TEAM_TYPE + '-' + type.value"
              />
              <div
                class="flex w-full flex-col items-center justify-center gap-2 text-center text-sm"
              >
                <nxt1-icon
                  [name]="type.icon"
                  size="24"
                  [class.text-brand-500]="teamType() === type.value"
                  [class.text-text-tertiary]="teamType() !== type.value"
                />
                <span class="text-text-primary font-medium">{{ type.label }}</span>
              </div>
            </label>
          }
        </div>
      </nxt1-form-field>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <!-- City (Optional) -->
        <nxt1-form-field label="City (Optional)">
          <input
            class="nxt1-input"
            type="text"
            placeholder="e.g. Katy"
            [ngModel]="city()"
            (ngModelChange)="updateField('city', $event)"
            [disabled]="disabled()"
            [attr.data-testid]="testIds.INPUT_CITY"
          />
        </nxt1-form-field>

        <!-- State (Optional) -->
        <nxt1-form-field label="State (Optional)">
          <input
            class="nxt1-input"
            type="text"
            placeholder="e.g. TX"
            [ngModel]="state()"
            (ngModelChange)="updateField('state', $event)"
            [disabled]="disabled()"
            [attr.data-testid]="testIds.INPUT_STATE"
          />
        </nxt1-form-field>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <!-- Mascot (Optional) -->
        <nxt1-form-field label="Mascot (Optional)">
          <input
            class="nxt1-input"
            type="text"
            placeholder="e.g. Tigers"
            [ngModel]="mascot()"
            (ngModelChange)="updateField('mascot', $event)"
            [disabled]="disabled()"
            [attr.data-testid]="testIds.INPUT_MASCOT"
          />
        </nxt1-form-field>

        <!-- Level (Optional) -->
        <nxt1-form-field label="Level (Optional)">
          <input
            class="nxt1-input"
            type="text"
            placeholder="e.g. Varsity"
            [ngModel]="level()"
            (ngModelChange)="updateField('level', $event)"
            [disabled]="disabled()"
            [attr.data-testid]="testIds.INPUT_LEVEL"
          />
        </nxt1-form-field>
      </div>

      <!-- Gender (Optional) -->
      <nxt1-form-field label="Gender Focus (Optional)">
        <select
          class="nxt1-select"
          [ngModel]="gender()"
          (ngModelChange)="updateField('gender', $event)"
          [disabled]="disabled()"
          [attr.data-testid]="testIds.INPUT_GENDER"
        >
          <option [ngValue]="null">Select...</option>
          <option value="boys">Boys / Men's</option>
          <option value="girls">Girls / Women's</option>
          <option value="co-ed">Co-ed</option>
        </select>
      </nxt1-form-field>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Nxt1OnboardingCreateTeamStepComponent {
  // ---- Inputs ----
  readonly teamData = input<CreateTeamProfileFormData | null>(null);
  readonly disabled = input(false);

  // ---- Outputs ----
  readonly teamChange = output<CreateTeamProfileFormData>();

  // ---- State ----
  protected readonly programName = signal<string>('');
  protected readonly teamType = signal<OnboardingTeamType>('High School');
  protected readonly mascot = signal<string>('');
  protected readonly state = signal<string>('');
  protected readonly city = signal<string>('');
  protected readonly level = signal<string>('');
  protected readonly gender = signal<'boys' | 'girls' | 'co-ed' | null>(null);

  protected readonly testIds = {
    ...TEST_IDS.ONBOARDING,
    CONTAINER: 'create-team-container',
    INPUT_PROGRAM_NAME: 'create-team-program-name',
    INPUT_TEAM_TYPE: 'create-team-type',
    INPUT_MASCOT: 'create-team-mascot',
    INPUT_STATE: 'create-team-state',
    INPUT_CITY: 'create-team-city',
    INPUT_LEVEL: 'create-team-level',
    INPUT_GENDER: 'create-team-gender',
  } as const;

  protected readonly TEAM_TYPES: { label: string; value: OnboardingTeamType; icon: string }[] = [
    { label: 'High School', value: 'High School', icon: 'school' },
    { label: 'Middle School', value: 'Middle School', icon: 'school' },
    { label: 'Club / Travel', value: 'Club', icon: 'flight_takeoff' },
    { label: 'JUCO', value: 'JUCO', icon: 'account_balance' },
  ];

  constructor() {
    // Sync external data -> internal signals
    effect(
      () => {
        const data = this.teamData();
        if (data) {
          this.programName.set(data.programName || '');
          this.teamType.set(data.teamType || 'High School');
          this.mascot.set(data.mascot || '');
          this.state.set(data.state || '');
          this.city.set(data.city || '');
          this.level.set(data.level || '');
          this.gender.set(data.gender || null);
        }
      },
      { allowSignalWrites: true }
    );
  }

  protected updateField(field: keyof CreateTeamProfileFormData, value: any): void {
    if (this.disabled()) return;

    switch (field) {
      case 'programName':
        this.programName.set(value as string);
        break;
      case 'teamType':
        this.teamType.set(value as OnboardingTeamType);
        break;
      case 'mascot':
        this.mascot.set(value as string);
        break;
      case 'state':
        this.state.set(value as string);
        break;
      case 'city':
        this.city.set(value as string);
        break;
      case 'level':
        this.level.set(value as string);
        break;
      case 'gender':
        this.gender.set(value as 'boys' | 'girls' | 'co-ed' | null);
        break;
    }

    this.emitChange();
  }

  private emitChange(): void {
    this.teamChange.emit({
      programName: this.programName(),
      teamType: this.teamType(),
      mascot: this.mascot() || undefined,
      state: this.state() || undefined,
      city: this.city() || undefined,
      level: this.level() || undefined,
      gender: this.gender() || undefined,
    });
  }
}
