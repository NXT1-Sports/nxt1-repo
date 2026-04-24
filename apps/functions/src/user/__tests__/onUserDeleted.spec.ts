import { describe, expect, it } from 'vitest';
import { buildOrganizationCleanupPlan } from '../organizationCleanup';

describe('buildOrganizationCleanupPlan', () => {
  it('removes deleted users from legacy admins and clears billing ownership traces', () => {
    const plan = buildOrganizationCleanupPlan('user-123', {
      admins: [
        {
          userId: 'user-123',
          role: 'director',
        },
        {
          userId: 'user-456',
          role: 'coach',
        },
      ],
      billingOwnerUid: 'user-123',
      createdBy: 'system-user',
      ownerId: 'system-user',
    });

    expect(plan.shouldUpdate).toBe(true);
    expect(plan.clearBillingOwnerUid).toBe(true);
    expect(plan.clearAdminUserIds).toBe(false);
    expect(plan.nextAdmins).toEqual([
      {
        userId: 'user-456',
        role: 'coach',
      },
    ]);
    expect(plan.deactivated).toBe(false);
  });

  it('deactivates ownerless organizations when the deleted user was the last admin and owner', () => {
    const plan = buildOrganizationCleanupPlan('user-123', {
      admins: [
        {
          userId: 'user-123',
          role: 'director',
        },
      ],
      ownerId: 'user-123',
      createdBy: 'user-123',
      billingOwnerUid: 'user-123',
    });

    expect(plan.shouldUpdate).toBe(true);
    expect(plan.nextAdmins).toEqual([]);
    expect(plan.nextOwnerId).toBeUndefined();
    expect(plan.nextCreatedBy).toBeUndefined();
    expect(plan.clearOwnerId).toBe(true);
    expect(plan.clearCreatedBy).toBe(true);
    expect(plan.deactivated).toBe(true);
    expect(plan.clearBillingOwnerUid).toBe(true);
    expect(plan.clearAdminUserIds).toBe(false);
  });

  it('reassigns ownerId to the next admin when the deleted owner is not the last admin', () => {
    const plan = buildOrganizationCleanupPlan('user-123', {
      admins: [
        {
          userId: 'user-123',
          role: 'director',
        },
        {
          userId: 'user-456',
          role: 'coach',
        },
      ],
      ownerId: 'user-123',
      createdBy: 'user-123',
    });

    expect(plan.shouldUpdate).toBe(true);
    expect(plan.nextOwnerId).toBe('user-456');
    expect(plan.nextCreatedBy).toBe('user-456');
    expect(plan.clearOwnerId).toBe(false);
    expect(plan.clearCreatedBy).toBe(false);
    expect(plan.deactivated).toBe(false);
  });

  it('deletes legacy adminUserIds when present', () => {
    const plan = buildOrganizationCleanupPlan('user-123', {
      admins: [
        {
          userId: 'user-456',
          role: 'director',
        },
      ],
      adminUserIds: ['user-123', 'user-456'],
    });

    expect(plan.shouldUpdate).toBe(true);
    expect(plan.nextAdmins).toBeUndefined();
    expect(plan.clearAdminUserIds).toBe(true);
    expect(plan.clearBillingOwnerUid).toBe(false);
    expect(plan.deactivated).toBe(false);
  });
});
