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
 * - OnboardingRoleSelectionComponent - Optional last step: Role selection
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
// ROLE SELECTION (Optional Last Step)
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
// TEAM STEP (Step 3) - Legacy, deprecated in v3.0
// ============================================
export {
  OnboardingTeamStepComponent,
  TEAM_TYPE_OPTIONS,
  type TeamTypeOption,
} from './onboarding-team-step';

// ============================================
// SPORT ENTRY (v3.0 - Single sport card)
// ============================================
export {
  OnboardingSportEntryComponent,
  TEAM_TYPE_OPTIONS as SPORT_ENTRY_TEAM_TYPE_OPTIONS,
} from './onboarding-sport-entry/onboarding-sport-entry.component';

// ============================================
// SPORT STEP (v3.0 - Consolidated sport/team/positions)
// ============================================
export { OnboardingSportStepComponent } from './onboarding-sport-step';

// ============================================
// TEAM SELECTION STEP (v4.1 - Select Teams after Sport)
// ============================================
export {
  OnboardingTeamSelectionStepComponent,
  type TeamSearchResult,
  type SearchTeamsFn,
} from './onboarding-team-selection-step';

// ============================================
// LINK DROP STEP (Link Data Sources - Connected Accounts)
// ============================================
export { OnboardingLinkDropStepComponent } from './onboarding-link-drop-step';

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
// PROGRESS PILLS (Compact Mobile Indicator)
// ============================================
export { OnboardingProgressPillsComponent } from './onboarding-progress-pills';

// ============================================
// STEP CARD
// ============================================
export {
  OnboardingStepCardComponent,
  type StepCardVariant,
  type AnimationDirection,
} from './onboarding-step-card';

// ============================================
// CELEBRATION (Step Completion Animation)
// ============================================
export { OnboardingCelebrationComponent } from './onboarding-celebration';

// ============================================
// COMPLETE PAGE (2026 Best Practice - Dedicated Route)
// ============================================
export { OnboardingCompleteComponent } from './onboarding-complete';

// ============================================
// WELCOME SLIDES PAGE (Role-Specific Feature Highlights)
// ============================================
export { OnboardingWelcomeComponent } from './onboarding-welcome';

// ============================================
// AGENT X TYPEWRITER (AI-Guided Step Messages)
// ============================================
export { OnboardingAgentXTypewriterComponent } from './onboarding-agent-x-typewriter';
// ============================================
// CREATE TEAM STEP (Coach/Director)
// ============================================
export { Nxt1OnboardingCreateTeamStepComponent } from './onboarding-create-team-step';
