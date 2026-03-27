/**
 * @fileoverview Manage Team Constants
 * @module @nxt1/core/manage-team
 * @version 1.0.0
 *
 * Configuration constants for Manage Team feature.
 * 100% portable - works on web, mobile, and backend.
 */

import type {
  ManageTeamSection,
  ManageTeamSectionId,
  ManageTeamTabId,
  SponsorTier,
  StaffRole,
  TeamLevel,
} from './manage-team.types';

// ============================================
// SECTION CONFIGURATIONS
// ============================================

/**
 * Default section configurations for manage team.
 */
export const MANAGE_TEAM_SECTIONS: Record<
  ManageTeamSectionId,
  Omit<ManageTeamSection, 'fields' | 'completionPercent'>
> = {
  'team-info': {
    id: 'team-info',
    title: 'Team Information',
    icon: 'shield-outline',
    description: 'Logo, mascot, colors & contact',
  },
  roster: {
    id: 'roster',
    title: 'Roster',
    icon: 'people-outline',
    description: 'Manage players & positions',
  },
  schedule: {
    id: 'schedule',
    title: 'Schedule',
    icon: 'calendar-outline',
    description: 'Games, practices & events',
  },
  stats: {
    id: 'stats',
    title: 'Stats & Record',
    icon: 'stats-chart-outline',
    description: 'Team statistics & standings',
  },
  staff: {
    id: 'staff',
    title: 'Staff',
    icon: 'briefcase-outline',
    description: 'Coaches & team personnel',
  },
  sponsors: {
    id: 'sponsors',
    title: 'Sponsors',
    icon: 'ribbon-outline',
    description: 'Team sponsors & partners',
  },
  images: {
    id: 'images',
    title: 'Images',
    icon: 'image-outline',
    description: 'Team photos & media',
  },
  accounts: {
    id: 'accounts',
    title: 'Connected Accounts',
    icon: 'link-outline',
    description: 'Linked social & platform accounts',
  },
  about: {
    id: 'about',
    title: 'About Info',
    icon: 'information-circle-outline',
    description: 'Program, title & team details',
  },
  contact: {
    id: 'contact',
    title: 'Contact Info',
    icon: 'mail-outline',
    description: 'Email, phone & address',
  },
} as const;

/**
 * Tab configurations for manage team navigation.
 */
export const MANAGE_TEAM_TABS: readonly { id: ManageTeamTabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid-outline' },
  { id: 'roster', label: 'Roster', icon: 'people-outline' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
  { id: 'stats', label: 'Stats', icon: 'stats-chart-outline' },
  { id: 'staff', label: 'Staff', icon: 'briefcase-outline' },
  { id: 'sponsors', label: 'Sponsors', icon: 'ribbon-outline' },
] as const;

// ============================================
// SPONSOR TIERS
// ============================================

/**
 * Sponsor tier configurations with colors and benefits.
 */
export const SPONSOR_TIER_CONFIG: Record<
  SponsorTier,
  {
    readonly label: string;
    readonly color: string;
    readonly icon: string;
    readonly order: number;
  }
> = {
  platinum: {
    label: 'Platinum',
    color: '#E5E4E2',
    icon: 'diamond-outline',
    order: 1,
  },
  gold: {
    label: 'Gold',
    color: '#FFD700',
    icon: 'trophy-outline',
    order: 2,
  },
  silver: {
    label: 'Silver',
    color: '#C0C0C0',
    icon: 'medal-outline',
    order: 3,
  },
  bronze: {
    label: 'Bronze',
    color: '#CD7F32',
    icon: 'ribbon-outline',
    order: 4,
  },
  supporter: {
    label: 'Supporter',
    color: '#4CAF50',
    icon: 'heart-outline',
    order: 5,
  },
  partner: {
    label: 'Partner',
    color: '#2196F3',
    icon: 'handshake-outline',
    order: 6,
  },
} as const;

// ============================================
// STAFF ROLES
// ============================================

/**
 * Staff role configurations.
 */
export const STAFF_ROLE_CONFIG: Record<
  StaffRole,
  {
    readonly label: string;
    readonly icon: string;
    readonly order: number;
  }
> = {
  'head-coach': {
    label: 'Head Coach',
    icon: 'person-outline',
    order: 1,
  },
  'assistant-coach': {
    label: 'Assistant Coach',
    icon: 'people-outline',
    order: 2,
  },
  coordinator: {
    label: 'Coordinator',
    icon: 'git-network-outline',
    order: 3,
  },
  'position-coach': {
    label: 'Position Coach',
    icon: 'fitness-outline',
    order: 4,
  },
  trainer: {
    label: 'Athletic Trainer',
    icon: 'medical-outline',
    order: 5,
  },
  manager: {
    label: 'Team Manager',
    icon: 'clipboard-outline',
    order: 6,
  },
  statistician: {
    label: 'Statistician',
    icon: 'stats-chart-outline',
    order: 7,
  },
  volunteer: {
    label: 'Volunteer',
    icon: 'hand-right-outline',
    order: 8,
  },
  administrator: {
    label: 'Administrator',
    icon: 'settings-outline',
    order: 9,
  },
  other: {
    label: 'Other',
    icon: 'ellipsis-horizontal-outline',
    order: 10,
  },
} as const;

// ============================================
// TEAM LEVELS
// ============================================

/**
 * Team level configurations.
 */
export const TEAM_LEVEL_CONFIG: Record<
  TeamLevel,
  {
    readonly label: string;
    readonly shortLabel: string;
    readonly order: number;
  }
> = {
  youth: { label: 'Youth', shortLabel: 'Youth', order: 1 },
  'middle-school': { label: 'Middle School', shortLabel: 'MS', order: 2 },
  jv: { label: 'Junior Varsity', shortLabel: 'JV', order: 3 },
  varsity: { label: 'Varsity', shortLabel: 'V', order: 4 },
  club: { label: 'Club', shortLabel: 'Club', order: 5 },
  travel: { label: 'Travel', shortLabel: 'Travel', order: 6 },
  college: { label: 'College', shortLabel: 'College', order: 7 },
  'semi-pro': { label: 'Semi-Professional', shortLabel: 'Semi-Pro', order: 8 },
  professional: { label: 'Professional', shortLabel: 'Pro', order: 9 },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get manage team section by ID.
 */
export function getManageTeamSection(
  sectionId: ManageTeamSectionId
): Omit<ManageTeamSection, 'fields' | 'completionPercent'> {
  return MANAGE_TEAM_SECTIONS[sectionId];
}

/**
 * Get all manage team sections as array.
 */
export function getAllManageTeamSections(): readonly Omit<
  ManageTeamSection,
  'fields' | 'completionPercent'
>[] {
  return Object.values(MANAGE_TEAM_SECTIONS);
}

/**
 * Get sponsor tier config.
 */
export function getSponsorTierConfig(tier: SponsorTier) {
  return SPONSOR_TIER_CONFIG[tier];
}

/**
 * Get staff role config.
 */
export function getStaffRoleConfig(role: StaffRole) {
  return STAFF_ROLE_CONFIG[role];
}

/**
 * Get team level config.
 */
export function getTeamLevelConfig(level: TeamLevel) {
  return TEAM_LEVEL_CONFIG[level];
}
