/**
 * @fileoverview Settings Page - Web App Wrapper
 * @module @nxt1/web/features/settings
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Settings shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - Sidenav integration
 * - User context from AuthService
 * - Confirmation dialogs
 */

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  SettingsShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtBottomSheetService,
  type SettingsUser,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
} from '@nxt1/ui';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [SettingsShellComponent],
  template: `
    <nxt1-settings-shell
      [user]="userInfo()"
      (back)="onBack()"
      (editProfile)="onEditProfile()"
      (navigate)="onNavigate($event)"
      (action)="onAction($event)"
      (signOut)="onSignOut()"
      (deleteAccount)="onDeleteAccount()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly router = inject(Router);
  private readonly logger = inject(NxtLoggingService).child('SettingsComponent');
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Settings',
      description: 'Manage your account settings, preferences, and privacy options.',
      keywords: ['settings', 'preferences', 'account', 'privacy'],
      noIndex: true, // Protected page - don't index
    });
  }

  /**
   * Transform auth user to SettingsUser interface.
   */
  protected readonly userInfo = computed<SettingsUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL,
      displayName: user.displayName,
    };
  });

  /**
   * Handle back navigation.
   */
  protected onBack(): void {
    this.router.navigate(['/home']);
  }

  /**
   * Handle edit profile navigation.
   */
  protected onEditProfile(): void {
    this.router.navigate(['/profile/edit']);
  }

  /**
   * Handle navigation requests from settings items.
   */
  protected onNavigate(event: SettingsNavigateEvent): void {
    this.logger.debug('Navigate requested', { itemId: event.itemId, route: event.route });

    if (event.route) {
      this.router.navigate([event.route]);
    }
    // External URLs are handled by the shell component
  }

  /**
   * Handle action requests from settings items.
   */
  protected async onAction(event: SettingsActionEvent): Promise<void> {
    this.logger.debug('Action triggered', { itemId: event.itemId, action: event.action });

    // Handle actions that need confirmation dialog
    if (event.requiresConfirmation) {
      const result = await this.bottomSheet.show({
        title: 'Confirm Action',
        subtitle: event.confirmationMessage,
        actions: [
          {
            label: 'Confirm',
            role: event.action === 'deleteAccount' ? 'destructive' : 'primary',
          },
          {
            label: 'Cancel',
            role: 'cancel',
          },
        ],
      });

      if (!result.confirmed) {
        return;
      }
    }

    // Handle specific actions
    switch (event.action) {
      case 'deleteAccount':
        this.logger.info('Delete account confirmed');
        // TODO: Implement actual account deletion
        break;

      default:
        this.logger.debug('Unhandled action', { action: event.action });
    }
  }

  /**
   * Handle sign out request.
   */
  protected async onSignOut(): Promise<void> {
    this.logger.info('Sign out requested');

    const result = await this.bottomSheet.show({
      title: 'Sign Out',
      subtitle: 'Are you sure you want to sign out?',
      actions: [
        {
          label: 'Sign Out',
          role: 'destructive',
        },
        {
          label: 'Cancel',
          role: 'cancel',
        },
      ],
    });

    if (result.confirmed) {
      try {
        await this.authService.signOut();
        this.router.navigate(['/auth']);
      } catch (err) {
        this.logger.error('Sign out failed', err);
      }
    }
  }

  /**
   * Handle delete account request.
   */
  protected async onDeleteAccount(): Promise<void> {
    this.logger.info('Delete account requested');

    const result = await this.bottomSheet.show({
      title: 'Delete Account',
      subtitle:
        'This action cannot be undone. All your data will be permanently deleted. Are you sure you want to continue?',
      destructive: true,
      actions: [
        {
          label: 'Delete My Account',
          role: 'destructive',
        },
        {
          label: 'Cancel',
          role: 'cancel',
        },
      ],
    });

    if (result.confirmed) {
      this.logger.info('Delete account confirmed');
      // TODO: Implement actual account deletion with password confirmation
    }
  }
}
