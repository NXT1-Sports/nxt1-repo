/**
 * @fileoverview Organization Model
 * @module @nxt1/core/models
 *
 * Organization (Program) type definitions.
 * Represents the legal/paying entity (e.g., "St. Mary's High School", "Elite 11 Club").
 *
 * Architecture:
 * - Organization (1) -> Teams (many)
 * - Organization has admins/staff
 * - Contains branding, billing info
 *
 * @author NXT1 Engineering
 * @version 3.0.0
 */

import type { Location } from '../user';

// ============================================
// ORGANIZATION STATUS
// ============================================

export enum OrganizationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
}

// ============================================
// ORGANIZATION SOURCE (Ghost vs Verified)
// ============================================

/** How the organization was created */
export type OrganizationSource = 'admin' | 'user_generated' | 'import';

// ============================================
// BILLING INFO
// ============================================

export interface OrganizationBilling {
  /** Stripe customer ID */
  customerId?: string;
  /** Plan/subscription ID */
  subscriptionId?: string;
  /** Billing email */
  email?: string;
  /** Next billing date */
  nextBillingDate?: Date | string;
  /** Payment method on file */
  hasPaymentMethod?: boolean;
}

// ============================================
// ORGANIZATION ADMIN/STAFF
// ============================================

/** Platform role for organization admins — matches UserRole from constants */
export type OrgAdminRole = 'athlete' | 'coach' | 'director';

export interface OrganizationAdmin {
  /** User ID */
  userId: string;
  /** Platform role of this admin (director, coach, etc.) */
  role: OrgAdminRole;
  /** When added as admin */
  addedAt: Date | string;
  /** First name (populated when available) */
  firstName?: string;
  /** Last name (populated when available) */
  lastName?: string;
  /** Email (populated when available) */
  email?: string;
  /** Profile image */
  profileImg?: string;
}

// ============================================
// ORGANIZATION (Main Interface)
// ============================================

export interface Organization {
  /** Firestore document ID */
  id?: string;

  // ============================================
  // BASIC INFO
  // ============================================

  /** Organization name (e.g., "St. Mary's High School") */
  name: string;

  /** Organization type */
  type: 'high-school' | 'middle-school' | 'club' | 'college' | 'juco' | 'organization';

  /** Status */
  status: OrganizationStatus;

  /** Location */
  location?: Location;

  // ============================================
  // BRANDING
  // ============================================

  /** Logo URL */
  logoUrl?: string;

  /** Primary brand color (hex) */
  primaryColor?: string;

  /** Secondary brand color (hex) */
  secondaryColor?: string;

  /** Mascot name */
  mascot?: string;

  // ============================================
  // ADMINS & STAFF
  // ============================================

  /** List of admins/owners for this organization */
  admins: OrganizationAdmin[];

  /** Primary owner user ID (creator) */
  ownerId: string;

  // ============================================
  // BILLING & SUBSCRIPTION
  // ============================================

  /** Billing information */
  billing?: OrganizationBilling;

  /** Free trial info */
  trial?: {
    isActive: boolean;
    startDate: Date | string;
    endDate: Date | string;
  };

  // ============================================
  // SETTINGS
  // ============================================

  /** Organization-level settings */
  settings?: {
    /** Allow public viewing of team pages */
    publicTeamPages?: boolean;
    /** Require approval for athlete join requests */
    requireAthleteApproval?: boolean;
    /** Custom domain for organization */
    customDomain?: string;
  };

  // ============================================
  // METADATA
  // ============================================

  /** Total number of teams under this org */
  teamCount?: number;

  // ============================================
  // GHOST / CLAIM STATUS
  // ============================================

  /**
   * Whether this organization has been verified/claimed by a real admin.
   * Ghost entries created during onboarding start as `false`.
   */
  isClaimed: boolean;

  /** How the organization was created */
  source: OrganizationSource;

  // ============================================
  // TIMESTAMPS
  // ============================================

  createdAt: Date | string;
  updatedAt?: Date | string;

  /** Created by user ID */
  createdBy: string;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CreateOrganizationInput {
  name: string;
  type: Organization['type'];
  /** V2: The userId who created this org (for audit trail). Not an ownership concept. */
  createdBy?: string;
  /** Platform role of the creator (e.g. 'director', 'coach'). Written to the admins array. */
  creatorRole?: OrgAdminRole;
  location?: Location;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  mascot?: string;
  /** Defaults to `true` if not provided */
  isClaimed?: boolean;
  /** Defaults to `'admin'` if not provided */
  source?: OrganizationSource;
  /** When true, don't add the createdBy as an admin entry (e.g. athlete-created ghost orgs) */
  skipAdmins?: boolean;
}

export interface UpdateOrganizationInput {
  name?: string;
  type?: Organization['type'];
  status?: OrganizationStatus;
  location?: Location;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  mascot?: string;
  settings?: Organization['settings'];
}

export interface AddOrganizationAdminInput {
  organizationId: string;
  userId: string;
  role: OrganizationAdmin['role'];
  addedBy: string;
}
