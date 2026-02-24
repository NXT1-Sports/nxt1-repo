/**
 * @fileoverview Manage Team - Staff Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Professional staff management section with role-based organization.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  peopleOutline,
  addOutline,
  personOutline,
  mailOutline,
  callOutline,
  ellipsisVertical,
  shieldCheckmarkOutline,
  fitnessOutline,
  medkitOutline,
  clipboardOutline,
  briefcaseOutline,
  schoolOutline,
} from 'ionicons/icons';
import type { StaffMember, StaffRole, StaffActionEvent } from '@nxt1/core';
import { STAFF_ROLE_CONFIG } from '@nxt1/core';

@Component({
  selector: 'nxt1-manage-team-staff-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="staff-section">
      <!-- Header -->
      <div class="staff-header">
        <div class="staff-info">
          <ion-icon name="people-outline"></ion-icon>
          <span>{{ activeCount() }} Staff Members</span>
        </div>

        <button type="button" class="add-btn" (click)="onAddStaff()">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon name="add-outline"></ion-icon>
          <span>Add Staff</span>
        </button>
      </div>

      <!-- Staff by Role -->
      <div class="staff-groups">
        @for (role of roleOrder; track role) {
          @if (staffByRole().get(role)?.length) {
            <div class="role-group">
              <div class="role-header">
                <ion-icon [name]="getRoleConfig(role).icon"></ion-icon>
                <span class="role-label">{{ getRoleConfig(role).label }}</span>
                <span class="role-count">{{ staffByRole().get(role)?.length ?? 0 }}</span>
              </div>

              <div class="staff-list">
                @for (member of staffByRole().get(role); track member.id) {
                  <div class="staff-card" [class.staff-card--primary]="isPrimaryRole(role)">
                    <ion-ripple-effect></ion-ripple-effect>

                    <!-- Avatar -->
                    <div class="staff-avatar">
                      @if (member.photoUrl) {
                        <img
                          [src]="member.photoUrl"
                          [alt]="member.displayName ?? member.firstName + ' ' + member.lastName"
                        />
                      } @else {
                        <ion-icon name="person-outline"></ion-icon>
                      }
                    </div>

                    <!-- Info -->
                    <div class="staff-info-content">
                      <div class="staff-main">
                        <h4 class="staff-name">
                          {{ member.displayName ?? member.firstName + ' ' + member.lastName }}
                        </h4>
                        @if (member.title) {
                          <span class="staff-title">{{ member.title }}</span>
                        }
                      </div>

                      <!-- Role Badge -->
                      <div class="role-badge" [style.background]="'var(--nxt1-color-primary)'">
                        <ion-icon [name]="getRoleConfig(role).icon"></ion-icon>
                        <span>{{ getRoleConfig(role).label }}</span>
                      </div>

                      <!-- Contact Actions -->
                      <div class="staff-contacts">
                        @if (member.email) {
                          <a [href]="'mailto:' + member.email" class="contact-link">
                            <ion-icon name="mail-outline"></ion-icon>
                            <span>{{ member.email }}</span>
                          </a>
                        }
                        @if (member.phone) {
                          <a [href]="'tel:' + member.phone" class="contact-link">
                            <ion-icon name="call-outline"></ion-icon>
                            <span>{{ member.phone }}</span>
                          </a>
                        }
                      </div>
                    </div>

                    <!-- Menu -->
                    <button type="button" class="menu-btn" (click)="onStaffMenu(member, $event)">
                      <ion-ripple-effect></ion-ripple-effect>
                      <ion-icon name="ellipsis-vertical"></ion-icon>
                    </button>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>

      <!-- Empty State -->
      @if (staff().length === 0) {
        <div class="empty-state">
          <ion-icon name="people-outline"></ion-icon>
          <h4>No Staff Members</h4>
          <p>Add coaching staff and team personnel</p>
          <button type="button" class="add-staff-btn" (click)="onAddStaff()">
            <ion-ripple-effect></ion-ripple-effect>
            <ion-icon name="add-outline"></ion-icon>
            <span>Add Staff Member</span>
          </button>
        </div>
      }

      <!-- Invite Staff CTA -->
      @if (staff().length > 0) {
        <div class="invite-cta">
          <div class="cta-content">
            <ion-icon name="people-outline"></ion-icon>
            <div class="cta-text">
              <h4>Invite Staff Members</h4>
              <p>Staff can help manage the team profile</p>
            </div>
          </div>
          <button type="button" class="invite-btn" (click)="onInviteStaff()">
            <ion-ripple-effect></ion-ripple-effect>
            Invite
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       STAFF SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .staff-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         HEADER
         ============================================ */

      .staff-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .staff-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-secondary);
        }
      }

      .add-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 16px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         ROLE GROUPS
         ============================================ */

      .staff-groups {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      .role-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .role-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-primary);
        }

        .role-label {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
        }

        .role-count {
          background: var(--nxt1-color-surface-200);
          padding: 2px 8px;
          border-radius: var(--nxt1-radius-full);
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
        }
      }

      /* ============================================
         STAFF LIST
         ============================================ */

      .staff-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .staff-card {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }
      }

      .staff-card--primary {
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-100) 0%,
          var(--nxt1-color-surface-200) 100%
        );
        border-color: var(--nxt1-color-primary);
        border-width: 2px;
      }

      .staff-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-full);
        background: var(--nxt1-color-surface-200);
        flex-shrink: 0;
        overflow: hidden;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        ion-icon {
          font-size: 24px;
          color: var(--nxt1-color-text-tertiary);
        }
      }

      .staff-info-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .staff-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .staff-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .staff-title {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .role-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-onPrimary);
        width: fit-content;

        ion-icon {
          font-size: 12px;
        }

        span {
          font-size: var(--nxt1-fontSize-xs);
          font-weight: 600;
        }
      }

      .staff-contacts {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .contact-link {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        text-decoration: none;
        transition: color var(--nxt1-transition-fast);

        ion-icon {
          font-size: 14px;
        }

        span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        &:hover {
          color: var(--nxt1-color-primary);
        }
      }

      .menu-btn {
        position: absolute;
        top: var(--nxt1-spacing-3);
        right: var(--nxt1-spacing-3);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
          color: var(--nxt1-color-text-primary);
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        text-align: center;

        > ion-icon {
          font-size: 48px;
          color: var(--nxt1-color-text-tertiary);
        }

        h4 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-lg);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
          margin: 0;
        }

        p {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-tertiary);
          margin: 0;
        }
      }

      .add-staff-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* ============================================
         INVITE CTA
         ============================================ */

      .invite-cta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px dashed var(--nxt1-color-border-default);
      }

      .cta-content {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);

        > ion-icon {
          font-size: 32px;
          color: var(--nxt1-color-secondary);
        }
      }

      .cta-text {
        h4 {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-sm);
          font-weight: 600;
          color: var(--nxt1-color-text-primary);
          margin: 0 0 2px;
        }

        p {
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-secondary);
          margin: 0;
        }
      }

      .invite-btn {
        position: relative;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamStaffSectionComponent {
  constructor() {
    addIcons({
      peopleOutline,
      addOutline,
      personOutline,
      mailOutline,
      callOutline,
      ellipsisVertical,
      shieldCheckmarkOutline,
      fitnessOutline,
      medkitOutline,
      clipboardOutline,
      briefcaseOutline,
      schoolOutline,
    });
  }

  /** Staff list */
  readonly staff = input<readonly StaffMember[]>([]);

  /** Action event */
  readonly action = output<StaffActionEvent>();

  /** Role order for display */
  readonly roleOrder: readonly StaffRole[] = [
    'head-coach',
    'assistant-coach',
    'coordinator',
    'position-coach',
    'trainer',
    'manager',
    'statistician',
    'volunteer',
    'administrator',
    'other',
  ] as const;

  /** Active staff count */
  readonly activeCount = computed(() => this.staff().length);

  /** Staff grouped by role */
  readonly staffByRole = computed(() => {
    const grouped = new Map<StaffRole, StaffMember[]>();
    for (const member of this.staff()) {
      if (!grouped.has(member.role)) grouped.set(member.role, []);
      grouped.get(member.role)!.push(member);
    }
    return grouped;
  });

  getRoleConfig(role: StaffRole): { label: string; icon: string; order: number } {
    return STAFF_ROLE_CONFIG[role];
  }

  isPrimaryRole(role: StaffRole): boolean {
    return role === 'head-coach';
  }

  onAddStaff(): void {
    this.action.emit({ action: 'add' });
  }

  onStaffMenu(member: StaffMember, event: Event): void {
    event.stopPropagation();
    this.action.emit({ action: 'edit', staffId: member.id, staff: member });
  }

  onInviteStaff(): void {
    this.action.emit({ action: 'invite' });
  }
}
