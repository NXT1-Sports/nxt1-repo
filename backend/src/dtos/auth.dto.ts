/**
 * @fileoverview Auth Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/auth
 *
 * Type-safe DTOs for authentication endpoints using class-validator
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsBoolean,
  IsEnum,
  Length,
  Matches,
  Min,
  Max,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// ENUMS
// ============================================

export enum UserRole {
  ATHLETE = 'athlete',
  COACH = 'coach',
  DIRECTOR = 'director',
  ADMIN = 'admin',
  /** @deprecated Maps to COACH */
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  RECRUITER = 'coach',
  /** @deprecated Maps to ATHLETE */
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  PARENT = 'athlete',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  NON_BINARY = 'non-binary',
  PREFER_NOT_TO_SAY = 'prefer-not-to-say',
}

// ============================================
// NESTED DTOs
// ============================================

export class LocationDto {
  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  @Length(2, 2, { message: 'State must be 2-letter code' })
  @Matches(/^[A-Z]{2}$/, { message: 'State must be uppercase 2-letter code (e.g., CA, NY)' })
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{5}(-\d{4})?$/, { message: 'Invalid ZIP code format' })
  zip?: string;
}

export class ContactInfoDto {
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format (E.164)' })
  phone?: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsOptional()
  secondaryEmail?: string;
}

export class SportProfileDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 50, { message: 'Sport name must be between 2 and 50 characters' })
  sport!: string;

  @IsInt()
  @Min(0)
  @Max(10)
  order!: number;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(5, { message: 'Maximum 5 positions allowed' })
  @IsString({ each: true })
  positions?: string[];

  @IsString()
  @IsOptional()
  teamName?: string;

  @IsString()
  @IsOptional()
  teamType?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;
}

export class ConnectedSourceDto {
  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsString()
  @IsNotEmpty()
  profileUrl!: string;

  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @IsOptional()
  syncStatus?: string;

  @IsString()
  @IsOptional()
  scopeType?: string;

  @IsString()
  @IsOptional()
  scopeId?: string;

  @IsInt()
  @IsOptional()
  displayOrder?: number;
}

// ============================================
// CREATE USER DTOs
// ============================================

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(20, 128, { message: 'UID must be valid Firebase Auth UID' })
  uid!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email!: string;

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
  @Length(0, 500, { message: 'About me cannot exceed 500 characters' })
  aboutMe?: string;

  @IsEnum(Gender, { message: 'Invalid gender value' })
  @IsOptional()
  gender?: Gender;

  @IsEnum(UserRole, { message: 'Invalid role' })
  @IsOptional()
  role?: UserRole;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SportProfileDto)
  sports?: SportProfileDto[];

  @IsInt()
  @Min(0)
  @IsOptional()
  activeSportIndex?: number;

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

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConnectedSourceDto)
  connectedSources?: ConnectedSourceDto[];

  @IsString()
  @IsOptional()
  @Length(6, 20, { message: 'Team code must be between 6 and 20 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Team code must contain only uppercase letters and numbers' })
  teamCode?: string;

  @IsString()
  @IsOptional()
  referralId?: string;

  @IsString()
  @IsOptional()
  referralSource?: string;

  @IsString()
  @IsOptional()
  referralDetails?: string;

  @IsBoolean()
  @IsOptional()
  onboardingCompleted?: boolean;

  // Athlete-specific
  @IsObject()
  @IsOptional()
  athlete?: {
    classOf?: number;
  };

  // Coach-specific
  @IsObject()
  @IsOptional()
  coach?: {
    title?: string;
    organization?: string;
  };
}

// ============================================
// JOIN TEAM DTO
// ============================================

export class JoinTeamDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 20, { message: 'Team code must be between 6 and 20 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Team code must contain only uppercase letters and numbers' })
  code!: string;
}

// ============================================
// VALIDATE TEAM CODE DTO
// ============================================

export class ValidateTeamCodeDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 20, { message: 'Team code must be between 6 and 20 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Team code must contain only uppercase letters and numbers' })
  code!: string;
}

// Onboarding DTOs moved to onboarding.dto.ts
// See: BulkOnboardingDto, OnboardingStepDto

// ============================================
// LOGIN & AUTHENTICATION DTOs
// ============================================

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 128, { message: 'Password must be between 6 and 128 characters' })
  password!: string;

  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 50, { message: 'First name must be between 2 and 50 characters' })
  @Matches(/^[a-zA-Z\s'-]+$/, {
    message: 'First name can only contain letters, spaces, hyphens, and apostrophes',
  })
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50, { message: 'Last name must be between 2 and 50 characters' })
  @Matches(/^[a-zA-Z\s'-]+$/, {
    message: 'Last name can only contain letters, spaces, hyphens, and apostrophes',
  })
  lastName!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
  })
  password!: string;

  @IsString()
  @IsOptional()
  @Length(6, 20, { message: 'Team code must be between 6 and 20 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Team code must contain only uppercase letters and numbers' })
  teamCode?: string;
}

export class ConnectMicrosoftDto {
  /** Authorization code from Microsoft OAuth redirect (recommended for long-term access) */
  @IsString({ message: 'code must be a string' })
  @IsOptional()
  code?: string;

  /** Redirect URI used in OAuth flow (required when using code) */
  @IsString({ message: 'redirectUri must be a string' })
  @IsOptional()
  redirectUri?: string;

  /** Microsoft accessToken from native or web popup sign-in (fallback for mobile) */
  @IsString({ message: 'accessToken must be a string' })
  @IsOptional()
  accessToken?: string;

  /** Microsoft refreshToken (optional - for long-term email sending access) */
  @IsString({ message: 'refreshToken must be a string' })
  @IsOptional()
  refreshToken?: string;
}

export class ConnectGmailDto {
  /** Native mobile / Browser OAuth flow — exchange for refresh_token */
  @IsString({ message: 'serverAuthCode must be a string' })
  @IsOptional()
  serverAuthCode?: string;

  /** Web/PWA flow — access_token from signInWithPopup (refreshed on each login) */
  @IsString({ message: 'accessToken must be a string' })
  @IsOptional()
  accessToken?: string;

  /**
   * Redirect URI used in the Browser OAuth flow (mobile).
   * When provided alongside serverAuthCode, the backend uses this URI
   * in the token exchange instead of the empty-string native fallback.
   */
  @IsString({ message: 'redirectUri must be a string' })
  @IsOptional()
  redirectUri?: string;
}

export class ConnectYahooDto {
  /** Authorization code from Yahoo OAuth redirect */
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  /** Redirect URI used in OAuth flow (must match exactly) */
  @IsString({ message: 'redirectUri must be a string' })
  @IsNotEmpty({ message: 'redirectUri is required' })
  redirectUri!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
  })
  newPassword!: string;
}
