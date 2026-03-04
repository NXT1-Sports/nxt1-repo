/**
 * @fileoverview Team Recruiting Web Component
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Recruiting tab content for team profile.
 * Displays recruiting activity — commitments, offers, visits —
 * using the exact same NxtTimelineComponent as the player profile
 * recruit tab (unified design), with team-specific data mapping:
 *   - Title → Athlete name (instead of college name)
 *   - Logo → Athlete profile image (instead of college logo)
 *   - Tags → Position + class year (instead of division/conference)
 *   - Subtitle → High school, State (instead of coach name)
 *   - Footer → Sport + formatted date
 *   - Badge → Team recruiting category icon/label
 *
 * ⭐ WEB ONLY — SSR-safe ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TeamProfileRecruitingActivity, TimelineItem, TimelineCardLayout } from '@nxt1/core';
import { TEAM_RECRUITING_CATEGORY_ICONS, TEAM_RECRUITING_CATEGORY_LABELS } from '@nxt1/core';
import { TeamProfileService } from '../team-profile.service';
import { NxtTimelineComponent } from '../../components/timeline';

@Component({
  selector: 'nxt1-team-recruiting-web',
  standalone: true,
  imports: [CommonModule, NxtTimelineComponent],
  template: `
    <!-- Section-filtered timeline display -->
    @if (showSection('commitments')) {
      <nxt1-timeline
        [items]="committedItems()"
        [isLoading]="isLoading()"
        [emptyState]="committedEmpty"
        [cardLayout]="cardLayout()"
        [fallbackIcon]="'person'"
        (itemClick)="onItemClick($event)"
      />
    }

    @if (showSection('offers')) {
      <nxt1-timeline
        [items]="offerItems()"
        [isLoading]="isLoading()"
        [emptyState]="offersEmpty"
        [cardLayout]="cardLayout()"
        [fallbackIcon]="'person'"
        (itemClick)="onItemClick($event)"
      />
    }

    <!-- Full timeline (all sections merged, ordered by date) -->
    @if (showAllSections()) {
      <nxt1-timeline
        [items]="allItems()"
        [isLoading]="isLoading()"
        [emptyState]="globalEmpty"
        [cardLayout]="cardLayout()"
        [fallbackIcon]="'person'"
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
export class TeamRecruitingWebComponent {
  protected readonly teamProfile = inject(TeamProfileService);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side tab section — 'timeline', 'commitments', 'offers' */
  readonly activeSection = input<string>('timeline');

  /** Card layout: vertical (mobile) or horizontal (desktop). */
  readonly cardLayout = input<TimelineCardLayout>('horizontal');

  /** Whether data is loading. */
  readonly isLoading = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly activityClick = output<TeamProfileRecruitingActivity>();

  // ============================================
  // EMPTY STATE CONFIGS (matches profile pattern)
  // ============================================

  protected readonly committedEmpty = {
    icon: 'checkmark-circle',
    title: 'No Commitments',
    description: 'No athletes have committed yet.',
  };

  protected readonly offersEmpty = {
    icon: 'school',
    title: 'No Offers Sent',
    description: 'Offers sent to recruits will appear here.',
  };

  protected readonly globalEmpty = {
    icon: 'trophy',
    title: 'No Recruiting Activity',
    description: 'Offers, commitments, and recruiting updates will appear here.',
  };

  // ============================================
  // COMPUTED — Filter by category
  // ============================================

  /** Commitment-received activity. */
  private readonly commitmentActivity = computed(() =>
    this.teamProfile.recruitingActivity().filter((a) => a.category === 'commitment-received')
  );

  /** Offer-sent activity. */
  private readonly offerActivity = computed(() =>
    this.teamProfile.recruitingActivity().filter((a) => a.category === 'offer-sent')
  );

  /** Visit/camp activity. */
  private readonly visitActivity = computed(() =>
    this.teamProfile
      .recruitingActivity()
      .filter((a) => a.category === 'visit-hosted' || a.category === 'camp-hosted')
  );

  // ============================================
  // COMPUTED — Map TeamProfileRecruitingActivity[] → TimelineItem[]
  // ============================================

  /** Committed athletes → TimelineItem[] with 'committed' variant. */
  protected readonly committedItems = computed(() =>
    this.commitmentActivity().map((a) => this.activityToTimelineItem(a, 'committed'))
  );

  /** Offered athletes → TimelineItem[] with 'primary' variant. */
  protected readonly offerItems = computed(() =>
    this.offerActivity().map((a) => this.activityToTimelineItem(a, 'primary'))
  );

  /** Visits/camps → TimelineItem[] with 'secondary' variant. */
  protected readonly visitItems = computed(() =>
    this.visitActivity().map((a) => this.activityToTimelineItem(a, 'secondary'))
  );

  /** All sections merged, sorted newest-first — used when side tab is 'timeline'. */
  protected readonly allItems = computed(() => {
    const all = [...this.committedItems(), ...this.offerItems(), ...this.visitItems()];

    // Include contact activity in "all" view (secondary variant)
    const contactItems = this.teamProfile
      .recruitingActivity()
      .filter((a) => a.category === 'contact')
      .map((a) => this.activityToTimelineItem(a, 'secondary'));

    return [...all, ...contactItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
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
   * Determines whether a given section should be visible
   * based on the activeSection input. Returns false for the individual
   * sections when 'timeline' is active (since allItems handles that).
   */
  protected showSection(sectionId: string): boolean {
    const active = this.activeSection();
    if (!active || active === 'timeline') return false;
    return active === sectionId;
  }

  // ============================================
  // MAPPING HELPER — Team activity → TimelineItem
  // ============================================

  /**
   * Maps a TeamProfileRecruitingActivity to a generic TimelineItem.
   * Uses athlete data instead of college data (team-perspective).
   *
   * - Title → Athlete name
   * - Logo → Athlete profile image
   * - Tags → Position badge + class year badge
   * - Subtitle → High school, State
   * - Footer → Sport (left) + formatted date (right)
   * - Badge → Category icon + label (from TEAM_RECRUITING_CATEGORY_*)
   */
  private activityToTimelineItem(
    activity: TeamProfileRecruitingActivity,
    variant: 'committed' | 'primary' | 'secondary'
  ): TimelineItem<TeamProfileRecruitingActivity> {
    const tags: { label: string; variant: 'committed' | 'primary' | 'secondary' }[] = [];

    if (activity.position) {
      tags.push({ label: activity.position, variant });
    }
    if (activity.classYear) {
      tags.push({ label: `Class of ${activity.classYear}`, variant });
    }

    // Build subtitle from high school + state
    const subtitleParts: string[] = [];
    if (activity.highSchool) subtitleParts.push(activity.highSchool);
    if (activity.state) subtitleParts.push(activity.state);
    const subtitle = subtitleParts.join(', ') || undefined;

    return {
      id: activity.id,
      title: activity.athleteName,
      logoUrl: activity.athleteProfileImg,
      tags: tags.length > 0 ? tags : undefined,
      subtitle,
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
  private getActivityBadge(activity: TeamProfileRecruitingActivity): {
    icon: string;
    label: string;
  } {
    return {
      icon: TEAM_RECRUITING_CATEGORY_ICONS[activity.category] ?? 'trophy',
      label: TEAM_RECRUITING_CATEGORY_LABELS[activity.category] ?? 'Recruit',
    };
  }

  /**
   * Formats ISO date to readable short format.
   */
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
    const activity = item.data as TeamProfileRecruitingActivity | undefined;
    if (activity) {
      this.activityClick.emit(activity);
    }
  }
}
