/**
 * @fileoverview Billing & Usage Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/billing
 *
 * Type-safe DTOs for billing and usage tracking endpoints using class-validator
 */

import { Transform } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  Min,
  Max,
  MaxLength,
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
  ORGANIZATION = 'organization',
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

// ============================================
// UPDATE ORGANIZATION BUDGET DTO
// ============================================

export class UpdateOrganizationBudgetDto {
  @IsInt({ message: 'Monthly budget must be an integer (in cents)' })
  @Min(0, { message: 'Monthly budget must be non-negative' })
  @Max(1000000000, { message: 'Monthly budget cannot exceed $10,000,000' })
  @IsNotEmpty()
  monthlyBudget!: number; // in cents
}

// ============================================
// UPDATE TEAM ALLOCATION DTO
// ============================================

export class UpdateTeamAllocationDto {
  @IsInt({ message: 'Monthly limit must be an integer (in cents)' })
  @Min(0, { message: 'Monthly limit must be non-negative' })
  @Max(1000000000, { message: 'Monthly limit cannot exceed $10,000,000' })
  @IsNotEmpty()
  monthlyLimit!: number; // in cents
}

// ============================================
// IAP WALLET VERIFY RECEIPT DTO
// ============================================

export class IAPVerifyReceiptDto {
  @IsString({ message: 'jwsTransaction must be a string' })
  @IsNotEmpty({ message: 'jwsTransaction is required' })
  @MaxLength(32000, { message: 'JWS transaction token exceeds maximum allowed length' })
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, {
    message: 'jwsTransaction must be a valid JWS compact serialization (header.payload.signature)',
  })
  jwsTransaction!: string;
}

// ============================================
// IAP WALLET WEBHOOK DTO (reference — signature-verified, not class-validator)
// ============================================

/**
 * Apple App Store Server Notification V2.
 * Validated via SignedDataVerifier (certificate + signature), not class-validator.
 * This is for type reference only.
 */
export interface AppleS2SNotificationDto {
  signedPayload: string;
}

// ============================================
// WALLET CHECK QUERY DTO
// ============================================

export class WalletCheckQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseInt(value, 10) : value
  )
  @IsInt({ message: 'cents must be an integer' })
  @Min(0, { message: 'cents must be non-negative' })
  @Max(100_000_000, { message: 'cents cannot exceed $1,000,000' })
  cents!: number;
}

// ============================================
// UPDATE PRICING CONFIG DTO
// ============================================

export class UpdatePricingConfigDto {
  @IsNumber(
    { allowInfinity: false, allowNaN: false },
    { message: 'defaultMultiplier must be a number' }
  )
  @Min(0.1, { message: 'defaultMultiplier must be at least 0.1' })
  @Max(100, { message: 'defaultMultiplier cannot exceed 100' })
  @IsOptional()
  defaultMultiplier?: number;

  @IsObject({ message: 'featureOverrides must be an object mapping feature names to multipliers' })
  @IsOptional()
  featureOverrides?: Record<string, number>;
}

// ============================================
// ORG REFUND DTO
// ============================================

export class OrgRefundDto {
  @IsString({ message: 'chargeId must be a string' })
  @IsNotEmpty({ message: 'chargeId is required' })
  @Matches(/^ch_[a-zA-Z0-9_-]{1,255}$/, {
    message: 'chargeId must be a valid Stripe charge ID (ch_...)',
  })
  chargeId!: string;

  @IsInt({ message: 'amountCents must be an integer' })
  @Min(1, { message: 'amountCents must be at least 1' })
  @Max(100_000_000, { message: 'amountCents cannot exceed $1,000,000' })
  @IsOptional()
  amountCents?: number;
}
