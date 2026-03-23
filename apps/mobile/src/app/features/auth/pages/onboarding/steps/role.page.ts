/**
 * @fileoverview Role Selection Step Page
 * @module @nxt1/mobile/features/auth
 *
 * Thin Ionic page wrapper for role selection onboarding step.
 * Uses `<ion-content>` so IonRouterOutlet provides native slide transitions.
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
  OnboardingRoleSelectionComponent,
  OnboardingAgentXTypewriterComponent,
  NxtLogoComponent,
} from '@nxt1/ui';

import { OnboardingService } from '../../../services/onboarding.service';

@Component({
  selector: 'app-onboarding-role-step',
  standalone: true,
  imports: [
    IonContent,
    AuthShellComponent,
    OnboardingRoleSelectionComponent,
    OnboardingAgentXTypewriterComponent,
    NxtLogoComponent,
  ],
  template: `
    <ion-content [fullscreen]="true">
      <nxt1-auth-shell
        variant="minimal"
        [showLogo]="false"
        [showBackButton]="onboarding.canGoBack()"
        [maxWidth]="'560px'"
        [mobileFooterPadding]="true"
        (backClick)="onboarding.onBack()"
      >
        <div authContent class="nxt1-onboarding-step">
          <div class="nxt1-onboarding-logo">
            <nxt1-logo size="sm" variant="auth" />
          </div>

          <nxt1-onboarding-agent-x-typewriter
            [message]="onboarding.agentXMessage()"
            alignment="left"
            [showLogo]="true"
          />

          @if (contentReady()) {
            <nxt1-onboarding-role-selection
              [selectedRole]="onboarding.selectedRole()"
              [disabled]="onboarding.isLoading()"
              variant="list-row"
              (roleSelected)="onboarding.onRoleSelect($event)"
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

      .nxt1-onboarding-logo {
        margin-top: var(--nxt1-spacing-4, 16px);
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingRoleStepPage {
  protected readonly onboarding = inject(OnboardingService);

  private readonly typewriterRef = viewChild(OnboardingAgentXTypewriterComponent);

  protected readonly contentReady = computed(() => {
    const tw = this.typewriterRef();
    return tw ? !tw.isTyping() : false;
  });

  constructor() {
    effect(() => {
      this.onboarding.setContentReady(this.contentReady());
    });
  }
}
