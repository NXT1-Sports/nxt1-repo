/**
 * @fileoverview Share copy helpers
 * @module @nxt1/core/seo/share-copy
 *
 * Centralized share text/title builders for web + mobile.
 * Pure TypeScript with zero platform dependencies.
 */

import type { ShareableProfile, ShareableTeam, ShareableVideo, ShareablePost } from './index';
import { formatSportDisplayName } from '../constants/sport.constants';

export type ProfileShareSource = Omit<ShareableProfile, 'type' | 'title' | 'description'> & {
  id: string;
};

export type TeamShareSource = Omit<ShareableTeam, 'type' | 'title' | 'description'> & {
  id: string;
};

export type VideoShareSource = Omit<ShareableVideo, 'type' | 'title' | 'description'> & {
  id: string;
};

export type PostShareSource = Omit<ShareablePost, 'type' | 'title' | 'description'> & {
  id: string;
  postText: string;
};

export function buildProfileShareTitle(profile: ProfileShareSource): string {
  return `Check out ${profile.athleteName} on NXT1`;
}

export function buildProfileShareText(profile: ProfileShareSource): string {
  const parts: string[] = [`Check out ${profile.athleteName}`];

  if (profile.position && profile.sport) {
    parts.push(`- ${profile.position} in ${formatSportDisplayName(profile.sport)}`);
  } else if (profile.position) {
    parts.push(`- ${profile.position}`);
  }

  if (profile.school) {
    parts.push(`at ${profile.school}`);
  }

  parts.push('on NXT1 Sports');

  return parts.join(' ');
}

export function buildProfileShareDescription(profile: ProfileShareSource): string {
  const parts: string[] = [];

  if (profile.position) parts.push(profile.position);
  if (profile.sport) parts.push(formatSportDisplayName(profile.sport));
  if (profile.school) parts.push(`at ${profile.school}`);
  if (profile.classYear) parts.push(`Class of ${profile.classYear}`);

  return parts.join(' | ');
}

export function buildTeamShareTitle(team: TeamShareSource): string {
  return team.teamName;
}

export function buildTeamShareText(team: TeamShareSource): string {
  return `Check out ${team.teamName} on NXT1 Sports`;
}

export function buildVideoShareTitle(video: VideoShareSource): string {
  return video.videoTitle;
}

export function buildVideoShareText(video: VideoShareSource): string {
  return `Watch ${video.videoTitle}${video.athleteName ? ` by ${video.athleteName}` : ''} on NXT1`;
}

export function buildPostShareTitle(post: PostShareSource): string {
  return `Post by ${post.authorName}`;
}

export function buildPostShareText(post: PostShareSource): string {
  return `${post.postText.slice(0, 100)}... - See more on NXT1`;
}
