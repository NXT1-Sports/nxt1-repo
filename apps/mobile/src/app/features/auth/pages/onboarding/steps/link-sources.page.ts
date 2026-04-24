/**
 * @fileoverview Link Sources (Connected Accounts) Step Page
 * @module @nxt1/mobile/features/auth
 *
 * Handles both 'link-sources' (athlete) and 'team-link-sources' (coach/director) steps.
 * Registers its component ref with OnboardingService for quick-add link support.
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
  NxtToastService,
  NxtLoggingService,
} from '@nxt1/ui';
import { USER_ROLES } from '@nxt1/core/constants';
import type { PlatformScope } from '@nxt1/core/api';
import { Auth } from '@angular/fire/auth';
import { environment } from '../../../../../../environments/environment';

import { OnboardingService } from '../../../../../core/services/auth/onboarding.service';

@Component({
  selector: 'app-onboarding-link-sources-step',
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
            <nxt1-onboarding-link-drop-step
              #linkSourcesStep
              [linkSourcesData]="onboarding.linkSourcesFormData()"
              [selectedSports]="onboarding.selectedSportNames()"
              [role]="onboarding.selectedRole()"
              [disabled]="onboarding.isLoading()"
              [hideSigninMode]="true"
              [scope]="linkScope()"
              (linkSourcesChange)="onboarding.onLinkSourcesChange($event)"
              (signinTokenConnect)="onSigninTokenConnect($event)"
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
export class OnboardingLinkSourcesStepPage implements OnDestroy {
  protected readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(Auth);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('LinkSourcesStep');

  private readonly linkStepRef = viewChild<OnboardingLinkDropStepComponent>('linkSourcesStep');

  private readonly typewriterRef = viewChild(OnboardingAgentXTypewriterComponent);

  protected readonly contentReady = computed(() => {
    const tw = this.typewriterRef();
    return tw ? !tw.isTyping() : false;
  });

  protected readonly linkScope = computed(() => {
    const role = this.onboarding.selectedRole();
    return role === USER_ROLES.COACH || role === USER_ROLES.DIRECTOR ? 'team' : 'athlete';
  });

  constructor() {
    effect(() => {
      this.onboarding.setContentReady(this.contentReady());
    });

    // Sync viewChild signal to service ref for quick-add link support
    effect(() => {
      const ref = this.linkStepRef();
      if (ref) {
        this.onboarding.linkSourcesStepRef = ref;
      }
    });
  }

  ngOnDestroy(): void {
    this.onboarding.linkSourcesStepRef = null;
  }

  async onSigninTokenConnect(event: {
    platform: 'google' | 'microsoft';
    accessToken: string;
    refreshToken?: string;
    scopeType: PlatformScope;
    scopeId?: string;
  }): Promise<void> {
    const { platform, accessToken, refreshToken, scopeType, scopeId } = event;

    const user = this.auth.currentUser;
    if (!user) {
      this.toast.error('Not signed in. Please restart the app.');
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const endpoint =
        platform === 'google'
          ? `${environment.apiUrl}/auth/google/connect-gmail`
          : `${environment.apiUrl}/auth/microsoft/connect-mail`;

      const body =
        platform === 'google'
          ? { accessToken }
          : { accessToken, ...(refreshToken ? { refreshToken } : {}) };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.logger.warn(`[${platform} connect] Backend failed`, {
          status: response.status,
          errorText,
        });
        this.toast.error(
          `Failed to connect ${platform === 'google' ? 'Google' : 'Microsoft'}: ${response.status}`
        );
        return;
      }

      const result = (await response.json()) as { success?: boolean; email?: string };
      this.logger.info(`[${platform} connect] Success`, { email: result.email });

      // Mark connected in the UI
      this.linkStepRef()?.markSigninConnected(platform, scopeType, scopeId);
      this.toast.success(`${platform === 'google' ? 'Google' : 'Microsoft'} connected!`);
    } catch (err) {
      this.logger.error(`[${platform} connect] Error`, err);
      this.toast.error('Connection failed. Please try again.');
    }
  }
}
