/**
 * @fileoverview Profile Feature - Mobile Wrapper
 * @module @nxt1/mobile/features/profile
 *
 * Thin mobile wrapper for profile functionality.
 * All UI logic lives in @nxt1/ui - this just handles mobile-specific concerns.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                 apps/mobile/profile (~5%)                   │
 * │     Mobile-specific: Routes, deep links, native features    │
 * ├─────────────────────────────────────────────────────────────┤
 * │              @nxt1/ui/profile (~95% shared)                 │
 * │        ProfileShellComponent + all UI components            │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 * - Route integration with mobile tabs
 * - User state from auth service
 * - Native navigation (including edit profile bottom sheet)
 * - Deep link handling (future)
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';

// Shared UI from @nxt1/ui (95% of the code)
import {
  ProfileShellComponent,
  EditProfileBottomSheetService,
  ManageTeamBottomSheetService,
  NxtSidenavService,
  ProfileService,
} from '@nxt1/ui';

// Mobile-specific services
import { MobileAuthService } from '../auth/services/mobile-auth.service';
import { ShareService } from '../../core/services/share.service';

/**
 * Mobile Profile Feature Component
 *
 * Thin wrapper that:
 * 1. Extracts unicode from route params
 * 2. Provides current user from auth state
 * 3. Delegates all UI to ProfileShellComponent
 * 4. Handles edit profile via bottom sheet
 *
 * Note: isOwnProfile is determined by ProfileShellComponent internally
 * by comparing the loaded profile with the current user.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, ProfileShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-profile-shell
        [currentUser]="currentUser()"
        [profileUnicode]="profileUnicode()"
        (avatarClick)="onAvatarClick()"
        (backClick)="onBackClick()"
        (editProfileClick)="onEditProfile()"
        (editTeamClick)="onEditTeam()"
        (shareClick)="onShare()"
      />
    </ion-content>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    ion-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: -1;
      --background: transparent;
    }
    ion-toolbar {
      --background: transparent;
      --min-height: 0;
      --padding-top: 0;
      --padding-bottom: 0;
    }
    ion-content {
      --background: var(--nxt1-color-bg-primary, #0a0a0a);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(MobileAuthService);
  private readonly editProfileSheet = inject(EditProfileBottomSheetService);
  private readonly manageTeamSheet = inject(ManageTeamBottomSheetService);
  private readonly navController = inject(NavController);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly profileService = inject(ProfileService);
  private readonly shareService = inject(ShareService);

  // ============================================
  // STATE
  // ============================================

  /** Unicode from route params - required for profile loading */
  protected readonly profileUnicode = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('unicode') ?? '')),
    { initialValue: '' }
  );

  /** Current authenticated user for header display */
  protected readonly currentUser = computed(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      profileImg: user.profileImg ?? null,
      displayName: user.displayName ?? 'User',
    };
  });

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Opens the sidenav (mobile pattern - avatar opens sidenav).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Navigates back to the previous page using Ionic's NavController.
   * Uses back() for proper navigation stack handling.
   */
  protected onBackClick(): void {
    this.navController.back();
  }

  /**
   * Opens the edit profile bottom sheet (full-screen on mobile).
   * Called when user taps 'Edit Profile' button.
   */
  protected async onEditProfile(): Promise<void> {
    const result = await this.editProfileSheet.open();

    if (result?.saved) {
      // Profile was saved - could trigger refresh here if needed
      // The ProfileService should handle data refresh internally
    }
  }

  /**
   * Opens the manage team bottom sheet (full-screen on mobile).
   * Called when user taps 'Edit Team' button.
   */
  protected async onEditTeam(): Promise<void> {
    const result = await this.manageTeamSheet.open();

    if (result?.saved) {
      // Team was saved - could trigger refresh here if needed
      // The ManageTeamService should handle data refresh internally
    }
  }

  /**
   * Handles native share for the profile using the centralized ShareService.
   */
  protected async onShare(): Promise<void> {
    const user = this.profileService.user();
    if (!user) return;

    const profileId = this.profileUnicode() || user.profileCode || user.uid;
    if (!profileId) return;

    await this.shareService.shareProfile(
      {
        id: profileId,
        slug: user.profileCode || undefined,
        athleteName:
          user.displayName || `${user.firstName} ${user.lastName}`.trim() || 'NXT1 Athlete',
        position: user.primarySport?.position,
        classYear: user.classYear ? Number(user.classYear) : undefined,
        school: user.school?.name,
        sport: user.primarySport?.name,
        location: user.location || user.school?.location,
        imageUrl: user.profileImg,
      },
      {
        analyticsProps: {
          is_own_profile: this.profileService.isOwnProfile(),
        },
      }
    );
  }
}
