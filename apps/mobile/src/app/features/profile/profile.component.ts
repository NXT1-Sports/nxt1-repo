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

// Shared UI from @nxt1/ui (95% of the code)
import { ProfileShellComponent, EditProfileBottomSheetService } from '@nxt1/ui';

// Mobile-specific services
import { MobileAuthService } from '../auth/services/mobile-auth.service';

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
  imports: [ProfileShellComponent],
  template: `
    <nxt1-profile-shell
      [currentUser]="currentUser()"
      [profileUnicode]="profileUnicode()"
      (editProfileClick)="onEditProfile()"
    />
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
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
      photoURL: user.photoURL ?? null,
      displayName: user.displayName ?? 'User',
    };
  });

  // ============================================
  // ACTIONS
  // ============================================

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
}
