import type { SidenavSportProfile, TopNavUserData, UserDisplayContext } from '@nxt1/core';

import type { DesktopSidebarUserData } from '../desktop-sidebar/desktop-sidebar.types';
import type { MobileHeaderUserData } from '../mobile-header/mobile-header.types';
import type { MobileSidebarUserData } from '../mobile-sidebar/mobile-sidebar.types';

interface SharedShellUserDataFields {
  readonly name: string;
  readonly profileImg?: string;
  readonly initials?: string;
  readonly verified?: boolean;
  readonly isTeamRole?: boolean;
  readonly isOnTeam?: boolean;
  readonly canAddProfile?: boolean;
}

export interface NavigationShellUserData {
  readonly desktopSidebar: DesktopSidebarUserData;
  readonly mobileSidebar: MobileSidebarUserData;
  readonly topNav: TopNavUserData;
  readonly mobileHeader: MobileHeaderUserData;
}

function buildSharedShellUserData(ctx: UserDisplayContext): SharedShellUserDataFields {
  return {
    name: ctx.name,
    profileImg: ctx.profileImg,
    initials: ctx.initials,
    verified: ctx.verified,
    isTeamRole: ctx.isTeamRole,
    isOnTeam: ctx.isOnTeam,
    canAddProfile: ctx.canAddProfile,
  };
}

export function buildNavigationShellUserData(ctx: UserDisplayContext): NavigationShellUserData {
  const shared = buildSharedShellUserData(ctx);
  const sportProfiles = ctx.sportProfiles as SidenavSportProfile[];

  return {
    desktopSidebar: {
      ...shared,
      handle: ctx.handle,
    },
    mobileSidebar: {
      ...shared,
      handle: ctx.handle,
      sportLabel: ctx.sportLabel,
      sportProfiles,
      switcherTitle: ctx.switcherTitle,
      actionLabel: ctx.actionLabel,
    },
    topNav: {
      ...shared,
      email: ctx.email,
      sportLabel: ctx.sportLabel,
      profileRoute: ctx.profileRoute,
      switcherTitle: ctx.switcherTitle,
      actionLabel: ctx.actionLabel,
      sportProfiles,
    },
    mobileHeader: {
      ...shared,
    },
  };
}
