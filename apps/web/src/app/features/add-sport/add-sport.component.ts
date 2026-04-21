/**
 * @fileoverview AddSportComponent - Web Add Sport / Add Team Wizard
 * @module @nxt1/web/features/add-sport
 *
 * Post-onboarding wizard that lets already-onboarded users add a new sport
 * (or team, for coaches/directors) to their profile. Mirrors the mobile
 * /add-sport wizard in UX and save logic.
 *
 * Route: /add-sport  (outside the web shell — standalone full-page)
 *
 * Steps:
 *   Step 1 – Sport selection      (OnboardingSportStepComponent)
 *   Step 2 – Connected accounts   (OnboardingLinkDropStepComponent)
 *
 * Roles:
 *   coach / director  → "Add Team" label, linkScope = 'team'
 *   athlete → "Add Sport" label, linkScope = 'athlete'
 */

import { Component, ChangeDetectionStrategy, inject, ViewChild, OnInit } from '@angular/core';

// Shared UI Components
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { OnboardingSportStepComponent } from '@nxt1/ui/onboarding/onboarding-sport-step';
import { OnboardingLinkDropStepComponent } from '@nxt1/ui/onboarding/onboarding-link-drop-step';
import { OnboardingNavigationButtonsComponent } from '@nxt1/ui/onboarding/onboarding-navigation-buttons';
import { OnboardingButtonMobileComponent } from '@nxt1/ui/onboarding/onboarding-button-mobile';
import { OnboardingStepCardComponent } from '@nxt1/ui/onboarding/onboarding-step-card';
import { OnboardingAgentXTypewriterComponent } from '@nxt1/ui/onboarding/onboarding-agent-x-typewriter';

// Core constants
import { TEST_IDS } from '@nxt1/core/testing';

// App service
import { AddSportService } from './add-sport.service';

@Component({
  selector: 'app-add-sport',
  standalone: true,
  imports: [
    AuthShellComponent,
    OnboardingSportStepComponent,
    OnboardingLinkDropStepComponent,
    OnboardingNavigationButtonsComponent,
    OnboardingButtonMobileComponent,
    OnboardingStepCardComponent,
    OnboardingAgentXTypewriterComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="onboarding"
      [showLogo]="true"
      [showBackButton]="true"
      [mobileFooterPadding]="service.isMobile()"
      [attr.data-testid]="testIds.SHELL"
      (backClick)="service.onBack()"
    >
      <!-- Desktop: branding panel title -->
      <ng-container authTitle>
        <span [attr.data-testid]="testIds.TITLE">{{ service.pageTitle() }}</span>
      </ng-container>

      <!-- Desktop: branding panel subtitle (typewriter) -->
      <ng-container authSubtitle>
        <nxt1-onboarding-agent-x-typewriter [message]="service.agentXMessage()" />
      </ng-container>

      <!-- Mobile: typewriter above form -->
      <div authTitleMobile class="nxt1-add-sport-mobile-header">
        <nxt1-onboarding-agent-x-typewriter [message]="service.agentXMessage()" />
        <h1
          class="mb-2 mt-2 text-2xl font-bold text-text-primary"
          [attr.data-testid]="testIds.TITLE"
        >
          {{ service.pageTitle() }}
        </h1>
      </div>

      <!-- Step Content -->
      <div authContent class="flex flex-col" [attr.data-testid]="testIds.STEP_CONTENT">
        <nxt1-onboarding-step-card
          variant="seamless"
          [animationDirection]="service.animationDirection()"
          [animationKey]="service.currentStep()"
        >
          <!-- Step 1: Sport Selection -->
          @if (service.currentStep() === 'sport') {
            <div [attr.data-testid]="testIds.STEP_SPORT">
              <nxt1-onboarding-sport-step
                [sportData]="service.sportFormData()"
                [sports]="service.availableSports()"
                [role]="service.userRole()"
                [disabled]="service.isLoading()"
                [promptOverride]="service.sportStepPrompt()"
                (sportChange)="service.onSportChange($event)"
              />
            </div>
          }

          <!-- Step 2: Connected Accounts -->
          @if (service.currentStep() === 'link-sources') {
            <div [attr.data-testid]="testIds.STEP_LINK_SOURCES">
              <nxt1-onboarding-link-drop-step
                #linkSourcesStep
                [linkSourcesData]="service.linkSourcesFormData()"
                [selectedSports]="service.selectedSportNames()"
                [role]="service.userRole()"
                [disabled]="service.isLoading()"
                [scope]="service.linkScope()"
                (linkSourcesChange)="service.onLinkSourcesChange($event)"
              />
            </div>
          }
        </nxt1-onboarding-step-card>
      </div>

      <!-- Desktop: footer slot (outside scroll area, always visible) -->
      <div
        authFooter
        class="nxt1-add-sport-desktop-footer"
        [attr.data-testid]="testIds.DESKTOP_FOOTER"
      >
        @if (!service.isMobile()) {
          <nxt1-onboarding-navigation-buttons
            [showSkip]="service.isLastStep()"
            [showBack]="false"
            [isLastStep]="service.isLastStep()"
            [loading]="service.isLoading()"
            [disabled]="!service.isCurrentStepValid() && !service.isLastStep()"
            (skipClick)="service.onSkip()"
            (continueClick)="service.onContinue()"
          />
        }
      </div>
    </nxt1-auth-shell>

    <!-- Mobile: sticky footer rendered outside shell scroll flow -->
    @if (service.isMobile()) {
      <nxt1-onboarding-button-mobile
        [attr.data-testid]="testIds.MOBILE_FOOTER"
        [totalSteps]="service.totalSteps"
        [currentStepIndex]="service.currentStepIndex()"
        [completedStepIndices]="[]"
        [showSkip]="service.isLastStep()"
        [isLastStep]="service.isLastStep()"
        [loading]="service.isLoading()"
        [disabled]="!service.isCurrentStepValid() && !service.isLastStep()"
        [showSignOut]="false"
        (skipClick)="service.onSkip()"
        (continueClick)="service.onContinue()"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .nxt1-add-sport-mobile-header {
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .nxt1-add-sport-desktop-footer {
        display: block;
        width: 100%;
        margin-top: var(--nxt1-spacing-6, 24px);
      }

      .nxt1-add-sport-desktop-footer nxt1-onboarding-navigation-buttons {
        display: block;
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSportComponent implements OnInit {
  protected readonly service = inject(AddSportService);
  protected readonly testIds = TEST_IDS.ADD_SPORT;

  @ViewChild('linkSourcesStep') linkSourcesStepRef?: OnboardingLinkDropStepComponent;

  ngOnInit(): void {
    this.service.initialize();
  }
}
