/**
 * @fileoverview Content Card Mapper Helpers
 * @module @nxt1/core/content-card
 * @version 1.0.0
 *
 * Pure functions that transform Feed and Profile data types into the
 * unified ContentCardItem. These are the ONLY place where mapping logic
 * lives — no component should repeat these transformations.
 *
 * ⭐ PURE TYPESCRIPT — Zero framework dependencies ⭐
 */

import type { ContentCardItem } from './content-card.types';
import {
  CONTENT_CARD_TYPE_COLORS,
  CONTENT_CARD_TYPE_ICONS,
  OFFER_TYPE_DISPLAY_LABELS,
  VISIT_TYPE_DISPLAY_LABELS,
  CAMP_TYPE_DISPLAY_LABELS,
} from './content-card.types';

// ============================================
// INLINE FEED DATA → ContentCardItem MAPPERS
// ============================================

/**
 * Minimal shape expected from FeedOfferData.
 * Avoids a hard import of feed.types so this stays zero-dep.
 */
interface OfferLike {
  readonly collegeName: string;
  readonly collegeLogoUrl?: string;
  readonly offerType: string;
  readonly division?: string;
  readonly conference?: string;
  readonly sport?: string;
}

/**
 * Maps feed offer data → ContentCardItem.
 */
export function feedOfferToContentCard(data: OfferLike): ContentCardItem {
  return {
    type: 'offer',
    colorVariant: CONTENT_CARD_TYPE_COLORS.offer,
    icon: CONTENT_CARD_TYPE_ICONS.offer,
    title: data.collegeName,
    typeLabel: OFFER_TYPE_DISPLAY_LABELS[data.offerType] ?? data.offerType,
    logoUrl: data.collegeLogoUrl,
    division: data.division,
    conference: data.conference,
    sport: data.sport,
  };
}

/**
 * Minimal shape expected from FeedCommitmentData.
 */
interface CommitmentLike {
  readonly collegeName: string;
  readonly collegeLogoUrl?: string;
  readonly sport?: string;
  readonly division?: string;
  readonly commitDate?: string;
  readonly isSigned?: boolean;
}

/**
 * Maps feed commitment data → ContentCardItem.
 */
export function feedCommitmentToContentCard(data: CommitmentLike): ContentCardItem {
  return {
    type: 'commitment',
    colorVariant: CONTENT_CARD_TYPE_COLORS.commitment,
    icon: CONTENT_CARD_TYPE_ICONS.commitment,
    title: data.collegeName,
    typeLabel: 'COMMITTED TO',
    logoUrl: data.collegeLogoUrl,
    result: data.isSigned ? '✍️ Signed' : undefined,
    division: data.division,
    sport: data.sport,
    date: data.commitDate,
  };
}

/**
 * Minimal shape expected from FeedVisitData.
 */
interface VisitLike {
  readonly collegeName: string;
  readonly collegeLogoUrl?: string;
  readonly visitType: string;
  readonly location?: string;
  readonly visitDate?: string;
  readonly sport?: string;
  readonly graphicUrl?: string;
}

/**
 * Maps feed visit data → ContentCardItem.
 */
export function feedVisitToContentCard(data: VisitLike): ContentCardItem {
  return {
    type: 'visit',
    colorVariant: CONTENT_CARD_TYPE_COLORS.visit,
    icon: CONTENT_CARD_TYPE_ICONS.visit,
    title: data.collegeName,
    typeLabel: VISIT_TYPE_DISPLAY_LABELS[data.visitType] ?? 'Campus Visit',
    logoUrl: data.collegeLogoUrl,
    graphicUrl: data.graphicUrl,
    location: data.location,
    sport: data.sport,
    date: data.visitDate,
  };
}

/**
 * Minimal shape expected from FeedCampData.
 */
interface CampLike {
  readonly campName: string;
  readonly campType: string;
  readonly location?: string;
  readonly result?: string;
  readonly logoUrl?: string;
  readonly graphicUrl?: string;
  readonly eventDate?: string;
}

/**
 * Maps feed camp data → ContentCardItem.
 */
export function feedCampToContentCard(data: CampLike): ContentCardItem {
  return {
    type: 'camp',
    colorVariant: CONTENT_CARD_TYPE_COLORS.camp,
    icon: CONTENT_CARD_TYPE_ICONS.camp,
    title: data.campName,
    typeLabel: CAMP_TYPE_DISPLAY_LABELS[data.campType] ?? 'Event',
    logoUrl: data.logoUrl,
    graphicUrl: data.graphicUrl,
    location: data.location,
    result: data.result,
    date: data.eventDate,
  };
}
