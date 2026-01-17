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
// PROGRESS BAR
// ============================================
export { OnboardingProgressBarComponent } from './onboarding-progress-bar';

// ============================================
// NAVIGATION BUTTONS
// ============================================
export { OnboardingNavigationButtonsComponent } from './onboarding-navigation-buttons';

// ============================================
// STEP CARD
// ============================================
export { OnboardingStepCardComponent } from './onboarding-step-card';
