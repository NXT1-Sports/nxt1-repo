/**
 * @fileoverview Profile Page - Web App Wrapper
 * @module @nxt1/web/features/profile
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Profile shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 * - Share/QR code native APIs
 *
 * Routes:
 * - /profile/:unicode — View profile by unicode (unique profile identifier)
 * - /profile — View own profile (redirects to own unicode)
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  ProfileShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtToastService,
  type ProfileShellUser,
} from '@nxt1/ui';
import type { ProfileTabId } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ProfileShellComponent],
  template: `
    <nxt1-profile-shell
      [currentUser]="userInfo()"
      [profileUnicode]="profileUnicode()"
      [isOwnProfile]="isOwnProfile()"
      (avatarClick)="onAvatarClick()"
      (backClick)="onBackClick()"
      (tabChange)="onTabChange($event)"
      (editProfileClick)="onEditProfile()"
      (shareClick)="onShare()"
      (qrCodeClick)="onQrCode()"
      (aiSummaryClick)="onAiSummary()"
      (createPostClick)="onCreatePost()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileComponent');

  /**
   * Profile unicode from route parameter.
   * Unicode is the unique identifier for profiles (e.g., /profile/abc123).
   * This matches the v1 app's approach for single source of truth.
   */
  protected readonly profileUnicode = computed<string>(() => {
    // Get unicode from route params
    const routeUnicode = this.route.snapshot.paramMap.get('unicode');
    if (routeUnicode) return routeUnicode;

    // Fall back to current user's unicode
    const user = this.authService.user();
    return user?.unicode ?? '';
  });

  /**
   * Whether viewing own profile.
   */
  protected readonly isOwnProfile = computed<boolean>(() => {
    const user = this.authService.user();
    const routeUnicode = this.route.snapshot.paramMap.get('unicode');

    // If no route unicode, we're viewing own profile
    if (!routeUnicode) return true;

    // Check if route unicode matches current user's unicode
    return user?.unicode === routeUnicode;
  });

  /**
   * Transform auth user to ProfileShellUser interface.
   */
  protected readonly userInfo = computed<ProfileShellUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL,
      displayName: user.displayName,
    };
  });

  ngOnInit(): void {
    this.logger.info('Profile component initialized', {
      profileUnicode: this.profileUnicode(),
      isOwnProfile: this.isOwnProfile(),
    });
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern).
   */
  protected onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle back navigation.
   */
  protected onBackClick(): void {
    // Use browser history if available, otherwise go home
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/home']);
    }
  }

  /**
   * Handle tab changes for analytics/logging.
   */
  protected onTabChange(tab: ProfileTabId): void {
    this.logger.debug('Profile tab changed', { tab });
    // In production: track analytics event
    // this.analytics.track('profile_tab_change', { tab });
  }

  /**
   * Handle edit profile navigation.
   */
  protected onEditProfile(): void {
    this.logger.info('Edit profile clicked');
    this.router.navigate(['/settings/profile']);
  }

  /**
   * Handle share profile.
   */
  protected async onShare(): Promise<void> {
    const profileUrl = `${window.location.origin}/profile/${this.profileUnicode()}`;

    // Try native share API first
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out my NXT1 profile',
          text: 'View my sports recruiting profile on NXT1',
          url: profileUrl,
        });
        this.logger.info('Profile shared via native share');
        return;
      } catch (err) {
        // User cancelled or error - fall back to clipboard
        if ((err as Error).name !== 'AbortError') {
          this.logger.warn('Native share failed', { error: err });
        }
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(profileUrl);
      this.toast.success('Profile link copied to clipboard');
      this.logger.info('Profile link copied to clipboard');
    } catch {
      this.toast.error('Failed to copy link');
    }
  }

  /**
   * Handle QR code display.
   */
  protected onQrCode(): void {
    this.logger.info('QR code clicked');
    // TODO: Open QR code modal with profile URL
    this.toast.info('QR code feature coming soon');
  }

  /**
   * Handle AI summary request.
   */
  protected onAiSummary(): void {
    this.logger.info('AI summary clicked');
    // TODO: Open AI summary modal
    this.toast.info('AI summary feature coming soon');
  }

  /**
   * Handle create post navigation.
   */
  protected onCreatePost(): void {
    this.logger.info('Create post clicked');
    this.router.navigate(['/post/create']);
  }
}
