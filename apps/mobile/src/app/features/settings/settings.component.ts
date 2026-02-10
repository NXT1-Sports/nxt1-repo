/**
 * @fileoverview Settings Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/settings
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
 * - User context from AuthFlowService
 * - Confirmation dialogs
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  SettingsShellComponent,
  NxtSidenavService,
  NxtLoggingService,
  NxtBottomSheetService,
  type SettingsUser,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
} from '@nxt1/ui';
import { AuthFlowService } from '../auth/services/auth-flow.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, SettingsShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-settings-shell
        [user]="userInfo()"
        (back)="onBack()"
        (editProfile)="onEditProfile()"
        (navigate)="onNavigate($event)"
        (action)="onAction($event)"
        (signOut)="onSignOut()"
        (deleteAccount)="onDeleteAccount()"
      />
    </ion-content>
  `,
  styles: [
    `
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
      ion-content::part(scroll) {
        overflow: visible;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly authService = inject(AuthFlowService);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly navController = inject(NavController);
  private readonly logger = inject(NxtLoggingService).child('SettingsComponent');

  /**
   * Transform auth user to SettingsUser interface.
   */
  protected readonly userInfo = computed<SettingsUser | null>(() => {
    const user = this.authService.user();
    if (!user) return null;

    return {
      photoURL: user.photoURL ?? undefined,
      displayName: user.displayName ?? undefined,
    };
  });

  /**
   * Handle back navigation using Ionic's navigation stack.
   */
  protected onBack(): void {
    this.navController.back();
  }

  /**
   * Handle edit profile navigation.
   */
  protected onEditProfile(): void {
    this.navController.navigateForward('/profile/edit');
  }

  /**
   * Handle navigation requests from settings items.
   */
  protected onNavigate(event: SettingsNavigateEvent): void {
    this.logger.debug('Navigate requested', { itemId: event.itemId, route: event.route });

    if (event.route) {
      this.navController.navigateForward(event.route);
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
        this.navController.navigateRoot('/auth');
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
