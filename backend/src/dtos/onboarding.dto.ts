/**
 * @fileoverview Onboarding Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/onboarding
 *
 * DTOs for the POST /auth/profile/onboarding bulk save endpoint
 * and POST /auth/profile/onboarding-step incremental save.
 */

import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  IsObject,
  IsBoolean,
  IsNumber,
  Length,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// NESTED DTOs
// ============================================

class OnboardingSportTeamDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  teamId?: string;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  logo?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  colors?: string[];
}

class OnboardingSportDto {
  @IsString()
  @IsNotEmpty()
  sport!: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  positions?: string[];

  @IsString()
  @IsOptional()
  level?: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingSportTeamDto)
  team?: OnboardingSportTeamDto;
}

class OnboardingContactDto {
  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

class OnboardingTeamSelectionTeamDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  sport?: string;

  @IsString()
  @IsOptional()
  teamType?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  colors?: string[];

  @IsNumber()
  @IsOptional()
  memberCount?: number;

  @IsBoolean()
  @IsOptional()
  isSchool?: boolean;

  @IsBoolean()
  @IsOptional()
  isDraft?: boolean;

  @IsString()
  @IsOptional()
  organizationId?: string;
}

class OnboardingTeamSelectionDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OnboardingTeamSelectionTeamDto)
  teams?: OnboardingTeamSelectionTeamDto[];
}

class OnboardingCreateTeamProfileDto {
  @IsString()
  @IsOptional()
  @Length(1, 200)
  programName?: string;

  @IsString()
  @IsOptional()
  teamType?: string;

  @IsString()
  @IsOptional()
  @Length(0, 100)
  mascot?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  level?: string;

  @IsString()
  @IsOptional()
  gender?: string;
}

class OnboardingLinkDto {
  @IsString()
  @IsOptional()
  platform?: string;

  @IsBoolean()
  @IsOptional()
  connected?: boolean;

  @IsString()
  @IsOptional()
  connectionType?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  scopeType?: string;

  @IsString()
  @IsOptional()
  scopeId?: string;
}

class OnboardingLinkSourcesDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OnboardingLinkDto)
  links?: OnboardingLinkDto[];
}

// ============================================
// BULK ONBOARDING DTO
// ============================================

/**
 * DTO for POST /auth/profile/onboarding — the atomic bulk save that
 * completes onboarding in a single request.
 */
export class BulkOnboardingDto {
  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  /** V2 role: 'athlete' | 'coach' | 'director' */
  @IsString()
  @IsOptional()
  userType?: string;

  @IsString()
  @IsOptional()
  @Length(1, 50)
  firstName?: string;

  @IsString()
  @IsOptional()
  @Length(1, 50)
  lastName?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  profileImgs?: string[];

  @IsString()
  @IsOptional()
  profileImg?: string;

  // V2 sports array (preferred)
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => OnboardingSportDto)
  sports?: OnboardingSportDto[];

  // Legacy flat sport fields (backwards compat)
  @IsString()
  @IsOptional()
  sport?: string;

  @IsString()
  @IsOptional()
  secondarySport?: string;

  @IsString()
  @IsOptional()
  tertiarySport?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  positions?: string[];

  // Location fields
  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  // Athlete-specific
  @IsOptional()
  classOf?: number | string;

  // Coach/Director-specific
  @IsString()
  @IsOptional()
  coachTitle?: string;

  @IsString()
  @IsOptional()
  organization?: string;

  // Contact
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingContactDto)
  contact?: OnboardingContactDto;

  @IsString()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  // Team/Program creation
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingCreateTeamProfileDto)
  createTeamProfile?: OnboardingCreateTeamProfileDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingTeamSelectionDto)
  teamSelection?: OnboardingTeamSelectionDto;

  // Linked sources
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingLinkSourcesDto)
  linkSources?: OnboardingLinkSourcesDto;

  // Pre-fetched scrape job ID (reuse from Step 5 preload)
  @IsString()
  @IsOptional()
  scrapeJobId?: string;

  // Legacy team code (fallback)
  @IsString()
  @IsOptional()
  highSchool?: string;

  @IsString()
  @IsOptional()
  highSchoolSuffix?: string;

  @IsString()
  @IsOptional()
  teamCode?: string;

  @IsString()
  @IsOptional()
  referralSource?: string;

  @IsString()
  @IsOptional()
  referralDetails?: string;
}

// ============================================
// ONBOARDING STEP DTO
// ============================================

/**
 * DTO for POST /auth/profile/onboarding-step — incremental step saves.
 */
export class OnboardingStepDto {
  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Step ID is required' })
  stepId!: string;

  @IsObject()
  @IsNotEmpty({ message: 'Step data is required' })
  stepData!: Record<string, unknown>;
}
