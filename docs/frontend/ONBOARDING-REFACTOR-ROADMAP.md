# Onboarding Refactoring Roadmap

> **Purpose**: Transform onboarding from 975-line hardcoded web component into
> reusable, cross-platform components following `@nxt1/ui/auth` architectural
> patterns.

---

## 🎯 Goal

Enable onboarding to work **identically** on both web and mobile by creating
reusable components in `@nxt1/ui`, just like the existing auth system.

---

## 📊 Current State Analysis

### ❌ Web Implementation (`apps/web/src/app/features/auth/pages/onboarding/onboarding.component.ts`)

**Problems:**

- **975 lines** - Monolithic, unmaintainable component
- **Hardcoded UI** - 100+ lines of inline template per step
- **Inline SVG icons** - 50+ lines of embedded SVG per role icon
- **Duplicate data** - Role options hardcoded in component instead of using
  `@nxt1/core/constants`
- **Not portable** - Cannot be reused in mobile app
- **Violates architecture** - Doesn't follow `@nxt1/ui/auth` component pattern

```typescript
// ❌ CURRENT: Everything hardcoded in template
@if (currentStep().id === 'role') {
  <div class="role-grid">
    @for (option of roleOptions; track option.type) {
      <button class="role-card">
        <!-- 50+ lines of inline SVG -->
        <svg>...</svg>
        <h3>{{ option.label }}</h3>
        <p>{{ option.description }}</p>
      </button>
    }
  </div>
}

@if (currentStep().id === 'profile') {
  <div class="coming-soon">Profile step coming soon...</div>
}
```

**What Works:** ✅ State machine logic (step transitions, validation) ✅ Uses
`AuthShellComponent` for layout ✅ Progress bar and navigation ✅ Integration
with `AuthFlowService`

---

### ❌ Mobile Implementation (`apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts`)

**Problems:**

- **Placeholder stub** - Shows "Onboarding flow coming soon..."
- **Not functional** - Just navigates to `/home`
- **No shared code** - Would require duplicating web's 975 lines

```typescript
// ❌ CURRENT: Placeholder
<ion-content>
  <h1>Onboarding flow coming soon...</h1>
  <ion-button (click)="continue()">Continue</ion-button>
</ion-content>
```

---

### ✅ Reference Architecture (`packages/ui/src/auth/`)

**What's Working Well:**

```typescript
// ✅ CORRECT: Standalone, reusable, cross-platform
@Component({
  selector: 'nxt1-auth-social-buttons',
  standalone: true,
  imports: [IonButton, NxtIconComponent],
  template: `
    <ion-button (click)="onGoogleClick()" data-testid="auth-btn-google">
      <nxt-icon name="google" />
      Sign in with Google
    </ion-button>
  `,
})
export class AuthSocialButtonsComponent {
  @Input() disabled = false;
  @Output() googleClick = new EventEmitter<void>();

  onGoogleClick(): void {
    this.googleClick.emit();
  }
}
```

**Key Patterns:**

- ✅ **Standalone components** - No NgModules
- ✅ **@Input/@Output** - Clear data flow
- ✅ **Ionic components** - Works on web + mobile
- ✅ **NxtIconComponent** - Reusable icons
- ✅ **Test IDs** - `data-testid` attributes
- ✅ **Emits events** - Parent handles business logic
- ✅ **Content projection** - `<ng-content>` for flexibility

---

## 🏗️ Target Architecture

### Package Structure

```
packages/ui/src/
├── auth/                           # ✅ Existing auth components
│   ├── auth-shell/                 # Layout wrapper
│   ├── auth-social-buttons/        # Social login buttons
│   └── auth-email-form/            # Email/password form
│
├── onboarding/                     # 🆕 NEW: Onboarding components
│   ├── index.ts                    # Barrel export
│   │
│   ├── onboarding-shell/           # 🆕 Wizard shell with progress
│   │   ├── onboarding-shell.component.ts
│   │   ├── onboarding-shell.component.html
│   │   ├── onboarding-shell.component.scss
│   │   └── onboarding-shell.component.spec.ts
│   │
│   ├── onboarding-role-selection/  # 🆕 Step 1: Role selection
│   │   ├── onboarding-role-selection.component.ts
│   │   ├── onboarding-role-selection.component.html
│   │   ├── onboarding-role-selection.component.scss
│   │   └── onboarding-role-selection.component.spec.ts
│   │
│   ├── onboarding-profile-info/    # 🆕 Step 2: Name, photo
│   │   ├── onboarding-profile-info.component.ts
│   │   ├── onboarding-profile-info.component.html
│   │   └── ...
│   │
│   ├── onboarding-school-selection/  # 🆕 Step 3: School
│   ├── onboarding-sport-selection/   # 🆕 Step 4: Sport
│   ├── onboarding-position-selection/ # 🆕 Step 5: Position
│   ├── onboarding-contact-info/      # 🆕 Step 6: Contact
│   └── onboarding-referral/          # 🆕 Step 7: Referral
│
└── shared/                         # ✅ Existing shared components
    ├── logo/
    └── icon/                       # Extend with role icons

packages/core/src/
├── constants/
│   ├── user.constants.ts           # ✅ Already has ROLE_CONFIGS
│   └── onboarding.constants.ts     # 🆕 NEW: Onboarding configuration
│
└── api/
    └── onboarding/
        ├── onboarding-navigation.api.ts  # ✅ Has ONBOARDING_STEPS
        └── onboarding.types.ts           # ✅ Types already exist
```

---

## 📋 Migration Steps

### Phase 1: Foundation (Constants & Types) ✅ Already Done

**Status:** ✅ **COMPLETE** - Already exists in `@nxt1/core`

- ✅ `ROLE_CONFIGS` in `packages/core/src/constants/user.constants.ts`
- ✅ `ONBOARDING_STEPS` in
  `packages/core/src/api/onboarding/onboarding-navigation.api.ts`
- ✅ Types: `OnboardingUserType`, `OnboardingStep`, `OnboardingStepId`

**What's Missing:**

- 🆕 Role icon names (currently using emojis, need proper icon references)
- 🆕 Onboarding configuration constants (animations, transitions)

---

### Phase 2: Shared Icon System

**Goal:** Extend `NxtIconComponent` to support role icons.

#### 2.1 Add Role Icons to Icon Registry

**File:** `packages/ui/src/shared/icon/icon-registry.ts`

```typescript
// 🆕 Add role icon definitions
export const ROLE_ICONS = {
  athlete: 'M12 2L15.5 8.5...', // Running athlete silhouette
  coach: 'M18 2L12 8...', // Whistle icon
  'college-coach': 'M12 3L9 12...', // Graduation cap
  parent: 'M16 11C14 8...', // Family icon
  fan: 'M12 2L14 8...', // Megaphone
} as const;

// Merge with existing icons
export const ALL_ICONS = {
  ...EXISTING_ICONS,
  ...ROLE_ICONS,
};
```

#### 2.2 Update NxtIconComponent

```typescript
// packages/ui/src/shared/icon/icon.component.ts
export type IconName =
  | 'google'
  | 'apple'
  | 'microsoft'
  | 'athlete'
  | 'coach'
  | 'college-coach'
  | 'parent'
  | 'fan' // 🆕 Add roles
  | 'email'
  | 'team'
  | 'logo';
```

**Deliverable:** Role icons available via `<nxt-icon name="athlete" />`

---

### Phase 3: Onboarding Shell Component

**Goal:** Create reusable wizard wrapper with progress bar.

#### 3.1 Create OnboardingShellComponent

**File:**
`packages/ui/src/onboarding/onboarding-shell/onboarding-shell.component.ts`

```typescript
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonProgressBar,
} from '@ionic/angular/standalone';

export interface OnboardingShellConfig {
  totalSteps: number;
  currentStep: number;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  showSkipButton?: boolean;
  maxWidth?: string;
}

@Component({
  selector: 'nxt1-onboarding-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonProgressBar,
  ],
  template: `
    <ion-content class="nxt1-onboarding-content">
      <!-- Header with progress -->
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-buttons slot="start">
            @if (config.showBackButton) {
              <ion-button
                (click)="backClick.emit()"
                data-testid="onboarding-back"
              >
                <ion-icon name="chevron-back"></ion-icon>
              </ion-button>
            }
          </ion-buttons>

          <ion-buttons slot="end">
            @if (config.showSkipButton) {
              <ion-button
                (click)="skipClick.emit()"
                data-testid="onboarding-skip"
              >
                Skip
              </ion-button>
            }
          </ion-buttons>
        </ion-toolbar>

        <!-- Progress bar -->
        <ion-progress-bar
          [value]="config.currentStep / config.totalSteps"
          class="nxt1-onboarding-progress"
        ></ion-progress-bar>
      </ion-header>

      <!-- Content area -->
      <div
        class="nxt1-onboarding-container"
        [style.max-width]="config.maxWidth || '560px'"
      >
        <!-- Title & Subtitle -->
        <header class="nxt1-onboarding-header">
          <h1 class="nxt1-onboarding-title">{{ config.title }}</h1>
          @if (config.subtitle) {
            <p class="nxt1-onboarding-subtitle">{{ config.subtitle }}</p>
          }
        </header>

        <!-- Step content (projected) -->
        <div class="nxt1-onboarding-body">
          <ng-content select="[onboardingStep]"></ng-content>
        </div>

        <!-- Action buttons (projected) -->
        <footer class="nxt1-onboarding-footer">
          <ng-content select="[onboardingActions]"></ng-content>
        </footer>
      </div>
    </ion-content>
  `,
  styleUrls: ['./onboarding-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingShellComponent {
  @Input({ required: true }) config!: OnboardingShellConfig;
  @Output() backClick = new EventEmitter<void>();
  @Output() skipClick = new EventEmitter<void>();
}
```

**Usage Example:**

```html
<nxt1-onboarding-shell
  [config]="{
    totalSteps: 7,
    currentStep: 1,
    title: 'Who are you?',
    subtitle: 'Help us personalize your experience',
    showBackButton: false,
    showSkipButton: false
  }"
>
  <div onboardingStep>
    <!-- Step component goes here -->
    <nxt1-onboarding-role-selection ... />
  </div>

  <div onboardingActions>
    <ion-button (click)="next()">Continue</ion-button>
  </div>
</nxt1-onboarding-shell>
```

---

### Phase 4: Role Selection Component (Step 1)

**Goal:** Extract hardcoded role selection into reusable component.

#### 4.1 Create OnboardingRoleSelectionComponent

**File:**
`packages/ui/src/onboarding/onboarding-role-selection/onboarding-role-selection.component.ts`

```typescript
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../../shared/icon';
import type { UserRole } from '@nxt1/core';
import { ROLE_CONFIGS } from '@nxt1/core';

export interface RoleSelectionConfig {
  selectedRole?: UserRole | null;
  disabled?: boolean;
}

@Component({
  selector: 'nxt1-onboarding-role-selection',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, NxtIconComponent],
  template: `
    <div class="nxt1-role-grid">
      @for (role of roles; track role.id) {
        <button
          type="button"
          class="nxt1-role-card"
          [class.selected]="config.selectedRole === role.id"
          [disabled]="config.disabled"
          (click)="onRoleSelect(role.id)"
          [attr.data-testid]="'role-' + role.id"
          [attr.aria-pressed]="config.selectedRole === role.id"
        >
          <!-- Role icon -->
          <div class="nxt1-role-icon">
            <nxt-icon [name]="role.icon" size="48" />
          </div>

          <!-- Role label -->
          <h3 class="nxt1-role-label">{{ role.label }}</h3>

          <!-- Role description -->
          <p class="nxt1-role-description">{{ role.description }}</p>

          <!-- Checkmark when selected -->
          @if (config.selectedRole === role.id) {
            <div class="nxt1-role-checkmark">
              <ion-icon name="checkmark-circle"></ion-icon>
            </div>
          }
        </button>
      }
    </div>
  `,
  styleUrls: ['./onboarding-role-selection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingRoleSelectionComponent {
  @Input() config: RoleSelectionConfig = {};
  @Output() roleSelected = new EventEmitter<UserRole>();

  // Use constants from @nxt1/core
  protected readonly roles = ROLE_CONFIGS;

  protected onRoleSelect(role: UserRole): void {
    if (!this.config.disabled) {
      this.roleSelected.emit(role);
    }
  }
}
```

**Styling:** `onboarding-role-selection.component.scss`

```scss
.nxt1-role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  padding: 1rem 0;
}

.nxt1-role-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 1rem;
  border: 2px solid var(--ion-color-light);
  border-radius: 12px;
  background: var(--ion-color-white);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover:not(:disabled) {
    border-color: var(--ion-color-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &.selected {
    border-color: var(--ion-color-primary);
    background: var(--ion-color-primary-tint);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.nxt1-role-icon {
  margin-bottom: 0.75rem;
  color: var(--ion-color-primary);
}

.nxt1-role-label {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ion-color-dark);
}

.nxt1-role-description {
  font-size: 0.875rem;
  text-align: center;
  color: var(--ion-color-medium);
}

.nxt1-role-checkmark {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  color: var(--ion-color-primary);
  font-size: 1.5rem;
}
```

**Unit Test:** `onboarding-role-selection.component.spec.ts`

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OnboardingRoleSelectionComponent } from './onboarding-role-selection.component';
import { ROLE_CONFIGS } from '@nxt1/core';

describe('OnboardingRoleSelectionComponent', () => {
  let component: OnboardingRoleSelectionComponent;
  let fixture: ComponentFixture<OnboardingRoleSelectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingRoleSelectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingRoleSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render all role options', () => {
    const roleCards = fixture.nativeElement.querySelectorAll('.nxt1-role-card');
    expect(roleCards.length).toBe(ROLE_CONFIGS.length);
  });

  it('should emit roleSelected when role clicked', () => {
    const spy = vi.spyOn(component.roleSelected, 'emit');

    const athleteCard = fixture.nativeElement.querySelector(
      '[data-testid="role-athlete"]'
    );
    athleteCard.click();

    expect(spy).toHaveBeenCalledWith('athlete');
  });

  it('should apply selected class to selected role', () => {
    component.config = { selectedRole: 'athlete' };
    fixture.detectChanges();

    const athleteCard = fixture.nativeElement.querySelector(
      '[data-testid="role-athlete"]'
    );
    expect(athleteCard.classList.contains('selected')).toBe(true);
  });

  it('should not emit when disabled', () => {
    component.config = { disabled: true };
    fixture.detectChanges();

    const spy = vi.spyOn(component.roleSelected, 'emit');
    const athleteCard = fixture.nativeElement.querySelector(
      '[data-testid="role-athlete"]'
    );
    athleteCard.click();

    expect(spy).not.toHaveBeenCalled();
  });
});
```

---

### Phase 5: Remaining Step Components

**Create components for steps 2-7:**

#### 5.1 Profile Info Component

```typescript
// packages/ui/src/onboarding/onboarding-profile-info/onboarding-profile-info.component.ts
@Component({
  selector: 'nxt1-onboarding-profile-info',
  template: `
    <form [formGroup]="form">
      <ion-input label="First Name" formControlName="firstName" />
      <ion-input label="Last Name" formControlName="lastName" />
      <!-- Photo upload component -->
    </form>
  `,
})
export class OnboardingProfileInfoComponent {
  @Input() initialData?: { firstName: string; lastName: string };
  @Output() dataChanged = new EventEmitter<{
    firstName: string;
    lastName: string;
  }>();
}
```

#### 5.2 School Selection Component

```typescript
// packages/ui/src/onboarding/onboarding-school-selection/onboarding-school-selection.component.ts
@Component({
  selector: 'nxt1-onboarding-school-selection',
  template: `
    <ion-searchbar
      (ionInput)="onSearch($event)"
      placeholder="Search schools..."
    />
    <ion-list>
      @for (school of filteredSchools(); track school.id) {
        <ion-item (click)="onSchoolSelect(school)">
          {{ school.name }}
        </ion-item>
      }
    </ion-list>
  `,
})
export class OnboardingSchoolSelectionComponent {
  @Output() schoolSelected = new EventEmitter<School>();
}
```

#### 5.3 Sport Selection Component

```typescript
// packages/ui/src/onboarding/onboarding-sport-selection/onboarding-sport-selection.component.ts
import { SPORTS } from '@nxt1/core/constants';

@Component({
  selector: 'nxt1-onboarding-sport-selection',
  template: `
    <div class="sport-grid">
      @for (sport of sports; track sport.id) {
        <button
          class="sport-card"
          [class.selected]="selectedSport === sport.id"
          (click)="onSportSelect(sport.id)"
        >
          <nxt-icon [name]="sport.icon" />
          {{ sport.label }}
        </button>
      }
    </div>
  `,
})
export class OnboardingSportSelectionComponent {
  protected readonly sports = SPORTS;
  @Input() selectedSport?: string;
  @Output() sportSelected = new EventEmitter<string>();
}
```

**Note:** Steps 5-7 follow the same pattern. Create one component per step.

---

### Phase 6: Update Web App to Use New Components

**Goal:** Replace 975-line monolith with clean orchestration.

#### 6.1 Refactor Web Onboarding Component

**File:**
`apps/web/src/app/features/auth/pages/onboarding/onboarding.component.ts`

**BEFORE (975 lines):**

```typescript
// ❌ Hardcoded everything in template
@if (currentStep().id === 'role') {
  <div class="role-grid">
    @for (option of roleOptions; track option.type) {
      <button class="role-card">
        <svg>...</svg> <!-- 50 lines -->
        <h3>{{ option.label }}</h3>
      </button>
    }
  </div>
}
```

**AFTER (~200 lines):**

```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import {
  OnboardingShellComponent,
  OnboardingRoleSelectionComponent,
  OnboardingProfileInfoComponent,
  OnboardingSchoolSelectionComponent,
  OnboardingSportSelectionComponent,
} from '@nxt1/ui/onboarding';
import { ONBOARDING_STEPS } from '@nxt1/core';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    OnboardingShellComponent,
    OnboardingRoleSelectionComponent,
    OnboardingProfileInfoComponent,
    OnboardingSchoolSelectionComponent,
    OnboardingSportSelectionComponent,
  ],
  template: `
    <nxt1-onboarding-shell
      [config]="shellConfig()"
      (backClick)="onBack()"
      (skipClick)="onSkip()"
    >
      <!-- Step content -->
      <div onboardingStep>
        @switch (currentStep().id) {
          @case ('role') {
            <nxt1-onboarding-role-selection
              [config]="{ selectedRole: formData.userType }"
              (roleSelected)="onRoleSelected($event)"
            />
          }
          @case ('profile') {
            <nxt1-onboarding-profile-info
              [initialData]="formData.profile"
              (dataChanged)="onProfileChanged($event)"
            />
          }
          @case ('school') {
            <nxt1-onboarding-school-selection
              (schoolSelected)="onSchoolSelected($event)"
            />
          }
          @case ('sport') {
            <nxt1-onboarding-sport-selection
              [selectedSport]="formData.sport?.primarySport"
              (sportSelected)="onSportSelected($event)"
            />
          }
        }
      </div>

      <!-- Action buttons -->
      <div onboardingActions>
        @if (isCurrentStepOptional()) {
          <ion-button fill="clear" (click)="onSkip()">Skip</ion-button>
        }
        <ion-button
          expand="block"
          [disabled]="!isCurrentStepValid()"
          (click)="onNext()"
        >
          {{ isLastStep() ? 'Complete' : 'Continue' }}
        </ion-button>
      </div>
    </nxt1-onboarding-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  // State machine logic stays here
  private readonly _currentStepIndex = signal(0);
  readonly currentStep = computed(() => this._steps[this._currentStepIndex()]);

  readonly shellConfig = computed(() => ({
    totalSteps: this._steps.length,
    currentStep: this._currentStepIndex() + 1,
    title: this.currentStep().title,
    subtitle: this.currentStep().subtitle,
    showBackButton: this._currentStepIndex() > 0,
    showSkipButton: !this.currentStep().required,
  }));

  // Event handlers
  onRoleSelected(role: UserRole): void {
    this.formData.userType = role;
    this.onNext();
  }

  onProfileChanged(data: ProfileData): void {
    this.formData.profile = data;
  }

  // ... more handlers
}
```

**Result:**

- ✅ Component reduced from 975 to ~200 lines
- ✅ All UI logic extracted to `@nxt1/ui/onboarding`
- ✅ State machine logic remains in page component
- ✅ Clean, maintainable, testable

---

### Phase 7: Implement Mobile Onboarding

**Goal:** Use same components from `@nxt1/ui/onboarding`.

#### 7.1 Replace Mobile Placeholder

**File:**
`apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts`

**BEFORE (placeholder):**

```typescript
// ❌ Stub
template: `
  <ion-content>
    <h1>Onboarding flow coming soon...</h1>
    <ion-button (click)="continue()">Continue</ion-button>
  </ion-content>
`;
```

**AFTER (fully functional):**

```typescript
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  OnboardingShellComponent,
  OnboardingRoleSelectionComponent,
  OnboardingProfileInfoComponent,
  OnboardingSchoolSelectionComponent,
  OnboardingSportSelectionComponent,
} from '@nxt1/ui/onboarding';
import { ONBOARDING_STEPS } from '@nxt1/core';
import type { UserRole } from '@nxt1/core';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    OnboardingShellComponent,
    OnboardingRoleSelectionComponent,
    OnboardingProfileInfoComponent,
    OnboardingSchoolSelectionComponent,
    OnboardingSportSelectionComponent,
  ],
  template: `
    <nxt1-onboarding-shell
      [config]="shellConfig()"
      (backClick)="onBack()"
      (skipClick)="onSkip()"
    >
      <!-- IDENTICAL to web - same components! -->
      <div onboardingStep>
        @switch (currentStep().id) {
          @case ('role') {
            <nxt1-onboarding-role-selection
              [config]="{ selectedRole: formData.userType }"
              (roleSelected)="onRoleSelected($event)"
            />
          }
          @case ('profile') {
            <nxt1-onboarding-profile-info
              [initialData]="formData.profile"
              (dataChanged)="onProfileChanged($event)"
            />
          }
          <!-- ... same as web -->
        }
      </div>

      <div onboardingActions>
        <ion-button
          expand="block"
          [disabled]="!isCurrentStepValid()"
          (click)="onNext()"
        >
          {{ isLastStep() ? 'Complete' : 'Continue' }}
        </ion-button>
      </div>
    </nxt1-onboarding-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPage {
  private readonly router = inject(Router);

  // Identical state machine logic to web
  private readonly _currentStepIndex = signal(0);
  readonly currentStep = computed(() => this._steps[this._currentStepIndex()]);

  // Identical event handlers to web
  onRoleSelected(role: UserRole): void {
    this.formData.userType = role;
    this.onNext();
  }

  // ... identical to web
}
```

**Result:**

- ✅ Mobile uses exact same components as web
- ✅ ~90% code reuse between platforms
- ✅ Only difference: platform-specific routing/navigation
- ✅ Maintains native feel with Ionic components

---

### Phase 8: Barrel Exports & Documentation

#### 8.1 Create Barrel Export

**File:** `packages/ui/src/onboarding/index.ts`

```typescript
/**
 * @fileoverview Onboarding Components Barrel Export
 * @module @nxt1/ui/onboarding
 *
 * Cross-platform onboarding wizard components.
 * Works identically on web and mobile.
 */

export {
  OnboardingShellComponent,
  type OnboardingShellConfig,
} from './onboarding-shell';

export {
  OnboardingRoleSelectionComponent,
  type RoleSelectionConfig,
} from './onboarding-role-selection';

export {
  OnboardingProfileInfoComponent,
  type ProfileInfoConfig,
} from './onboarding-profile-info';

export {
  OnboardingSchoolSelectionComponent,
  type SchoolSelectionConfig,
} from './onboarding-school-selection';

export {
  OnboardingSportSelectionComponent,
  type SportSelectionConfig,
} from './onboarding-sport-selection';

export { OnboardingPositionSelectionComponent } from './onboarding-position-selection';

export { OnboardingContactInfoComponent } from './onboarding-contact-info';

export { OnboardingReferralComponent } from './onboarding-referral';
```

#### 8.2 Update Main UI Package Export

**File:** `packages/ui/src/index.ts`

```typescript
// Auth components
export * from './auth';

// Onboarding components (NEW)
export * from './onboarding';

// Shared components
export * from './shared';

// Services
export * from './services';
```

---

## 🧪 Testing Strategy

### Unit Tests (Component Level)

Each component gets comprehensive tests:

```typescript
// packages/ui/src/onboarding/onboarding-role-selection/onboarding-role-selection.component.spec.ts
describe('OnboardingRoleSelectionComponent', () => {
  it('should render all roles from ROLE_CONFIGS', () => {
    // Test uses @nxt1/core/constants
    expect(fixture.nativeElement.querySelectorAll('.role-card').length).toBe(
      ROLE_CONFIGS.length
    );
  });

  it('should emit roleSelected when role clicked', () => {
    // Test event emission
  });

  it('should apply selected class to selected role', () => {
    // Test visual state
  });

  it('should disable interaction when disabled=true', () => {
    // Test disabled state
  });
});
```

### Integration Tests (Page Level)

Test full onboarding flow:

```typescript
// apps/web/src/app/features/auth/pages/onboarding/onboarding.component.spec.ts
describe('OnboardingComponent', () => {
  it('should complete role selection step', () => {
    // Click athlete role
    // Verify navigation to next step
  });

  it('should navigate back to previous step', () => {
    // Go to step 2, click back
    // Verify step 1 shown
  });

  it('should skip optional steps', () => {
    // Click skip on optional step
    // Verify next step shown
  });
});
```

### E2E Tests (Full Flow)

Test complete user journey:

```typescript
// apps/web/e2e/onboarding.spec.ts
test('complete onboarding flow as athlete', async ({ page }) => {
  await page.goto('/auth/onboarding');

  // Step 1: Select role
  await page.click('[data-testid="role-athlete"]');
  await page.click('[data-testid="onboarding-continue"]');

  // Step 2: Enter profile info
  await page.fill('[data-testid="input-first-name"]', 'John');
  await page.fill('[data-testid="input-last-name"]', 'Doe');
  await page.click('[data-testid="onboarding-continue"]');

  // ... complete all steps

  // Verify redirect to home
  await expect(page).toHaveURL('/home');
});
```

---

## 📊 Success Metrics

### Code Quality

- ✅ Reduce onboarding code from **975 lines → ~200 lines** per platform
- ✅ **~90% code reuse** between web and mobile
- ✅ **0 duplicated UI components** (all in `@nxt1/ui/onboarding`)
- ✅ **100% unit test coverage** on all new components
- ✅ **E2E tests** covering full onboarding flow

### Architecture

- ✅ **Consistent patterns** with existing `@nxt1/ui/auth`
- ✅ **Pure TypeScript** constants in `@nxt1/core`
- ✅ **Standalone components** throughout
- ✅ **Signal-based** state management
- ✅ **Ionic Framework** for cross-platform compatibility

### User Experience

- ✅ **Identical UX** on web and mobile
- ✅ **Native feel** on each platform (iOS/Android animations)
- ✅ **Responsive design** (mobile → tablet → desktop)
- ✅ **Accessible** (ARIA labels, keyboard navigation)

---

## 🚀 Implementation Checklist

### Phase 1: Foundation ✅

- [x] Verify `ROLE_CONFIGS` exists in `@nxt1/core/constants`
- [x] Verify `ONBOARDING_STEPS` exists in `@nxt1/core/api`
- [x] Document types and interfaces

### Phase 2: Icon System

- [ ] Add role icons to `NxtIconComponent` registry
- [ ] Update icon type definitions
- [ ] Test icon rendering

### Phase 3: Shell Component

- [ ] Create `OnboardingShellComponent`
- [ ] Add progress bar logic
- [ ] Write unit tests
- [ ] Document usage

### Phase 4: Role Selection

- [ ] Create `OnboardingRoleSelectionComponent`
- [ ] Add styling with hover/selected states
- [ ] Write unit tests
- [ ] Verify works on web
- [ ] Verify works on mobile

### Phase 5: Remaining Steps

- [ ] Create `OnboardingProfileInfoComponent`
- [ ] Create `OnboardingSchoolSelectionComponent`
- [ ] Create `OnboardingSportSelectionComponent`
- [ ] Create `OnboardingPositionSelectionComponent`
- [ ] Create `OnboardingContactInfoComponent`
- [ ] Create `OnboardingReferralComponent`
- [ ] Write unit tests for each

### Phase 6: Web Refactor

- [ ] Import new components
- [ ] Replace hardcoded template with component usage
- [ ] Remove inline SVG icons
- [ ] Remove hardcoded role options
- [ ] Test full flow on web
- [ ] Verify no regressions

### Phase 7: Mobile Implementation

- [ ] Replace placeholder page
- [ ] Import same components from `@nxt1/ui/onboarding`
- [ ] Implement platform-specific routing
- [ ] Test full flow on iOS
- [ ] Test full flow on Android

### Phase 8: Testing & Polish

- [ ] Write unit tests (target: 100% coverage)
- [ ] Write integration tests
- [ ] Write E2E tests
- [ ] Add animations/transitions
- [ ] Add haptic feedback (mobile)
- [ ] Accessibility audit
- [ ] Performance audit

### Phase 9: Documentation

- [ ] Update architecture docs
- [ ] Add usage examples
- [ ] Document component APIs
- [ ] Create migration guide
- [ ] Update README files

---

## 🎯 Quick Start (For Development)

### Step 1: Create Package Structure

```bash
cd packages/ui/src
mkdir -p onboarding/{onboarding-shell,onboarding-role-selection,onboarding-profile-info}
touch onboarding/index.ts
```

### Step 2: Add Role Icons

```bash
# Edit: packages/ui/src/shared/icon/icon-registry.ts
# Add ROLE_ICONS constant
```

### Step 3: Build Shell Component

```bash
cd packages/ui/src/onboarding/onboarding-shell
touch onboarding-shell.component.{ts,html,scss,spec.ts}
# Copy implementation from Phase 3
```

### Step 4: Build Role Selection

```bash
cd ../onboarding-role-selection
touch onboarding-role-selection.component.{ts,html,scss,spec.ts}
# Copy implementation from Phase 4
```

### Step 5: Test in Web App

```typescript
// apps/web/src/app/features/auth/pages/onboarding/onboarding.component.ts
import {
  OnboardingShellComponent,
  OnboardingRoleSelectionComponent,
} from '@nxt1/ui/onboarding';

// Replace hardcoded template with new components
```

### Step 6: Run Tests

```bash
cd apps/web
npm run test -- onboarding
```

### Step 7: Implement Mobile

```typescript
// apps/mobile/src/app/features/auth/pages/onboarding/onboarding.page.ts
// Copy web implementation (should be ~95% identical)
```

---

## 📝 Notes

### Why This Approach?

1. **Follows Existing Patterns**: `@nxt1/ui/auth` already works this way
2. **Maximum Code Reuse**: ~90% shared between web/mobile
3. **Maintainability**: Each component is <200 lines, single responsibility
4. **Testability**: Unit test each component in isolation
5. **Scalability**: Easy to add new onboarding steps
6. **Type Safety**: Constants from `@nxt1/core` ensure consistency

### What Gets Shared?

✅ **100% Shared (in `@nxt1/ui/onboarding`):**

- All UI components
- Component templates
- Component styles (with platform adaptations)
- Component logic

✅ **100% Shared (in `@nxt1/core`):**

- Types & interfaces
- Constants (roles, steps)
- Validation functions
- API factories

⚠️ **Platform-Specific (~10%):**

- Navigation/routing logic
- Platform animations
- Native features (haptics, camera)

### Migration Timeline Estimate

| Phase                          | Effort  | Duration     |
| ------------------------------ | ------- | ------------ |
| Phase 1: Foundation            | ✅ Done | 0 days       |
| Phase 2: Icons                 | Small   | 0.5 days     |
| Phase 3: Shell                 | Medium  | 1 day        |
| Phase 4: Role Selection        | Medium  | 1 day        |
| Phase 5: Remaining Steps       | Large   | 3 days       |
| Phase 6: Web Refactor          | Medium  | 1 day        |
| Phase 7: Mobile Implementation | Small   | 0.5 days     |
| Phase 8: Testing               | Large   | 2 days       |
| Phase 9: Documentation         | Small   | 0.5 days     |
| **Total**                      |         | **~10 days** |

---

## ✅ Success Criteria

This refactoring is complete when:

1. ✅ All onboarding UI is in `@nxt1/ui/onboarding` package
2. ✅ Web onboarding component is <250 lines
3. ✅ Mobile onboarding component is <250 lines
4. ✅ Both platforms use identical components
5. ✅ All constants come from `@nxt1/core`
6. ✅ Unit test coverage >95%
7. ✅ E2E tests pass on web, iOS, Android
8. ✅ No hardcoded UI in page components
9. ✅ All icons use `NxtIconComponent`
10. ✅ Follows `@nxt1/ui/auth` architecture patterns

---

**Ready to start? Begin with Phase 2 (icons) or Phase 3 (shell component).**
