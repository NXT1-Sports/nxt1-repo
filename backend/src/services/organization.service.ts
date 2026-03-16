/**
 * @fileoverview Organization Service
 * @module @nxt1/backend/services/organization
 *
 * Manages Organizations collection in Firebase Firestore
 * - CRUD operations for Organizations
 * - Admin management
 * - Redis caching
 * - Supports production/staging Firebase instances
 *
 * @version 3.0.0
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import {
  Organization,
  OrganizationStatus,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type AddOrganizationAdminInput,
  type OrganizationAdmin,
  type OrganizationSource,
} from '@nxt1/core/models';
import { getCacheService, CACHE_TTL } from './cache.service.js';
import { notFoundError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';

// Helper to get cache
const getCache = () => getCacheService();

// ============================================
// CACHE KEYS
// ============================================

const CACHE_KEYS = {
  ORG_BY_ID: (orgId: string) => `org:id:${orgId}`,
  ORG_BY_OWNER: (userId: string) => `org:owner:${userId}`,
  USER_ORGS: (userId: string) => `user:${userId}:orgs`,
} as const;

const ORG_CACHE_TTL = CACHE_TTL.PROFILES; // 300s

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert Firestore document to Organization
 */
function docToOrganization(doc: FirebaseFirestore.DocumentSnapshot): Organization {
  if (!doc.exists) {
    throw notFoundError('organization');
  }

  const data = doc.data();
  if (!data) {
    throw notFoundError('organization');
  }

  return {
    id: doc.id,
    name: data['name'] ?? '',
    type: data['type'] ?? 'organization',
    status: data['status'] ?? OrganizationStatus.ACTIVE,
    location: data['location'],
    logoUrl: data['logoUrl'],
    primaryColor: data['primaryColor'],
    secondaryColor: data['secondaryColor'],
    mascot: data['mascot'],
    description: data['description'],
    admins: data['admins'] ?? [],
    ownerId: data['ownerId'] ?? '',
    billing: data['billing'],
    trial: data['trial'],
    settings: data['settings'],
    teamCount: data['teamCount'] ?? 0,
    isClaimed: data['isClaimed'] ?? true,
    source: (data['source'] as OrganizationSource) ?? 'admin',
    createdAt: data['createdAt']?.toDate?.() ?? data['createdAt'],
    updatedAt: data['updatedAt']?.toDate?.() ?? data['updatedAt'],
    createdBy: data['createdBy'] ?? '',
  };
}

// ============================================
// SERVICE CLASS
// ============================================

export class OrganizationService {
  private db: Firestore;
  private readonly COLLECTION = 'Organizations';

  constructor(db: Firestore) {
    this.db = db;
  }

  /**
   * Create a new organization
   */
  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    logger.info('[OrganizationService] Creating organization', {
      name: input.name,
      ownerId: input.ownerId,
    });

    // Create admin entry for owner (skip for athlete-created ghost orgs)
    const admins: OrganizationAdmin[] = [];
    if (!input.skipAdmins && input.ownerId) {
      admins.push({
        userId: input.ownerId,
        role: 'owner',
        addedAt: new Date(),
        firstName: '',
        lastName: '',
        email: '',
      });
    }

    const orgData = {
      name: input.name,
      type: input.type,
      status: OrganizationStatus.ACTIVE,
      location: input.location || null,
      logoUrl: input.logoUrl || null,
      primaryColor: input.primaryColor || null,
      secondaryColor: input.secondaryColor || null,
      mascot: input.mascot || null,
      description: input.description || null,
      admins,
      ownerId: input.ownerId || '',
      isClaimed: input.isClaimed ?? true,
      source: input.source ?? 'admin',
      teamCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: input.ownerId || '',
    };

    const docRef = await this.db.collection(this.COLLECTION).add(orgData);
    const doc = await docRef.get();

    logger.info('[OrganizationService] Organization created', { orgId: docRef.id });

    return docToOrganization(doc);
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(orgId: string): Promise<Organization> {
    const cacheKey = CACHE_KEYS.ORG_BY_ID(orgId);

    // Try cache first
    const cached = await getCache()?.get<Organization>(cacheKey);
    if (cached) {
      logger.debug('[OrganizationService] Cache hit', { orgId });
      return cached;
    }

    const doc = await this.db.collection(this.COLLECTION).doc(orgId).get();
    const org = docToOrganization(doc);

    // Cache it
    await getCache()?.set(cacheKey, org, { ttl: ORG_CACHE_TTL });

    return org;
  }

  /**
   * Get organizations where user is admin/owner
   */
  async getOrganizationsByUser(userId: string): Promise<Organization[]> {
    const cacheKey = CACHE_KEYS.USER_ORGS(userId);

    // Try cache first
    const cached = await getCache()?.get<Organization[]>(cacheKey);
    if (cached) {
      logger.debug('[OrganizationService] Cache hit for user orgs', { userId });
      return cached;
    }

    const snapshot = await this.db
      .collection(this.COLLECTION)
      .where('admins', 'array-contains', { userId })
      .get();

    const orgs = snapshot.docs.map(docToOrganization);

    // Cache it
    await getCache()?.set(cacheKey, orgs, { ttl: ORG_CACHE_TTL });

    return orgs;
  }

  /**
   * Update organization
   */
  async updateOrganization(
    orgId: string,
    input: UpdateOrganizationInput,
    updatedBy: string
  ): Promise<Organization> {
    logger.info('[OrganizationService] Updating organization', { orgId, updatedBy });

    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Only update provided fields
    if (input.name !== undefined) updateData['name'] = input.name;
    if (input.type !== undefined) updateData['type'] = input.type;
    if (input.status !== undefined) updateData['status'] = input.status;
    if (input.location !== undefined) updateData['location'] = input.location;
    if (input.logoUrl !== undefined) updateData['logoUrl'] = input.logoUrl;
    if (input.primaryColor !== undefined) updateData['primaryColor'] = input.primaryColor;
    if (input.secondaryColor !== undefined) updateData['secondaryColor'] = input.secondaryColor;
    if (input.mascot !== undefined) updateData['mascot'] = input.mascot;
    if (input.description !== undefined) updateData['description'] = input.description;
    if (input.settings !== undefined) updateData['settings'] = input.settings;

    await this.db.collection(this.COLLECTION).doc(orgId).update(updateData);

    // Invalidate cache
    await this.invalidateCache(orgId);

    const doc = await this.db.collection(this.COLLECTION).doc(orgId).get();
    return docToOrganization(doc);
  }

  /**
   * Add admin to organization
   */
  async addAdmin(input: AddOrganizationAdminInput): Promise<Organization> {
    logger.info('[OrganizationService] Adding admin', {
      organizationId: input.organizationId,
      userId: input.userId,
    });

    // TODO: Fetch user details from Users collection
    const newAdmin: OrganizationAdmin = {
      userId: input.userId,
      role: input.role,
      addedAt: new Date(),
      firstName: '', // Should fetch from User
      lastName: '',
      email: '',
    };

    await this.db
      .collection(this.COLLECTION)
      .doc(input.organizationId)
      .update({
        admins: FieldValue.arrayUnion(newAdmin),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Invalidate cache
    await this.invalidateCache(input.organizationId);

    return this.getOrganizationById(input.organizationId);
  }

  /**
   * Remove admin from organization
   */
  async removeAdmin(orgId: string, userId: string): Promise<Organization> {
    logger.info('[OrganizationService] Removing admin', { orgId, userId });

    const org = await this.getOrganizationById(orgId);

    // Can't remove owner
    if (org.ownerId === userId) {
      throw new Error('Cannot remove organization owner');
    }

    const adminToRemove = org.admins.find((a) => a.userId === userId);
    if (!adminToRemove) {
      throw notFoundError('admin');
    }

    await this.db
      .collection(this.COLLECTION)
      .doc(orgId)
      .update({
        admins: FieldValue.arrayRemove(adminToRemove),
        updatedAt: FieldValue.serverTimestamp(),
      });

    // Invalidate cache
    await this.invalidateCache(orgId);

    return this.getOrganizationById(orgId);
  }

  /**
   * Increment team count
   */
  async incrementTeamCount(orgId: string): Promise<void> {
    await this.db
      .collection(this.COLLECTION)
      .doc(orgId)
      .update({
        teamCount: FieldValue.increment(1),
      });

    await this.invalidateCache(orgId);
  }

  /**
   * Search organizations by name prefix (case-insensitive via lowercased comparison).
   * Firestore doesn't support full-text search, so we use >= / < range query
   * on the name field for prefix matching, then filter client-side.
   *
   * Optionally filter by state.
   */
  async searchOrganizations(
    query: string,
    options?: {
      state?: string;
      type?: Organization['type'];
      limit?: number;
    }
  ): Promise<Organization[]> {
    const limit = Math.min(options?.limit ?? 20, 50);
    const cacheKey = `org:search:${query.toLowerCase()}:${options?.state ?? ''}:${options?.type ?? ''}:${limit}`;

    const cached = await getCache()?.get<Organization[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Firestore range query for prefix matching
    // We query a broader set and filter in memory for case-insensitive matching
    let ref = this.db
      .collection(this.COLLECTION)
      .where('status', '==', OrganizationStatus.ACTIVE)
      .limit(limit * 3); // Over-fetch to account for client-side filtering

    if (options?.type) {
      ref = ref.where('type', '==', options.type);
    }

    if (options?.state) {
      ref = ref.where('location.state', '==', options.state);
    }

    const snapshot = await ref.get();
    const queryLower = query.toLowerCase();

    const orgs = snapshot.docs
      .map(docToOrganization)
      .filter((org) => org.name.toLowerCase().includes(queryLower))
      .slice(0, limit);

    // Cache for 15 minutes
    await getCache()?.set(cacheKey, orgs, { ttl: ORG_CACHE_TTL });

    return orgs;
  }

  /**
   * Invalidate cache for organization
   */
  private async invalidateCache(orgId: string): Promise<void> {
    const cache = getCache();
    if (!cache) return;

    await cache.del(CACHE_KEYS.ORG_BY_ID(orgId));

    // Also invalidate user org lists for all admins
    const org = await this.getOrganizationById(orgId);
    for (const admin of org.admins) {
      await cache.del(CACHE_KEYS.USER_ORGS(admin.userId));
    }
  }
}

/**
 * Create organization service instance
 */
export function createOrganizationService(db: Firestore): OrganizationService {
  return new OrganizationService(db);
}
