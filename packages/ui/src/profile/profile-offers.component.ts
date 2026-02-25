/**
 * @fileoverview Profile Recruit Section Component
 * @module @nxt1/ui/profile
 * @version 3.0.0
 *
 * Displays the full recruiting section with three sub-sections:
 * 1. Commitment (top) — committed offer with prominent display
 * 2. Offers (middle) — scholarship, preferred walk-on
 * 3. Interests (bottom) — schools showing interest
 *
 * Now a thin wrapper that maps ProfileOffer[] → TimelineItem[]
 * and delegates rendering to the shared NxtTimelineComponent.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileOffer, OfferType, TimelineItem, TimelineCardLayout } from '@nxt1/core';
import {
  OFFER_TYPE_ICONS,
  OFFER_TYPE_LABELS,
  OFFER_TYPE_COLORS as _OFFER_TYPE_COLORS,
} from '@nxt1/core';
import { NxtTimelineComponent } from '../components/timeline';

@Component({
  selector: 'nxt1-profile-offers',
  standalone: true,
  imports: [CommonModule, NxtTimelineComponent],
  template: `
    <!-- Section-filtered timeline display -->
    @if (showSection('committed')) {
      <nxt1-timeline
        [items]="committedItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="committedEmpty"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
      />
    }

    @if (showSection('all-offers')) {
      <nxt1-timeline
        [items]="offerItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="offersEmpty"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
      />
    }

    @if (showSection('interests')) {
      <nxt1-timeline
        [items]="interestItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="interestsEmpty"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
      />
    }

    <!-- Full timeline (all sections merged, ordered by date) -->
    @if (showAllSections()) {
      <nxt1-timeline
        [items]="allItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="globalEmpty"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileOffersComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** All offers (unfiltered — component handles categorization) */
  readonly offers = input<readonly ProfileOffer[]>([]);

  /** Committed offers — pre-filtered from parent if available */
  readonly committedOffers = input<readonly ProfileOffer[]>([]);

  /** Active offers (non-interest, non-committed) — pre-filtered from parent */
  readonly activeOffers = input<readonly ProfileOffer[]>([]);

  /** Interest offers — pre-filtered from parent */
  readonly interestOffers = input<readonly ProfileOffer[]>([]);

  readonly isLoading = input(false);
  readonly isEmpty = input(false);
  readonly isOwnProfile = input(false);

  /**
   * Active section to display. When 'timeline' or empty, all sections are shown.
   * Otherwise only the matching section is rendered.
   * Values: 'timeline' | 'committed' | 'all-offers' | 'interests'
   */
  readonly activeSection = input<string>('timeline');

  /** Card layout: vertical (mobile) or horizontal (desktop). */
  readonly cardLayout = input<TimelineCardLayout>('vertical');

  // ============================================
  // OUTPUTS
  // ============================================

  readonly offerClick = output<ProfileOffer>();
  readonly addOfferClick = output<void>();
  readonly addCommitmentClick = output<void>();

  // ============================================
  // EMPTY STATE CONFIGS
  // ============================================

  protected readonly committedEmpty = {
    icon: 'checkmark-circle',
    title: 'No Commitment',
    description: 'No commitment yet.',
    ownProfileDescription: 'Your commitment will appear here.',
  };

  protected readonly offersEmpty = {
    icon: 'school',
    title: 'No Offers',
    description: 'No offers yet.',
    ownProfileDescription: 'Offers will appear here as a timeline.',
  };

  protected readonly interestsEmpty = {
    icon: 'heart',
    title: 'No Interests',
    description: 'No interest recorded.',
    ownProfileDescription: 'Schools showing interest will appear here.',
  };

  protected readonly globalEmpty = {
    icon: 'school',
    title: 'No Recruiting Activity',
    description: "This athlete hasn't added any recruiting activity yet.",
    ownProfileDescription:
      'Offers, commitments, and college interest will appear here as a timeline.',
  };

  // ============================================
  // COMPUTED — Map ProfileOffer[] → TimelineItem[]
  // ============================================

  /** Committed offers → TimelineItem[] with 'committed' variant. */
  protected readonly committedItems = computed(() =>
    this.committedOffers().map((o) => this.offerToTimelineItem(o, 'committed'))
  );

  /** Active offers → TimelineItem[] with 'primary' variant. */
  protected readonly offerItems = computed(() =>
    this.activeOffers().map((o) => this.offerToTimelineItem(o, 'primary'))
  );

  /** Interest offers → TimelineItem[] with 'secondary' variant. */
  protected readonly interestItems = computed(() =>
    this.interestOffers().map((o) => this.offerToTimelineItem(o, 'secondary'))
  );

  /** All sections merged, sorted newest-first — used when activeSection is 'timeline'. */
  protected readonly allItems = computed(() => {
    const all = [...this.committedItems(), ...this.offerItems(), ...this.interestItems()];
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  /** Whether to show the unified "all sections" timeline. */
  protected readonly showAllSections = computed(() => {
    const active = this.activeSection();
    return !active || active === 'timeline';
  });

  // ============================================
  // SECTION VISIBILITY
  // ============================================

  /**
   * Determines whether a given recruit section should be visible
   * based on the activeSection input. Returns false for the individual
   * sections when 'timeline' is active (since allItems handles that).
   */
  protected showSection(sectionId: string): boolean {
    const active = this.activeSection();
    if (!active || active === 'timeline') return false;
    return active === sectionId;
  }

  // ============================================
  // MAPPING HELPER
  // ============================================

  /**
   * Maps a ProfileOffer to a generic TimelineItem.
   */
  private offerToTimelineItem(
    offer: ProfileOffer,
    variant: 'committed' | 'primary' | 'secondary'
  ): TimelineItem<ProfileOffer> {
    const tags: { label: string; variant: 'committed' | 'primary' | 'secondary' }[] = [];

    if (offer.division) {
      tags.push({ label: offer.division, variant });
    }
    if (offer.conference) {
      tags.push({ label: offer.conference, variant });
    }

    return {
      id: offer.id,
      title: offer.collegeName,
      logoUrl: offer.collegeLogoUrl,
      graphicUrl: offer.graphicUrl,
      tags: tags.length > 0 ? tags : undefined,
      subtitle: offer.coachName,
      footerLeft: offer.sport,
      footerRight: this.formatDate(offer.offeredAt),
      date: offer.offeredAt,
      variant,
      badge: this.getOfferBadge(offer, variant),
      data: offer,
    };
  }

  /**
   * Produces the status badge for an offer based on its type/variant.
   */
  private getOfferBadge(
    offer: ProfileOffer,
    variant: 'committed' | 'primary' | 'secondary'
  ): { icon: string; label: string } {
    if (variant === 'committed') {
      return { icon: 'checkmark-circle', label: 'Committed' };
    }
    if (variant === 'secondary') {
      return { icon: 'heart', label: 'Interest' };
    }
    return {
      icon: OFFER_TYPE_ICONS[offer.type] ?? 'school',
      label: OFFER_TYPE_LABELS[offer.type] ?? 'Offer',
    };
  }

  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  /** Handle timeline item click → emit the original ProfileOffer. */
  protected onItemClick(item: TimelineItem): void {
    const offer = item.data as ProfileOffer | undefined;
    if (offer) {
      this.offerClick.emit(offer);
    }
  }
}
