/**
 * @fileoverview Profile Events Section Component
 * @module @nxt1/ui/profile
 * @version 2.0.0
 *
 * Displays the events section with four sub-sections:
 * 1. Timeline (all events merged, sorted by date)
 * 2. Visits (college visits)
 * 3. Camps (camps & combines)
 * 4. Events (showcases, combines, other — excludes games & practice)
 *
 * Thin wrapper that maps ProfileEvent[] → TimelineItem[]
 * and delegates rendering to the shared NxtTimelineComponent.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileEvent, TimelineItem, TimelineVariant, TimelineCardLayout } from '@nxt1/core';
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '@nxt1/core';
import { NxtTimelineComponent } from '../components/timeline';

@Component({
  selector: 'nxt1-profile-events',
  standalone: true,
  imports: [CommonModule, NxtTimelineComponent],
  template: `
    <!-- Visits section -->
    @if (showSection('visits')) {
      <nxt1-timeline
        [items]="visitItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="visitsEmpty"
        [cardLayout]="cardLayout()"
        fallbackIcon="school"
        (itemClick)="onItemClick($event)"
      />
    }

    <!-- Camps section -->
    @if (showSection('camps')) {
      <nxt1-timeline
        [items]="campItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="campsEmpty"
        [cardLayout]="cardLayout()"
        fallbackIcon="flag"
        (itemClick)="onItemClick($event)"
      />
    }

    <!-- General events section (showcases, combines, other) -->
    @if (showSection('events')) {
      <nxt1-timeline
        [items]="generalItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="generalEmpty"
        [cardLayout]="cardLayout()"
        fallbackIcon="calendar"
        (itemClick)="onItemClick($event)"
      />
    }

    <!-- Full timeline (all events merged, ordered by date) -->
    @if (showAllSections()) {
      <nxt1-timeline
        [items]="allItems()"
        [isLoading]="isLoading()"
        [isOwnProfile]="isOwnProfile()"
        [emptyState]="globalEmpty"
        [cardLayout]="cardLayout()"
        fallbackIcon="calendar"
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
export class ProfileEventsComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** All non-game events (visits, camps, combines, showcases, other) */
  readonly events = input<readonly ProfileEvent[]>([]);

  /** Visit events — pre-filtered from parent */
  readonly visitEvents = input<readonly ProfileEvent[]>([]);

  /** Camp/combine events — pre-filtered from parent */
  readonly campEvents = input<readonly ProfileEvent[]>([]);

  /** General events (showcases, combines, other — no games/practice) */
  readonly generalEvents = input<readonly ProfileEvent[]>([]);

  readonly isLoading = input(false);
  readonly isOwnProfile = input(false);

  /**
   * Active section to display. When 'timeline' or empty, all events are shown.
   * Otherwise only the matching section is rendered.
   * Values: 'timeline' | 'visits' | 'camps' | 'events'
   */
  readonly activeSection = input<string>('timeline');

  /** Card layout: vertical (mobile) or horizontal (desktop). */
  readonly cardLayout = input<TimelineCardLayout>('vertical');

  // ============================================
  // OUTPUTS
  // ============================================

  readonly eventClick = output<ProfileEvent>();
  readonly addEventClick = output<void>();

  // ============================================
  // EMPTY STATE CONFIGS
  // ============================================

  protected readonly visitsEmpty = {
    icon: 'school',
    title: 'No Visits Scheduled',
    description: 'No campus visits scheduled yet.',
    ownProfileDescription: 'Add campus visits to track your recruiting journey.',
  };

  protected readonly campsEmpty = {
    icon: 'flag',
    title: 'No Camps Scheduled',
    description: 'No camps or combines scheduled yet.',
    ownProfileDescription: 'Add camps and combines to showcase your skills.',
  };

  protected readonly generalEmpty = {
    icon: 'calendar',
    title: 'No Events Scheduled',
    description: 'No showcases or other events scheduled.',
    ownProfileDescription: 'Add showcases and other events to your calendar.',
  };

  protected readonly globalEmpty = {
    icon: 'calendar',
    title: 'No Events Scheduled',
    description: "This athlete hasn't added any events yet.",
    ownProfileDescription: 'Add upcoming camps, visits, and showcases to your calendar.',
  };

  // ============================================
  // COMPUTED — Map ProfileEvent[] → TimelineItem[]
  // ============================================

  /** Visit events → TimelineItem[] */
  protected readonly visitItems = computed(() =>
    this.visitEvents().map((e) => this.eventToTimelineItem(e))
  );

  /** Camp/combine events → TimelineItem[] */
  protected readonly campItems = computed(() =>
    this.campEvents().map((e) => this.eventToTimelineItem(e))
  );

  /** General events → TimelineItem[] */
  protected readonly generalItems = computed(() =>
    this.generalEvents().map((e) => this.eventToTimelineItem(e))
  );

  /** All events merged, sorted soonest-first — used when activeSection is 'timeline'. */
  protected readonly allItems = computed(() => {
    const all = this.events().map((e) => this.eventToTimelineItem(e));
    return all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
   * Determines whether a given event section should be visible
   * based on the activeSection input. Returns false for individual
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
   * Maps a ProfileEvent to a generic TimelineItem.
   *
   * Variant logic:
   * - Past events → 'secondary' (muted, past)
   * - Upcoming events → 'primary' (brand accent, active)
   */
  private eventToTimelineItem(event: ProfileEvent): TimelineItem<ProfileEvent> {
    const isPast = this.isPastEvent(event);
    const variant: TimelineVariant = isPast ? 'secondary' : 'primary';

    const tags: { label: string; variant: TimelineVariant }[] = [
      {
        label: EVENT_TYPE_LABELS[event.type] ?? 'Event',
        variant,
      },
    ];

    // Build subtitle: location
    const subtitle = event.location ?? undefined;

    // Footer left: description (truncated)
    let footerLeft: string | undefined;
    if (event.description) {
      footerLeft =
        event.description.length > 50
          ? event.description.substring(0, 47) + '...'
          : event.description;
    }

    return {
      id: event.id,
      title: event.name,
      logoUrl: event.logoUrl,
      graphicUrl: event.graphicUrl,
      tags,
      subtitle,
      footerLeft,
      footerRight: this.formatDate(event.startDate),
      date: event.startDate,
      variant,
      badge: this.getEventBadge(event, variant),
      data: event,
    };
  }

  /**
   * Produces the status badge for an event based on its type.
   */
  private getEventBadge(
    event: ProfileEvent,
    variant: TimelineVariant
  ): { icon: string; label: string } {
    if (variant === 'secondary') {
      return { icon: 'checkmark-circle', label: 'Completed' };
    }
    return {
      icon: EVENT_TYPE_ICONS[event.type] ?? 'calendar',
      label: EVENT_TYPE_LABELS[event.type] ?? 'Event',
    };
  }

  /**
   * Determines if an event has already passed.
   */
  private isPastEvent(event: ProfileEvent): boolean {
    try {
      return new Date(event.startDate).getTime() < Date.now();
    } catch {
      return false;
    }
  }

  /**
   * Formats an ISO date string for display.
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

  /** Handle timeline item click → emit the original ProfileEvent. */
  protected onItemClick(item: TimelineItem): void {
    const event = item.data as ProfileEvent | undefined;
    if (event) {
      this.eventClick.emit(event);
    }
  }
}
