/**
 * @fileoverview Onboarding DTO Validation Tests
 * @module @nxt1/backend/dtos/__tests__/onboarding
 */

import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { BulkOnboardingDto, OnboardingStepDto } from '../onboarding.dto.js';

// ============================================
// BulkOnboardingDto
// ============================================

describe('BulkOnboardingDto', () => {
  it('should pass validation with required userId', async () => {
    const dto = plainToClass(BulkOnboardingDto, { userId: 'user123' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should fail when userId is missing', async () => {
    const dto = plainToClass(BulkOnboardingDto, {});
    const errors = await validate(dto);
    const userIdError = errors.find((e) => e.property === 'userId');
    expect(userIdError).toBeDefined();
  });

  it('should fail when userId is empty string', async () => {
    const dto = plainToClass(BulkOnboardingDto, { userId: '' });
    const errors = await validate(dto);
    const userIdError = errors.find((e) => e.property === 'userId');
    expect(userIdError).toBeDefined();
  });

  it('should pass with all optional fields', async () => {
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      userType: 'athlete',
      firstName: 'John',
      lastName: 'Doe',
      gender: 'male',
      city: 'Houston',
      state: 'TX',
      classOf: 2026,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should pass with nested sports array', async () => {
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      sports: [
        { sport: 'Basketball', isPrimary: true, positions: ['PG', 'SG'] },
        { sport: 'Football', positions: ['WR'] },
      ],
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should limit sports array to 5 items', async () => {
    const tooManySports = Array.from({ length: 6 }, (_, i) => ({
      sport: `Sport${i}`,
      isPrimary: i === 0,
    }));
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      sports: tooManySports,
    });
    const errors = await validate(dto);
    const sportsError = errors.find((e) => e.property === 'sports');
    expect(sportsError).toBeDefined();
  });

  it('should pass with nested contact object', async () => {
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      contact: { email: 'test@example.com', phone: '555-1234' },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should pass with nested teamSelection', async () => {
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      teamSelection: {
        teams: [{ id: 'team1', name: 'Eagles', teamType: 'high-school' }],
      },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should pass with nested createTeamProfile', async () => {
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      createTeamProfile: {
        programName: 'Houston Eagles',
        teamType: 'high-school',
        mascot: 'Eagles',
        state: 'TX',
        city: 'Houston',
      },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should reject unknown properties when forbidNonWhitelisted is true', async () => {
    const dto = plainToClass(BulkOnboardingDto, {
      userId: 'user123',
      unknownField: 'should fail',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ============================================
// OnboardingStepDto
// ============================================

describe('OnboardingStepDto', () => {
  it('should pass with all required fields', async () => {
    const dto = plainToClass(OnboardingStepDto, {
      userId: 'user123',
      stepId: 'role',
      stepData: { role: 'athlete' },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('should fail when userId is missing', async () => {
    const dto = plainToClass(OnboardingStepDto, {
      stepId: 'role',
      stepData: { role: 'athlete' },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'userId')).toBeDefined();
  });

  it('should fail when stepId is missing', async () => {
    const dto = plainToClass(OnboardingStepDto, {
      userId: 'user123',
      stepData: { role: 'athlete' },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'stepId')).toBeDefined();
  });

  it('should fail when stepData is missing', async () => {
    const dto = plainToClass(OnboardingStepDto, {
      userId: 'user123',
      stepId: 'role',
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'stepData')).toBeDefined();
  });

  it('should fail when stepId is empty', async () => {
    const dto = plainToClass(OnboardingStepDto, {
      userId: 'user123',
      stepId: '',
      stepData: { role: 'athlete' },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'stepId')).toBeDefined();
  });

  it('should reject unknown properties', async () => {
    const dto = plainToClass(OnboardingStepDto, {
      userId: 'user123',
      stepId: 'role',
      stepData: { role: 'athlete' },
      extraField: 'bad',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});
