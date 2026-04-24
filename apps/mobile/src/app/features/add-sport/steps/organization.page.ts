/**
 * @fileoverview AddSport – Organization Selection Step Page
 * @module @nxt1/mobile/features/add-sport
 *
 * Reuses OnboardingTeamSelectionStepComponent from @nxt1/ui.
 * Injects AddSportService (scoped to the shell) for shared state.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  effect,
  viewChild,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import {
  AuthShellComponent,
  OnboardingTeamSelectionStepComponent,
  OnboardingAgentXTypewriterComponent,
  NxtLogoComponent,
} from '@nxt1/ui';
import { TEST_IDS } from '@nxt1/core/testing';

import { AddSportService } from '../add-sport.service';

@Component({
  selector: 'app-add-sport-organization-step',
  standalone: true,
  imports: [
    IonContent,
    AuthShellComponent,
    OnboardingTeamSelectionStepComponent,
    OnboardingAgentXTypewriterComponent,
    NxtLogoComponent,
  ],
  template: `
    <ion-content [fullscreen]="true">
      <nxt1-auth-shell
        variant="minimal"
        [showLogo]="false"
        [showBackButton]="true"
        [maxWidth]="'560px'"
        [mobileFooterPadding]="true"
        (backClick)="addSport.onBack()"
      >
        <div authContent class="nxt1-add-sport-step" [attr.data-testid]="testIds.STEP_ORGANIZATION">
          <div class="nxt1-add-sport-logo">
            <nxt1-logo size="sm" variant="auth" />
          </div>

          <nxt1-onboarding-agent-x-typewriter
            [message]="organizationTypewriterMessage()"
            alignment="left"
            [showLogo]="true"
          />

          @if (contentReady()) {
            <nxt1-onboarding-team-selection-step
              [teamSelectionData]="addSport.teamSelectionFormData()"
              [sportData]="addSport.sportFormData()"
              [disabled]="addSport.isLoading()"
              [searchTeams]="addSport.searchTeamsFn"
              [userType]="addSport.selectedRole()"
              variant="list-row"
              (teamSelectionChange)="addSport.onTeamSelectionChange($event)"
              (createProgram)="addSport.onCreateProgram()"
              (joinProgram)="addSport.onJoinProgram()"
            />
          }
        </div>
      </nxt1-auth-shell>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .nxt1-add-sport-logo {
        margin-top: var(--nxt1-spacing-4, 16px);
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSportOrganizationStepPage {
  protected readonly addSport = inject(AddSportService);
  protected readonly testIds = TEST_IDS.ADD_SPORT;

  private readonly typewriterRef = viewChild(OnboardingAgentXTypewriterComponent);

  protected readonly contentReady = computed(() => {
    const tw = this.typewriterRef();
    return tw ? !tw.isTyping() : true;
  });

  protected readonly organizationTypewriterMessage = computed(() =>
    this.addSport.isTeamRoleUser()
      ? 'Which organization or program should this new team belong to?'
      : 'Which organization or program should this sport be connected to?'
  );

  constructor() {
    effect(() => {
      this.addSport.setContentReady(this.contentReady());
    });
  }
}
