/**
 * @fileoverview Share copy helpers
 * @module @nxt1/core/seo/share-copy
 *
 * Centralized share text/title builders for web + mobile.
 * Pure TypeScript with zero platform dependencies.
 */

import type { ShareableArticle, ShareableProfile, ShareableTeam, ShareablePost } from './index';
import type { InviteType, InviteTeam } from '../invite/invite.types';
import type { UserRole } from '../constants/user.constants';
import { USER_ROLES } from '../constants/user.constants';
import { formatSportDisplayName } from '../constants/sport.constants';

export type ProfileShareSource = Omit<ShareableProfile, 'type' | 'title' | 'description'> & {
  id: string;
};

export type TeamShareSource = Omit<ShareableTeam, 'type' | 'title' | 'description'> & {
  id: string;
};

export type PostShareSource = Omit<ShareablePost, 'type' | 'title' | 'description'> & {
  id: string;
  postText: string;
};

export type ArticleShareSource = Omit<ShareableArticle, 'type' | 'description'> & {
  id: string;
  title: string;
};

export interface InviteShareSource {
  readonly inviteType?: InviteType | null;
  readonly senderRole?: UserRole | null;
  readonly senderName?: string | null;
  readonly senderPosition?: string | null;
  readonly senderSchool?: string | null;
  readonly senderSport?: string | null;
  readonly senderLocation?: string | null;
  readonly team?: Pick<InviteTeam, 'name' | 'sport'> | null;
  /**
   * Referral reward amount in cents. When provided, share/UI copy reflects
   * this exact dollar amount to keep frontend in sync with the backend's
   * live `AppConfig/referralReward` value. Omit to hide reward claims.
   */
  readonly rewardCents?: number | null;
}

export interface InviteUiCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly shareText: string;
  readonly howItWorksText: string;
}

/**
 * Default referral reward in cents used when no live value is available.
 * Keep in sync with `REFERRAL_REWARD_CENTS` in
 * `backend/src/modules/billing/budget.service.ts`.
 */
export const DEFAULT_REFERRAL_REWARD_CENTS = 500;

/**
 * Format a cents amount as a short USD string for share/marketing copy.
 * Whole-dollar amounts drop the decimals ("$5"), fractional amounts keep them ("$5.50").
 */
export function formatReferralReward(rewardCents: number | null | undefined): string {
  const cents =
    typeof rewardCents === 'number' && rewardCents > 0
      ? rewardCents
      : DEFAULT_REFERRAL_REWARD_CENTS;
  const dollars = cents / 100;
  const formatted =
    dollars % 1 === 0
      ? String(Math.round(dollars))
      : dollars.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `$${formatted}`;
}

function normalizeText(value: string | undefined | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function truncateText(value: string | undefined | null, maxLength: number): string {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatShareSport(sport: string | undefined): string {
  return sport ? formatSportDisplayName(sport) : '';
}

function isTeamManagementRole(role: UserRole | null | undefined): boolean {
  return role === USER_ROLES.COACH || role === USER_ROLES.DIRECTOR;
}

function hasTeamInviteContext(source: InviteShareSource): boolean {
  if (source.inviteType === 'team') return true;
  return Boolean(normalizeText(source.team?.name));
}

function buildBulletLine(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' • ');
}

function buildProfileIdentityLine(profile: ProfileShareSource): string {
  return buildBulletLine([profile.athleteName, profile.position, profile.school, profile.location]);
}

function buildTeamIdentityLine(team: TeamShareSource): string {
  return buildBulletLine([team.teamName, formatShareSport(team.sport), team.location]);
}

function buildInviteIdentityLine(source: InviteShareSource): string {
  if (source.inviteType === 'team') {
    return buildBulletLine([
      normalizeText(source.team?.name),
      formatShareSport(source.team?.sport),
      normalizeText(source.senderLocation),
    ]);
  }

  if (source.senderRole === USER_ROLES.DIRECTOR) {
    return buildBulletLine([source.senderName, source.senderSchool]);
  }

  if (isTeamManagementRole(source.senderRole)) {
    return buildBulletLine([
      source.senderName,
      source.senderSchool,
      formatShareSport(source.senderSport ?? source.team?.sport),
    ]);
  }

  return buildBulletLine([
    source.senderName,
    source.senderPosition,
    source.senderSchool,
    source.senderLocation,
  ]);
}

function appendIdentityLine(lead: string, identityLine: string): string {
  return identityLine ? `${lead}\n${identityLine}` : lead;
}

export function buildInviteShareTitle(source: InviteShareSource): string {
  if (source.inviteType === 'team') {
    const teamName = normalizeText(source.team?.name);
    return teamName
      ? `You're Invited to Join ${teamName} on NXT1`
      : "You're Invited to Join Our Team on NXT1";
  }

  if (isTeamManagementRole(source.senderRole) && hasTeamInviteContext(source)) {
    return 'Join Our Program on NXT1';
  }

  return "You're Invited to Join NXT1";
}

export function buildInviteShareText(source: InviteShareSource): string {
  if (source.inviteType === 'team') {
    const teamName = normalizeText(source.team?.name);
    const lead = teamName
      ? `You've been invited to join ${teamName} on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.`
      : "You've been invited to join our team on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.";
    return appendIdentityLine(lead, buildInviteIdentityLine(source));
  }

  if (isTeamManagementRole(source.senderRole) && hasTeamInviteContext(source)) {
    return appendIdentityLine(
      "You've been invited to join our program on NXT1 — the sports intelligence platform built for athletes, coaches, and programs.",
      buildInviteIdentityLine(source)
    );
  }

  return appendIdentityLine(
    "You've been invited to join NXT1 — the sports intelligence platform built for athletes, coaches, and programs. Sign up free.",
    buildInviteIdentityLine(source)
  );
}

export function buildInviteUiCopy(source: InviteShareSource): InviteUiCopy {
  if (source.inviteType === 'team') {
    const teamName = normalizeText(source.team?.name);
    return {
      title: 'Invite Players & Staff to Your Team',
      subtitle:
        'Send this invite to connect your players and staff directly to your team on NXT1 — one place for communication, schedules, and sports intelligence.',
      shareText: buildInviteShareText(source),
      howItWorksText: teamName
        ? `Share this link or QR code with your players and staff. Once they accept, they are connected directly to ${teamName} on NXT1.`
        : 'Share this link or QR code with your players and staff. Once they accept, they are connected directly to your team on NXT1.',
    };
  }

  if (isTeamManagementRole(source.senderRole) && hasTeamInviteContext(source)) {
    return {
      title: 'Grow Your Program on NXT1',
      subtitle:
        'Invite players and staff to your program. Once they join, everything is connected — communication, schedules, film, and sports intelligence in one place.',
      shareText: buildInviteShareText(source),
      howItWorksText:
        'Share this link or QR code with your players and staff. Once they join, they are connected to your program on NXT1.',
    };
  }

  const reward = formatReferralReward(source.rewardCents);
  return {
    title: `Earn ${reward} in Agent X Credits`,
    subtitle: `Invite teammates and friends to NXT1. Every time someone joins through your link, you earn ${reward} in Agent X credits.`,
    shareText: buildInviteShareText(source),
    howItWorksText: `Share your invite link or QR code. When someone joins through your invite, they land inside NXT1 and you earn ${reward} in Agent X credits automatically.`,
  };
}

export function buildProfileShareTitle(profile: ProfileShareSource): string {
  return `${profile.athleteName} Athlete Profile | NXT1`;
}

export function buildProfileShareText(profile: ProfileShareSource): string {
  return appendIdentityLine(
    'See my athletic profile & learn more about me on NXT1, the sports intelligence platform.',
    buildProfileIdentityLine(profile)
  );
}

export function buildProfileShareDescription(profile: ProfileShareSource): string {
  const parts: string[] = [];

  if (profile.position) parts.push(profile.position);
  if (profile.sport) parts.push(formatShareSport(profile.sport));
  if (profile.school) parts.push(profile.school);
  if (profile.classYear) parts.push(`Class of ${profile.classYear}`);

  const lead = parts.join(' | ');
  return lead
    ? `${lead}. Athlete profile on NXT1. Film, stats, and real-time sports intelligence.`
    : 'Athlete profile on NXT1. Film, stats, and real-time sports intelligence.';
}

export function buildTeamShareTitle(team: TeamShareSource): string {
  return `${team.teamName} Team Hub | NXT1`;
}

export function buildTeamShareText(team: TeamShareSource): string {
  return appendIdentityLine(
    'Get to know our athletes & program.\nPowered by NXT1, the sports intelligence platform.',
    buildTeamIdentityLine(team)
  );
}

export function buildTeamShareDescription(team: TeamShareSource): string {
  const teamContext = [
    formatShareSport(team.sport),
    normalizeText(team.location),
    team.record ? `Record ${team.record}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return teamContext
    ? `${teamContext}. NXT1 Team Hub with roster, schedule, highlights, and sports intelligence.`
    : 'NXT1 Team Hub with roster, schedule, highlights, and sports intelligence.';
}

export function buildPostShareTitle(post: PostShareSource): string {
  return `${post.authorName} on NXT1`;
}

export function buildPostShareText(post: PostShareSource): string {
  const identityLine = buildBulletLine([post.authorName]);
  return appendIdentityLine(
    'Check out my journey on NXT1, the sports intelligence platform.',
    identityLine
  );
}

export function buildPostShareDescription(post: PostShareSource): string {
  const excerpt = truncateText(post.postText, 100);
  return excerpt
    ? `Latest update from ${post.authorName} on NXT1: ${excerpt}`
    : `Latest update from ${post.authorName} on NXT1.`;
}

export function buildArticleShareTitle(article: ArticleShareSource): string {
  return `${article.title} | NXT1 Pulse`;
}

export function buildArticleShareText(article: ArticleShareSource): string {
  const creditLine = buildBulletLine([article.title, article.source]);
  return appendIdentityLine(
    'Catch this story on NXT1, the sports intelligence platform.',
    creditLine
  );
}

export function buildArticleShareDescription(article: ArticleShareSource): string {
  const articleContext = [
    normalizeText(article.source),
    formatShareSport(article.sport),
    normalizeText(article.state),
  ]
    .filter(Boolean)
    .join(' | ');

  return articleContext
    ? `${articleContext}. NXT1 Pulse briefing with sports intelligence and source context.`
    : 'NXT1 Pulse briefing with sports intelligence and source context.';
}
