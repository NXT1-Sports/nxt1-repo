/**
 * @fileoverview Profile Step Page (with native geolocation)
 * @module @nxt1/mobile/features/auth
 *
 * Thin Ionic page wrapper for profile onboarding step.
 * Handles platform-specific geolocation detection via Capacitor.
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
  OnboardingProfileStepComponent,
  OnboardingAgentXTypewriterComponent,
  NxtLogoComponent,
  HapticsService,
  NxtLoggingService,
} from '@nxt1/ui';
import { USER_ROLES } from '@nxt1/core/constants';
import { GEOLOCATION_DEFAULTS } from '@nxt1/core/geolocation';
import type { ProfileLocationData } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';

import { OnboardingService } from '../../../../../core/services/auth/onboarding.service';

@Component({
  selector: 'app-onboarding-profile-step',
  standalone: true,
  imports: [
    IonContent,
    AuthShellComponent,
    OnboardingProfileStepComponent,
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
            <nxt1-onboarding-profile-step
              #profileStep
              [profileData]="onboarding.profileFormData()"
              [userType]="onboarding.selectedRole()"
              [disabled]="onboarding.isLoading()"
              [showGender]="true"
              [showLocation]="true"
              [showClassYear]="onboarding.selectedRole() === USER_ROLES.ATHLETE"
              [showCoachTitleField]="false"
              variant="list-row"
              (profileChange)="onboarding.onProfileChange($event)"
              (photoSelect)="onboarding.onPhotoSelect()"
              (filesSelected)="onboarding.onFilesSelected($event)"
              (locationRequest)="onLocationRequest()"
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
export class OnboardingProfileStepPage {
  protected readonly onboarding = inject(OnboardingService);
  protected readonly USER_ROLES = USER_ROLES;
  private readonly haptics = inject(HapticsService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('ProfileStep');

  private readonly profileStepRef = viewChild<OnboardingProfileStepComponent>('profileStep');

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

  /**
   * Handle location detection using Capacitor native geolocation.
   * Platform-specific code that stays in the page component.
   */
  async onLocationRequest(): Promise<void> {
    this.logger.info('Location detection requested');
    await this.haptics.selection();

    const geo = this.onboarding.geolocationService;

    if (!geo.isSupported()) {
      this.profileStepRef()?.setLocationError('Location detection is not supported on this device');
      return;
    }

    try {
      const currentPermission = await geo.checkPermission();
      this.logger.debug('Location permission status', { status: currentPermission });

      if (currentPermission === 'denied') {
        await this.haptics.notification('warning');
        this.profileStepRef()?.setLocationError(
          'Location permission denied. Please enable in Settings → Privacy → Location Services.'
        );
        return;
      }

      if (currentPermission !== 'granted') {
        const permission = await geo.requestPermission();
        if (permission === 'denied') {
          await this.haptics.notification('warning');
          this.profileStepRef()?.setLocationError(
            'Location permission denied. Please enable in Settings to auto-detect your location.'
          );
          return;
        }
      }

      const result = await geo.getCurrentLocation(GEOLOCATION_DEFAULTS.QUICK);

      if (result.success) {
        const { address } = result.data;

        const locationData: ProfileLocationData = {
          city: address?.city,
          state: address?.state,
          country: address?.countryCode,
          formatted: address?.formatted,
          isAutoDetected: true,
        };

        await this.haptics.notification('success');
        this.profileStepRef()?.setLocation(locationData);
        this.onboarding.updateProfileWithLocation(locationData);
      } else {
        await this.haptics.notification('error');
        let errorMessage = result.error.message || 'Unable to detect location';

        switch (result.error.code) {
          case 'PERMISSION_DENIED':
            errorMessage = 'Location permission denied. Please enable in Settings.';
            break;
          case 'POSITION_UNAVAILABLE':
            errorMessage =
              'Unable to determine your location. Please check that Location Services are enabled.';
            break;
          case 'TIMEOUT':
            errorMessage =
              'Location request timed out. Move to an area with better signal and try again.';
            break;
          case 'NOT_SUPPORTED':
            errorMessage = 'Location services are disabled. Please enable in Settings.';
            break;
        }

        this.profileStepRef()?.setLocationError(errorMessage);
        this.logger.warn('Location detection failed', { error: result.error });
      }
    } catch (err) {
      await this.haptics.notification('error');
      this.profileStepRef()?.setLocationError(
        'An unexpected error occurred. Please try again or enter your location manually.'
      );
      this.logger.error('Location detection error', err);
    }
  }
}
