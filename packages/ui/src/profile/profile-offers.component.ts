/**
 * @fileoverview Profile Recruit Section Component
 * @module @nxt1/ui/profile
 * @version 4.0.0
 *
 * Displays the full recruiting section with category-based sub-sections:
 * 1. Commitment (top) — committed activity with prominent display
 * 2. Offers (middle) — scholarship, preferred walk-on
 * 3. Interests (bottom) — schools showing interest
 *
 * A thin wrapper that maps ProfileRecruitingActivity[] → TimelineItem[]
 * and delegates rendering to the shared NxtTimelineComponent.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileRecruitingActivity, TimelineItem, TimelineCardLayout } from '@nxt1/core';
import { RECRUITING_CATEGORY_ICONS, RECRUITING_CATEGORY_LABELS } from '@nxt1/core';
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
        [emptyCta]="isOwnProfile() ? 'Add Commitment' : null"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
        (emptyCtaClick)="addCommitmentClick.emit()"
      />
    }

    @if (showSection('all-offers')) {
      <nxt1-timeline
        [items]="offerItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="offersEmpty"
        [emptyCta]="isOwnProfile() ? 'Add Offer' : null"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
        (emptyCtaClick)="addOfferClick.emit()"
      />
    }

    @if (showSection('interests')) {
      <nxt1-timeline
        [items]="interestItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="interestsEmpty"
        [emptyCta]="isOwnProfile() ? 'Add Interest' : null"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
        (emptyCtaClick)="addOfferClick.emit()"
      />
    }

    <!-- Full timeline (all sections merged, ordered by date) -->
    @if (showAllSections()) {
      <nxt1-timeline
        [items]="allItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="globalEmpty"
        [emptyCta]="isOwnProfile() ? 'Add Recruiting Activity' : null"
        [cardLayout]="cardLayout()"
        (itemClick)="onItemClick($event)"
        (emptyCtaClick)="addOfferClick.emit()"
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

  /** All recruiting activity (unfiltered — component handles categorization) */
  readonly offers = input<readonly ProfileRecruitingActivity[]>([]);

  /** Committed activity — pre-filtered from parent if available */
  readonly committedOffers = input<readonly ProfileRecruitingActivity[]>([]);

  /** Active offers (non-interest, non-committed) — pre-filtered from parent */
  readonly activeOffers = input<readonly ProfileRecruitingActivity[]>([]);

  /** Interest activity — pre-filtered from parent */
  readonly interestOffers = input<readonly ProfileRecruitingActivity[]>([]);

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

  readonly offerClick = output<ProfileRecruitingActivity>();
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
  // COMPUTED — Map ProfileRecruitingActivity[] → TimelineItem[]
  // ============================================

  /** Committed activity → TimelineItem[] with 'committed' variant. */
  protected readonly committedItems = computed(() =>
    this.committedOffers().map((a) => this.activityToTimelineItem(a, 'committed'))
  );

  /** Active offers → TimelineItem[] with 'primary' variant. */
  protected readonly offerItems = computed(() =>
    this.activeOffers().map((a) => this.activityToTimelineItem(a, 'primary'))
  );

  /** Interest activity → TimelineItem[] with 'secondary' variant. */
  protected readonly interestItems = computed(() =>
    this.interestOffers().map((a) => this.activityToTimelineItem(a, 'secondary'))
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
   * Maps a ProfileRecruitingActivity to a generic TimelineItem.
   */
  private activityToTimelineItem(
    activity: ProfileRecruitingActivity,
    variant: 'committed' | 'primary' | 'secondary'
  ): TimelineItem<ProfileRecruitingActivity> {
    const tags: { label: string; variant: 'committed' | 'primary' | 'secondary' }[] = [];

    if (activity.division) {
      tags.push({ label: activity.division, variant });
    }
    if (activity.conference) {
      tags.push({ label: activity.conference, variant });
    }

    return {
      id: activity.id,
      title: activity.collegeName,
      logoUrl: activity.collegeLogoUrl,
      graphicUrl: activity.graphicUrl,
      tags: tags.length > 0 ? tags : undefined,
      subtitle: activity.coachName,
      footerLeft: activity.sport,
      footerRight: this.formatDate(activity.date),
      date: activity.date,
      variant,
      badge: this.getActivityBadge(activity),
      badgePosition: 'right',
      data: activity,
    };
  }

  /**
   * Produces the status badge for an activity based on its category.
   */
  private getActivityBadge(activity: ProfileRecruitingActivity): { icon: string; label: string } {
    return {
      icon: RECRUITING_CATEGORY_ICONS[activity.category] ?? 'school',
      label: RECRUITING_CATEGORY_LABELS[activity.category] ?? 'Offer',
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

  /** Handle timeline item click → emit the original activity. */
  protected onItemClick(item: TimelineItem): void {
    const activity = item.data as ProfileRecruitingActivity | undefined;
    if (activity) {
      this.offerClick.emit(activity);
    }
  }
}
