/**
 * @fileoverview XP Page - Web App Wrapper
 * @module @nxt1/web/features/xp
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared XP shell
 * from @nxt1/ui and wires up platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual UI and logic live in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific routing/navigation
 * - User context from AuthService
 * - Role determination for XP task type
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import {
  XpShellComponent,
  NxtLoggingService,
  NxtSidenavService,
  NxtPlatformService,
} from '@nxt1/ui';
import type { MissionUserRole } from '@nxt1/core';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-xp',
  standalone: true,
  imports: [XpShellComponent],
  template: `
    <nxt1-xp-shell
      [userRole]="userRole()"
      [avatarSrc]="avatarSrc()"
      [avatarName]="avatarName()"
      [hideHeader]="isDesktop()"
      (avatarClick)="onAvatarClick()"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpComponent {
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;
  private readonly sidenavService = inject(NxtSidenavService);
  // Logger prepared for debugging and error tracking
  private readonly _logger = inject(NxtLoggingService).child('XpComponent');
  private readonly platform = inject(NxtPlatformService);

  /** Desktop detection for hiding redundant page header (sidebar provides nav) */
  protected readonly isDesktop = computed(() => this.platform.viewport().width >= 1280);

  /**
   * Determine user role for XP task type.
   * Defaults to 'athlete' if user is not authenticated.
   */
  protected readonly userRole = computed<MissionUserRole>(() => {
    const user = this.authService.user();
    if (!user) return 'athlete';

    // Check user roles/permissions to determine if coach or athlete
    // For now, check if user has coach-related properties
    const userObj = user as unknown as Record<string, unknown>;
    const role = userObj['role'];
    if (role === 'coach' || role === 'admin') {
      return 'coach';
    }

    return 'athlete';
  });

  /**
   * Avatar source URL for page header
   */
  protected readonly avatarSrc = computed(() => {
    const user = this.authService.user();
    if (!user) return undefined;
    const userObj = user as unknown as Record<string, unknown>;
    return userObj['photoURL'] as string | undefined;
  });

  /**
   * Avatar display name for page header
   */
  protected readonly avatarName = computed(() => {
    const user = this.authService.user();
    if (!user) return '';
    const userObj = user as unknown as Record<string, unknown>;
    return (userObj['displayName'] as string) ?? '';
  });

  /**
   * Handle avatar click - open sidenav
   */
  onAvatarClick(): void {
    this.sidenavService.open();
  }
}
