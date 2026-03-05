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

import type { Location } from './user.model';

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
// BILLING INFO
// ============================================

export interface OrganizationBilling {
  /** Stripe customer ID */
  customerId?: string;
  /** Plan/subscription ID */
  subscriptionId?: string;
  /** Current plan tier */
  planTier?: string;
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

export interface OrganizationAdmin {
  /** User ID */
  userId: string;
  /** Admin role: owner, admin, billing */
  role: 'owner' | 'admin' | 'billing';
  /** When added as admin */
  addedAt: Date | string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Email */
  email: string;
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

  /** Organization description/bio */
  description?: string;

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

  /** Total traffic/views */
  totalViews?: number;

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
  ownerId: string;
  location?: Location;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  mascot?: string;
  description?: string;
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
  description?: string;
  settings?: Organization['settings'];
}

export interface AddOrganizationAdminInput {
  organizationId: string;
  userId: string;
  role: OrganizationAdmin['role'];
  addedBy: string;
}
