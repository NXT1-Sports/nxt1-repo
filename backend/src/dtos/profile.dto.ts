/**
 * @fileoverview Profile Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/profile
 *
 * Type-safe DTOs for profile management endpoints using class-validator
 */

import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsUrl,
  IsEnum,
  Length,
  Matches,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LocationDto,
  ContactInfoDto,
  SportProfileDto,
  ConnectedSourceDto,
  Gender,
} from './auth.dto.js';

// ============================================
// NESTED DTOs
// ============================================

export class SocialLinkDto {
  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsUrl({}, { message: 'Invalid URL format' })
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsOptional()
  username?: string;
}

export class TeamHistoryDto {
  @IsString()
  @IsNotEmpty()
  teamName!: string;

  @IsString()
  @IsOptional()
  teamType?: string;

  @IsString()
  @IsOptional()
  sport?: string;

  @IsInt()
  @IsOptional()
  @Min(1900)
  @Max(2100)
  startYear?: number;

  @IsInt()
  @IsOptional()
  @Min(1900)
  @Max(2100)
  endYear?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  positions?: string[];

  @IsString()
  @IsOptional()
  jerseyNumber?: string;
}

export class AwardDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 200, { message: 'Award title must be between 2 and 200 characters' })
  title!: string;

  @IsString()
  @IsOptional()
  @Length(0, 500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsString()
  @IsOptional()
  year?: string;

  @IsString()
  @IsOptional()
  issuer?: string;

  @IsString()
  @IsOptional()
  sport?: string;
}

export class AthleteDataDto {
  @IsInt()
  @IsOptional()
  @Min(2000)
  @Max(2050)
  classOf?: number;

  @IsString()
  @IsOptional()
  highSchool?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  positions?: string[];

  @IsString()
  @IsOptional()
  jerseyNumber?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(500)
  height?: number; // cm

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1000)
  weight?: number; // lbs

  @IsNumber()
  @IsOptional()
  gpa?: number;
}

export class CoachDataDto {
  @IsString()
  @IsOptional()
  @Length(2, 100, { message: 'Title must be between 2 and 100 characters' })
  title?: string;

  @IsString()
  @IsOptional()
  @Length(2, 200, { message: 'Organization must be between 2 and 200 characters' })
  organization?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  yearsExperience?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  certifications?: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  specialties?: string[];
}

export class PreferencesDto {
  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsObject()
  @IsOptional()
  notifications?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
  };

  @IsObject()
  @IsOptional()
  privacy?: {
    showEmail?: boolean;
    showPhone?: boolean;
    profileVisibility?: 'public' | 'private';
  };
}

// ============================================
// UPDATE PROFILE DTO
// ============================================

export class UpdateProfileDto {
  // Core identity
  @IsString()
  @IsOptional()
  @Length(2, 50, { message: 'First name must be between 2 and 50 characters' })
  @Matches(/^[a-zA-Z\s'\-À-ÿ]+$/, {
    message: 'First name can only contain letters, spaces, hyphens, and apostrophes',
  })
  firstName?: string;

  @IsString()
  @IsOptional()
  @Length(2, 50, { message: 'Last name must be between 2 and 50 characters' })
  @Matches(/^[a-zA-Z\s'\-À-ÿ]+$/, {
    message: 'Last name can only contain letters, spaces, hyphens, and apostrophes',
  })
  lastName?: string;

  @IsString()
  @IsOptional()
  @Length(2, 100, { message: 'Display name must be between 2 and 100 characters' })
  displayName?: string;

  @IsString()
  @IsOptional()
  @Length(3, 30, { message: 'Username must be between 3 and 30 characters' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, dots, and hyphens',
  })
  username?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500, { message: 'About me cannot exceed 500 characters' })
  aboutMe?: string;

  @IsUrl({}, { message: 'Invalid banner image URL' })
  @IsOptional()
  bannerImg?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Maximum 10 profile images allowed' })
  @IsUrl({}, { each: true, message: 'Each profile image must be a valid URL' })
  profileImgs?: string[];

  @IsEnum(Gender, { message: 'Invalid gender value' })
  @IsOptional()
  gender?: Gender;

  // Physical attributes
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(500)
  height?: number; // cm

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1000)
  weight?: number; // lbs

  @IsInt()
  @IsOptional()
  @Min(2000)
  @Max(2050)
  classOf?: number;

  // Location & contact
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactInfoDto)
  contact?: ContactInfoDto;

  // Social links
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  @ArrayMaxSize(20, { message: 'Maximum 20 social links allowed' })
  social?: SocialLinkDto[];

  // Sports
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SportProfileDto)
  @ArrayMaxSize(5, { message: 'Maximum 5 sports allowed' })
  sports?: SportProfileDto[];

  @IsInt()
  @Min(0)
  @IsOptional()
  activeSportIndex?: number;

  // History & awards
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TeamHistoryDto)
  @ArrayMaxSize(50, { message: 'Maximum 50 team history entries allowed' })
  teamHistory?: TeamHistoryDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AwardDto)
  @ArrayMaxSize(100, { message: 'Maximum 100 awards allowed' })
  awards?: AwardDto[];

  // Connected sources
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConnectedSourceDto)
  @ArrayMaxSize(50, { message: 'Maximum 50 connected sources allowed' })
  connectedSources?: ConnectedSourceDto[];

  // Role-specific data
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => AthleteDataDto)
  athlete?: AthleteDataDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => CoachDataDto)
  coach?: CoachDataDto;

  @IsObject()
  @IsOptional()
  director?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  recruiter?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  parent?: Record<string, unknown>;

  // Preferences
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;
}

// ============================================
// UPLOAD PROFILE IMAGE DTO
// ============================================

export class UploadProfileImageDto {
  @IsUrl({}, { message: 'Invalid image URL format' })
  @IsNotEmpty()
  imageUrl!: string;

  @IsString()
  @IsOptional()
  @IsEnum(['profile', 'banner'], { message: 'Image type must be either "profile" or "banner"' })
  imageType?: 'profile' | 'banner';
}

// ============================================
// UPDATE USERNAME DTO
// ============================================

export class UpdateUsernameDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 30, { message: 'Username must be between 3 and 30 characters' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, dots, and hyphens',
  })
  username!: string;
}

// ============================================
// ADD CONNECTED SOURCE DTO
// ============================================

export class AddConnectedSourceDto {
  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsUrl({}, { message: 'Invalid profile URL format' })
  @IsNotEmpty()
  profileUrl!: string;

  @IsUrl({}, { message: 'Invalid favicon URL format' })
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @IsOptional()
  scopeType?: string;

  @IsString()
  @IsOptional()
  scopeId?: string;
}
