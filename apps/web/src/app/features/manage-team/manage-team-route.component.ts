import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ManageTeamMembershipModalService } from '@nxt1/ui/manage-team';
import { NxtLoggingService } from '@nxt1/ui/services/logging';

@Component({
  selector: 'app-manage-team-route',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamRouteComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly membershipModal = inject(ManageTeamMembershipModalService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamRouteComponent');

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }

      const teamId = this.route.snapshot.queryParamMap.get('teamId');
      if (!teamId) {
        return;
      }

      const tab = this.route.snapshot.queryParamMap.get('tab');
      const initialFilter = tab === 'pending' ? 'pending' : tab === 'staff' ? 'staff' : 'roster';

      void this.membershipModal
        .open({
          teamId,
          initialFilter,
        })
        .catch((err) => {
          this.logger.error('Failed to open manage team membership modal', err, {
            teamId,
            tab,
          });
        })
        .finally(() => {
          if (this.router.url.startsWith('/manage-team')) {
            void this.router.navigate(['/activity'], { replaceUrl: true });
          }
        });
    });
  }
}
