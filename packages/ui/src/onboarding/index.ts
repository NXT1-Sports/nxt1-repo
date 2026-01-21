/**
 * @fileoverview Onboarding Components Barrel Export
 * @module @nxt1/ui/onboarding
 *
 * Cross-platform onboarding wizard components for consistent
 * user experience across web and mobile.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Components:
 * - OnboardingRoleSelectionComponent - Step 1: Role selection
 * - OnboardingProfileStepComponent - Step 2: Profile (name, photo)
 * - OnboardingProgressBarComponent - Step indicators with navigation
 * - OnboardingNavigationButtonsComponent - Skip/Continue buttons
 * - OnboardingStepCardComponent - Container for step content
 *
 * Usage Pattern (matches auth page):
 * ```html
 * <nxt1-auth-shell variant="card-glass">
 *   <h1 authTitle>{{ currentStep().title }}</h1>
 *   <p authSubtitle>{{ currentStep().subtitle }}</p>
 *
 *   <nxt1-onboarding-progress-bar
 *     [steps]="steps()"
 *     [currentStepIndex]="currentStepIndex()"
 *     [completedStepIds]="completedStepIds()"
 *     (stepClick)="goToStep($event)"
 *   />
 *
 *   <nxt1-onboarding-step-card [error]="error()">
 *     @switch (currentStep().id) {
 *       @case ('role') {
 *         <nxt1-onboarding-role-selection
 *           [selectedRole]="selectedRole()"
 *           [disabled]="isLoading()"
 *           (roleSelected)="onRoleSelect($event)"
 *         />
 *       }
 *       @case ('profile') {
 *         <nxt1-onboarding-profile-step
 *           [profileData]="profileFormData()"
 *           [disabled]="isLoading()"
 *           (profileChange)="onProfileChange($event)"
 *           (photoSelect)="onPhotoSelect()"
 *           (fileSelected)="onFileSelected($event)"
 *         />
 *       }
 *     }
 *   </nxt1-onboarding-step-card>
 *
 *   <nxt1-onboarding-navigation-buttons
 *     [showSkip]="isCurrentStepOptional()"
 *     [isLastStep]="isLastStep()"
 *     [loading]="isLoading()"
 *     [disabled]="!isCurrentStepValid()"
 *     (skipClick)="onSkip()"
 *     (continueClick)="onContinue()"
 *   />
 * </nxt1-auth-shell>
 * ```
 */

// ============================================
// ROLE SELECTION (Step 1)
// ============================================
export {
  OnboardingRoleSelectionComponent,
  ONBOARDING_ROLE_OPTIONS,
  type RoleOption,
} from './onboarding-role-selection';

// ============================================
// PROFILE STEP (Step 2)
// ============================================
export { OnboardingProfileStepComponent } from './onboarding-profile-step';

// ============================================
// TEAM STEP (Step 3)
// ============================================
export {
  OnboardingTeamStepComponent,
  TEAM_TYPE_OPTIONS,
  type TeamTypeOption,
} from './onboarding-team-step';

// ============================================
// SPORT STEP (Step 4)
// ============================================
export { OnboardingSportStepComponent } from './onboarding-sport-step';

// ============================================
// POSITION STEP (Step 5)
// ============================================
export { OnboardingPositionStepComponent } from './onboarding-position-step';

// ============================================
// CONTACT STEP (Step 6)
// ============================================
export { OnboardingContactStepComponent } from './onboarding-contact-step';

// ============================================
// REFERRAL STEP (Step 7 - Final)
// ============================================
export {
  OnboardingReferralStepComponent,
  REFERRAL_OPTIONS,
  type ReferralOption,
  type ReferralSourceType,
} from './onboarding-referral-step';

// ============================================
// PROGRESS BAR
// ============================================
export { OnboardingProgressBarComponent } from './onboarding-progress-bar';

// ============================================
// NAVIGATION BUTTONS
// ============================================
export { OnboardingNavigationButtonsComponent } from './onboarding-navigation-buttons';

// ============================================
// MOBILE BUTTON FOOTER
// ============================================
export { OnboardingButtonMobileComponent } from './onboarding-button-mobile';

// ============================================
// STEP CARD
// ============================================
export {
  OnboardingStepCardComponent,
  type StepCardVariant,
  type AnimationDirection,
} from './onboarding-step-card';
