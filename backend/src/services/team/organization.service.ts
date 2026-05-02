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
import { getCacheService, CACHE_TTL } from '../core/cache.service.js';
import { notFoundError } from '@nxt1/core/errors';
import { logger } from '../../utils/logger.js';

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

function normalizeAdminAddedAt(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const converted = value.toDate();
    if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
      return converted;
    }
  }

  if (typeof value === 'string') {
    const converted = new Date(value);
    if (!Number.isNaN(converted.getTime())) {
      return converted;
    }
  }

  if (typeof value === 'object' && value !== null) {
    const seconds =
      typeof (value as Record<string, unknown>)['_seconds'] === 'number'
        ? ((value as Record<string, unknown>)['_seconds'] as number)
        : typeof (value as Record<string, unknown>)['seconds'] === 'number'
          ? ((value as Record<string, unknown>)['seconds'] as number)
          : undefined;
    const nanoseconds =
      typeof (value as Record<string, unknown>)['_nanoseconds'] === 'number'
        ? ((value as Record<string, unknown>)['_nanoseconds'] as number)
        : typeof (value as Record<string, unknown>)['nanoseconds'] === 'number'
          ? ((value as Record<string, unknown>)['nanoseconds'] as number)
          : 0;

    if (seconds !== undefined) {
      return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
    }
  }

  return new Date();
}

function normalizeOrganizationAdmins(
  admins: readonly OrganizationAdmin[] | unknown
): OrganizationAdmin[] {
  if (!Array.isArray(admins)) {
    return [];
  }

  const byUserId = new Map<string, OrganizationAdmin>();

  for (const admin of admins) {
    if (!admin || typeof admin !== 'object') {
      continue;
    }

    const userId = typeof admin.userId === 'string' ? admin.userId.trim() : '';
    const role = admin.role;

    if (!userId || (role !== 'coach' && role !== 'director')) {
      continue;
    }

    const nextAdmin: OrganizationAdmin = {
      userId,
      role,
      addedAt: normalizeAdminAddedAt(admin.addedAt),
    };

    const existing = byUserId.get(userId);
    if (!existing || (existing.role !== 'director' && role === 'director')) {
      byUserId.set(userId, nextAdmin);
    }
  }

  return Array.from(byUserId.values());
}

function buildNextOrganizationAdmins(
  currentAdmins: readonly OrganizationAdmin[] | unknown,
  nextAdmin: OrganizationAdmin
): OrganizationAdmin[] {
  let admins = normalizeOrganizationAdmins(currentAdmins);

  const existingForUser = admins.find((admin) => admin.userId === nextAdmin.userId);

  if (nextAdmin.role === 'director') {
    admins = admins.filter((admin) => admin.role !== 'coach' && admin.userId !== nextAdmin.userId);
    admins.push(nextAdmin);
    return admins;
  }

  const hasDirector = admins.some((admin) => admin.role === 'director');
  if (hasDirector || existingForUser?.role === 'director') {
    return admins;
  }

  if (existingForUser?.role === nextAdmin.role) {
    return admins;
  }

  admins = admins.filter((admin) => admin.userId !== nextAdmin.userId);
  admins.push(nextAdmin);
  return admins;
}

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
    level: data['level'],
    admins: data['admins'] ?? [],
    ownerId: data['ownerId'] ?? '',
    billingOwnerUid: data['billingOwnerUid'],
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
      createdBy: input.createdBy,
    });

    // Create admin entry for creator (skip for athlete-created ghost orgs)
    const admins: OrganizationAdmin[] = [];
    if (!input.skipAdmins && input.createdBy) {
      admins.push({
        userId: input.createdBy,
        role: input.creatorRole ?? 'director',
        addedAt: new Date(),
      });
    }

    const orgData = {
      name: input.name,
      nameLower: input.name.toLowerCase(),
      type: input.type,
      status: OrganizationStatus.ACTIVE,
      location: input.location || null,
      logoUrl: input.logoUrl || null,
      primaryColor: input.primaryColor || null,
      secondaryColor: input.secondaryColor || null,
      mascot: input.mascot || null,
      level: input.level || null,
      admins,
      ownerId: admins.length > 0 ? input.createdBy || '' : '',
      isClaimed: input.isClaimed ?? true,
      source: input.source ?? 'admin',
      teamCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: input.createdBy || '',
    };

    const docRef = await this.db.collection(this.COLLECTION).add(orgData);
    const doc = await docRef.get();

    // Purge search cache so the new org appears in results immediately
    await this.invalidateSearchCache();

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

    const orgMap = new Map<string, Organization>();

    const [ownerSnapshot, organizationSnapshot] = await Promise.all([
      this.db.collection(this.COLLECTION).where('ownerId', '==', userId).get(),
      this.db.collection(this.COLLECTION).get(),
    ]);

    ownerSnapshot.docs.forEach((doc) => orgMap.set(doc.id, docToOrganization(doc)));
    organizationSnapshot.docs
      .filter((doc) =>
        normalizeOrganizationAdmins(doc.data()?.['admins']).some((admin) => admin.userId === userId)
      )
      .forEach((doc) => orgMap.set(doc.id, docToOrganization(doc)));

    const orgs = Array.from(orgMap.values());

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
    if (input.name !== undefined) {
      updateData['name'] = input.name;
      updateData['nameLower'] = input.name.toLowerCase();
    }
    if (input.type !== undefined) updateData['type'] = input.type;
    if (input.status !== undefined) updateData['status'] = input.status;
    if (input.location !== undefined) updateData['location'] = input.location;
    if (input.logoUrl !== undefined) updateData['logoUrl'] = input.logoUrl;
    if (input.primaryColor !== undefined) updateData['primaryColor'] = input.primaryColor;
    if (input.secondaryColor !== undefined) updateData['secondaryColor'] = input.secondaryColor;
    if (input.mascot !== undefined) updateData['mascot'] = input.mascot;
    if (input.level !== undefined) updateData['level'] = input.level;
    if (input.settings !== undefined) updateData['settings'] = input.settings;

    await this.db.collection(this.COLLECTION).doc(orgId).update(updateData);

    // Invalidate cache
    await this.invalidateCache(orgId);

    const doc = await this.db.collection(this.COLLECTION).doc(orgId).get();
    return docToOrganization(doc);
  }

  /**
   * Add admin to organization.
   *
   * Business rules:
   * - When a **director** is added, any existing **coach** admins are removed
   *   (director supersedes coach at the org level).
   * - Adding a coach or director marks the organization as `isClaimed: true`.
   */
  async addAdmin(input: AddOrganizationAdminInput): Promise<Organization> {
    logger.info('[OrganizationService] Adding admin', {
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
    });

    const newAdmin: OrganizationAdmin = {
      userId: input.userId,
      role: input.role,
      addedAt: new Date(),
    };
    const org = await this.getOrganizationById(input.organizationId);

    const isPrivilegedRole = input.role === 'director' || input.role === 'coach';

    const previousCoachAdmins = normalizeOrganizationAdmins(org.admins)
      .filter((admin) => admin.role === 'coach')
      .map((admin) => admin.userId);
    const nextAdmins = buildNextOrganizationAdmins(org.admins, newAdmin);
    const nextOwnerId =
      input.role === 'director'
        ? input.userId
        : input.role === 'coach' &&
            !org.ownerId &&
            !nextAdmins.some((admin) => admin.role === 'director')
          ? input.userId
          : org.ownerId;

    if (input.role === 'director' && previousCoachAdmins.length > 0) {
      logger.info('[OrganizationService] Demoting coach admins — director taking over', {
        organizationId: input.organizationId,
        directorUserId: input.userId,
        demotedCoaches: previousCoachAdmins,
      });
    }

    if (
      input.role === 'coach' &&
      normalizeOrganizationAdmins(org.admins).some((admin) => admin.role === 'director')
    ) {
      logger.info('[OrganizationService] Skipping coach admin add — director already exists', {
        organizationId: input.organizationId,
        userId: input.userId,
      });
    }

    await this.db
      .collection(this.COLLECTION)
      .doc(input.organizationId)
      .update({
        admins: nextAdmins,
        adminUserIds: FieldValue.delete(),
        ownerId: nextOwnerId,
        ...(isPrivilegedRole && { isClaimed: true }),
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

    // Can't remove the director/primary admin
    const isDirector = org.admins.some((a) => a.userId === userId && a.role === 'director');
    if (isDirector) {
      throw new Error('Cannot remove organization director');
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
        adminUserIds: FieldValue.delete(),
        ...(org.billingOwnerUid === userId ? { billingOwnerUid: FieldValue.delete() } : {}),
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
   * Search organizations by name prefix (case-insensitive).
   * Uses a `nameLower` field with Firestore >= / <= range query for
   * efficient prefix matching directly at the database level.
   *
   * Optionally filter by state or type.
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
    const queryLower = query.toLowerCase();
    const cacheKey = `org:search:${queryLower}:${options?.state ?? ''}:${options?.type ?? ''}:${limit}`;

    const cached = await getCache()?.get<Organization[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Over-fetch when applying in-memory filters so we don't
    // miss valid results hidden behind non-matching docs.
    const hasInMemoryFilters = !!options?.type || !!options?.state;
    const fetchLimit = hasInMemoryFilters ? limit * 5 : limit;

    // Firestore prefix range query on the nameLower field.
    // '\uf8ff' is a very high Unicode char that acts as an upper bound
    // so "glen" matches "glenoak", "glendale", etc.
    const ref: FirebaseFirestore.Query = this.db
      .collection(this.COLLECTION)
      .where('nameLower', '>=', queryLower)
      .where('nameLower', '<=', queryLower + '\uf8ff')
      .limit(fetchLimit);

    const snapshot = await ref.get();

    let orgs = snapshot.docs.map(docToOrganization);

    // Apply optional filters in-memory (avoids composite index requirement)
    if (options?.type) {
      orgs = orgs.filter((org) => org.type === options.type);
    }
    if (options?.state) {
      orgs = orgs.filter((org) => org.location?.state === options.state);
    }

    orgs = orgs.slice(0, limit);

    // Cache for 5 minutes (short TTL so new orgs appear quickly)
    await getCache()?.set(cacheKey, orgs, { ttl: 300 });

    return orgs;
  }

  /**
   * Invalidate cache for a specific organization and its admin lists.
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

    // Purge search cache so name/type changes reflect immediately
    await this.invalidateSearchCache();
  }

  /**
   * Purge all org search result caches.
   * Uses prefix-based deletion so any cached search query is cleared.
   */
  private async invalidateSearchCache(): Promise<void> {
    const cache = getCache();
    if (!cache) return;

    // If the cache adapter supports pattern deletion, use it.
    // Otherwise this is a best-effort no-op — the 5-minute TTL
    // ensures stale entries expire quickly regardless.
    if (typeof (cache as unknown as Record<string, unknown>)['delByPrefix'] === 'function') {
      await (cache as unknown as { delByPrefix: (prefix: string) => Promise<void> }).delByPrefix(
        'org:search:'
      );
    }
  }
}

/**
 * Create organization service instance
 */
export function createOrganizationService(db: Firestore): OrganizationService {
  return new OrganizationService(db);
}
