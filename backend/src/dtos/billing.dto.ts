/**
 * @fileoverview Billing & Usage Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/billing
 *
 * Type-safe DTOs for billing and usage tracking endpoints using class-validator
 */

import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsObject,
  Min,
  Max,
  Matches,
} from 'class-validator';

// ============================================
// ENUMS
// ============================================

export enum UsageFeature {
  AI_GRAPHIC = 'AI_GRAPHIC',
  HIGHLIGHT = 'HIGHLIGHT',
  VIDEO_ANALYSIS = 'VIDEO_ANALYSIS',
  AGENT_X = 'AGENT_X',
  EMAIL_CAMPAIGN = 'EMAIL_CAMPAIGN',
  SOCIAL_POST = 'SOCIAL_POST',
  TEAM_ANALYTICS = 'TEAM_ANALYTICS',
  RECRUITING_REPORT = 'RECRUITING_REPORT',
  TRANSCRIPT_GENERATION = 'TRANSCRIPT_GENERATION',
  MUSIC_GENERATION = 'MUSIC_GENERATION',
}

export enum BillingEntity {
  USER = 'user',
  TEAM = 'team',
}

// ============================================
// CREATE USAGE EVENT DTO
// ============================================

export class CreateUsageEventDto {
  @IsEnum(UsageFeature, {
    message: 'Invalid feature. Must be one of: ' + Object.values(UsageFeature).join(', '),
  })
  @IsNotEmpty()
  feature!: UsageFeature;

  @IsInt({ message: 'Quantity must be an integer' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1000, { message: 'Quantity cannot exceed 1000 per request' })
  @IsNotEmpty()
  quantity!: number;

  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,128}$/, {
    message: 'Job ID must be alphanumeric with hyphens/underscores, max 128 chars',
  })
  jobId?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_-]{1,128}$/, {
    message: 'Team ID must be alphanumeric with hyphens/underscores, max 128 chars',
  })
  teamId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

// ============================================
// UPDATE BUDGET DTO
// ============================================

export class UpdateBudgetDto {
  @IsInt({ message: 'Monthly budget must be an integer (in cents)' })
  @Min(0, { message: 'Monthly budget must be non-negative' })
  @Max(1000000000, { message: 'Monthly budget cannot exceed $10,000,000' }) // $10M max
  @IsNotEmpty()
  monthlyBudget!: number; // in cents

  @IsOptional()
  @IsEnum(['soft', 'hard'], { message: 'Hard stop must be either "soft" or "hard"' })
  hardStop?: 'soft' | 'hard';
}

// ============================================
// UPDATE TEAM BUDGET DTO
// ============================================

export class UpdateTeamBudgetDto {
  @IsInt({ message: 'Monthly budget must be an integer (in cents)' })
  @Min(0, { message: 'Monthly budget must be non-negative' })
  @Max(1000000000, { message: 'Monthly budget cannot exceed $10,000,000' })
  @IsNotEmpty()
  monthlyBudget!: number; // in cents

  @IsOptional()
  @IsEnum(['soft', 'hard'], { message: 'Hard stop must be either "soft" or "hard"' })
  hardStop?: 'soft' | 'hard';
}

// ============================================
// QUERY DTOs
// ============================================

export class GetUsageEventsDto {
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(1000, { message: 'Limit cannot exceed 1000' })
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  startDate?: string; // ISO 8601 date string

  @IsString()
  @IsOptional()
  endDate?: string; // ISO 8601 date string

  @IsEnum(UsageFeature, { message: 'Invalid feature filter' })
  @IsOptional()
  feature?: UsageFeature;
}

// ============================================
// STRIPE WEBHOOK DTO (for reference - not validated via class-validator)
// ============================================

/**
 * Stripe webhook payloads are validated via Stripe's signature verification,
 * not class-validator. This is for type reference only.
 */
export interface StripeWebhookDto {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}
