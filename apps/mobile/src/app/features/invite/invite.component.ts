/**
 * @fileoverview Invite Page - Mobile App Wrapper
 * @module @nxt1/mobile/features/invite
 * @version 1.0.0
 *
 * Thin wrapper component that renders the shared Invite shell
 * from @nxt1/ui. Wraps in ion-header + ion-content for proper
 * Ionic navigation lifecycle and animations.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  signal,
} from '@angular/core';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import { InviteShellComponent, InviteService, type InviteUser } from '@nxt1/ui';
import type { InviteType } from '@nxt1/core';
import { ActivatedRoute } from '@angular/router';
import { ProfileService } from '../../core/services/state/profile.service';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [IonHeader, IonContent, IonToolbar, InviteShellComponent],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <nxt1-invite-shell
        [user]="userInfo()"
        [inviteType]="inviteType()"
        [isModal]="false"
        [showClose]="true"
        (close)="navigateBack()"
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteMobileComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly inviteService = inject(InviteService);
  private readonly navController = inject(NavController);
  private readonly route = inject(ActivatedRoute);

  private readonly _inviteType = signal<InviteType>('referral');
  protected readonly inviteType = this._inviteType.asReadonly();

  protected readonly userInfo = computed<InviteUser | null>(() => {
    const user = this.profileService.user();
    if (!user) return null;

    const primarySport = this.profileService.primarySport();
    const location = [primarySport?.team?.city, primarySport?.team?.state]
      .filter(Boolean)
      .join(', ');

    return {
      displayName: user.displayName || 'NXT1 User',
      profileImg: user.profileImgs?.[0] ?? null,
      role: user.role ?? undefined,
      primaryPosition: primarySport?.positions?.[0] ?? null,
      schoolName: primarySport?.team?.name ?? null,
      primarySport: primarySport?.sport ?? null,
      location: location || null,
    };
  });

  async ngOnInit(): Promise<void> {
    // Read inviteType from route data (e.g. /invite/team/:teamId sets inviteType='team')
    const routeType = this.route.snapshot.data['inviteType'] as InviteType | undefined;
    if (routeType) this._inviteType.set(routeType);

    if (this.userInfo()) {
      await this.inviteService.initialize();
    }
  }

  protected navigateBack(): void {
    this.navController.navigateBack('/');
  }
}
