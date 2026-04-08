/**
 * @fileoverview AddSport – Connected Accounts Step Page
 * @module @nxt1/mobile/features/add-sport
 *
 * Reuses OnboardingLinkDropStepComponent from @nxt1/ui.
 * Injects AddSportService (scoped to the shell) for shared state.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  effect,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import {
  AuthShellComponent,
  OnboardingLinkDropStepComponent,
  OnboardingAgentXTypewriterComponent,
  NxtLogoComponent,
} from '@nxt1/ui';
import { TEST_IDS } from '@nxt1/core/testing';

import { AddSportService } from '../add-sport.service';

@Component({
  selector: 'app-add-sport-link-sources-step',
  standalone: true,
  imports: [
    IonContent,
    AuthShellComponent,
    OnboardingLinkDropStepComponent,
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
        <div authContent class="nxt1-add-sport-step" [attr.data-testid]="testIds.STEP_LINK_SOURCES">
          <div class="nxt1-add-sport-logo">
            <nxt1-logo size="sm" variant="auth" />
          </div>

          <nxt1-onboarding-agent-x-typewriter
            message="Connect your accounts to unlock AI-powered insights for this sport."
            alignment="left"
            [showLogo]="true"
          />

          @if (contentReady()) {
            <nxt1-onboarding-link-drop-step
              #linkSourcesStep
              [linkSourcesData]="addSport.linkSourcesFormData()"
              [selectedSports]="addSport.selectedSportNames()"
              [role]="addSport.selectedRole()"
              [disabled]="addSport.isLoading()"
              [scope]="addSport.linkScope()"
              (linkSourcesChange)="addSport.onLinkSourcesChange($event)"
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
export class AddSportLinkSourcesStepPage implements OnDestroy {
  protected readonly addSport = inject(AddSportService);
  protected readonly testIds = TEST_IDS.ADD_SPORT;

  private readonly linkStepRef = viewChild<OnboardingLinkDropStepComponent>('linkSourcesStep');
  private readonly typewriterRef = viewChild(OnboardingAgentXTypewriterComponent);

  protected readonly contentReady = computed(() => {
    const tw = this.typewriterRef();
    return tw ? !tw.isTyping() : true;
  });

  constructor() {
    effect(() => {
      this.addSport.setContentReady(this.contentReady());
    });

    // Sync viewChild signal to service ref for quick-add link support
    effect(() => {
      const ref = this.linkStepRef();
      if (ref) {
        this.addSport.linkSourcesStepRef = ref;
      }
    });
  }

  ngOnDestroy(): void {
    this.addSport.linkSourcesStepRef = null;
  }
}
