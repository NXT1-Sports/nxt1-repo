/**
 * @module @nxt1/core/content-card
 * Barrel export for unified content card types & helpers.
 *
 * Provides: ContentCardItem (universal data shape), color/icon constants,
 * and mapper functions from Feed/Profile data → ContentCardItem.
 */

// Types
export {
  type ContentCardType,
  type ContentCardColorVariant,
  type ContentCardItem,
  CONTENT_CARD_TYPE_COLORS,
  CONTENT_CARD_TYPE_ICONS,
  OFFER_TYPE_DISPLAY_LABELS,
  VISIT_TYPE_DISPLAY_LABELS,
  CAMP_TYPE_DISPLAY_LABELS,
} from './content-card.types';

// Helpers / Mappers
export {
  feedOfferToContentCard,
  feedCommitmentToContentCard,
  feedVisitToContentCard,
  feedCampToContentCard,
} from './content-card.helpers';
