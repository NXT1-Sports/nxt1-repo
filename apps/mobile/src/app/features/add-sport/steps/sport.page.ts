/**
 * @fileoverview AddSport – Sport Selection Step Page
 * @module @nxt1/mobile/features/add-sport
 *
 * Reuses OnboardingSportStepComponent from @nxt1/ui.
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
  OnboardingSportStepComponent,
  OnboardingAgentXTypewriterComponent,
  NxtLogoComponent,
} from '@nxt1/ui';

import { AddSportService } from '../add-sport.service';

@Component({
  selector: 'app-add-sport-sport-step',
  standalone: true,
  imports: [
    IonContent,
    AuthShellComponent,
    OnboardingSportStepComponent,
    OnboardingAgentXTypewriterComponent,
    NxtLogoComponent,
  ],
  template: `
    <ion-content [fullscreen]="true">
      <nxt1-auth-shell
        variant="minimal"
        [showLogo]="false"
        [showBackButton]="addSport.canGoBack()"
        [maxWidth]="'560px'"
        [mobileFooterPadding]="true"
        (backClick)="addSport.onBack()"
      >
        <div authContent class="nxt1-add-sport-step">
          <div class="nxt1-add-sport-logo">
            <nxt1-logo size="sm" variant="auth" />
          </div>

          <nxt1-onboarding-agent-x-typewriter
            message="Which sport are you adding to your profile?"
            alignment="left"
            [showLogo]="true"
          />

          @if (contentReady()) {
            <nxt1-onboarding-sport-step
              [sportData]="addSport.sportFormData()"
              [role]="addSport.selectedRole()"
              [disabled]="addSport.isLoading()"
              variant="list-row"
              (sportChange)="addSport.onSportChange($event)"
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
export class AddSportSportStepPage {
  protected readonly addSport = inject(AddSportService);

  private readonly typewriterRef = viewChild(OnboardingAgentXTypewriterComponent);

  protected readonly contentReady = computed(() => {
    const tw = this.typewriterRef();
    return tw ? !tw.isTyping() : true;
  });

  constructor() {
    effect(() => {
      this.addSport.setContentReady(this.contentReady());
    });
  }
}
