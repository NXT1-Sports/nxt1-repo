/**
 * @fileoverview Settings & Preferences Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/settings
 *
 * DTOs for user settings, preferences, and privacy controls
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  ValidateNested,
  IsEmail,
  Matches,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// NOTIFICATION DTOs
// ============================================

export class NotificationChannelPreferencesDto {
  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @IsBoolean()
  @IsOptional()
  sms?: boolean;
}

export class NotificationCategoryPreferencesDto {
  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  @IsOptional()
  social?: NotificationChannelPreferencesDto;

  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  @IsOptional()
  team?: NotificationChannelPreferencesDto;

  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  @IsOptional()
  content?: NotificationChannelPreferencesDto;

  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  @IsOptional()
  system?: NotificationChannelPreferencesDto;

  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  @IsOptional()
  billing?: NotificationChannelPreferencesDto;

  @ValidateNested()
  @Type(() => NotificationChannelPreferencesDto)
  @IsOptional()
  marketing?: NotificationChannelPreferencesDto;
}

export class NotificationQuietHoursDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  startHour?: number;

  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  endHour?: number;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Za-z_]+\/[A-Za-z_/]+$/, {
    message: 'Invalid timezone format. Use IANA timezone (e.g., America/New_York)',
  })
  timezone?: string;
}

export class NotificationCadenceCapsDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  maxPushesPerDay?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  minIntervalMinutes?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxMarketingPushesPerDay?: number;
}

export class NotificationPreferencesDto {
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @IsBoolean()
  @IsOptional()
  sms?: boolean;

  @IsBoolean()
  @IsOptional()
  marketing?: boolean;

  @ValidateNested()
  @Type(() => NotificationCategoryPreferencesDto)
  @IsOptional()
  categoryPreferences?: NotificationCategoryPreferencesDto;

  @ValidateNested()
  @Type(() => NotificationQuietHoursDto)
  @IsOptional()
  quietHours?: NotificationQuietHoursDto;

  @ValidateNested()
  @Type(() => NotificationCadenceCapsDto)
  @IsOptional()
  cadenceCaps?: NotificationCadenceCapsDto;
}

export class UpdateNotificationPreferencesDto {
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  @IsOptional()
  preferences?: NotificationPreferencesDto;
}

// ============================================
// PRIVACY DTOs
// ============================================

export enum ProfileVisibility {
  PUBLIC = 'public',
  TEAMMATES_ONLY = 'teammates-only',
  PRIVATE = 'private',
}

export enum MessagePrivacy {
  EVERYONE = 'everyone',
  TEAMMATES = 'teammates',
  NO_ONE = 'no-one',
}

export class PrivacySettingsDto {
  @IsEnum(ProfileVisibility)
  @IsOptional()
  profileVisibility?: ProfileVisibility;

  @IsEnum(MessagePrivacy)
  @IsOptional()
  whoCanMessage?: MessagePrivacy;

  @IsBoolean()
  @IsOptional()
  showEmail?: boolean;

  @IsBoolean()
  @IsOptional()
  showPhoneNumber?: boolean;

  @IsBoolean()
  @IsOptional()
  showLocation?: boolean;

  @IsBoolean()
  @IsOptional()
  showBirthday?: boolean;

  @IsBoolean()
  @IsOptional()
  allowTagging?: boolean;

  @IsBoolean()
  @IsOptional()
  showInSearch?: boolean;

  @IsBoolean()
  @IsOptional()
  showOnlineStatus?: boolean;
}

export class UpdatePrivacySettingsDto {
  @ValidateNested()
  @Type(() => PrivacySettingsDto)
  @IsNotEmpty()
  settings!: PrivacySettingsDto;
}

// ============================================
// ACCOUNT SETTINGS DTOs
// ============================================

export enum Language {
  EN = 'en',
  ES = 'es',
  FR = 'fr',
  DE = 'de',
  PT = 'pt',
  JA = 'ja',
  KO = 'ko',
  ZH = 'zh',
  VI = 'vi',
}

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  AUTO = 'auto',
}

export class UpdateAccountSettingsDto {
  @IsEnum(Language)
  @IsOptional()
  language?: Language;

  @IsEnum(Theme)
  @IsOptional()
  theme?: Theme;

  @IsEmail({}, { message: 'Invalid email format' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format (e.g., +12125551234)',
  })
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{2,4}\/[A-Za-z_/]+$/, {
    message: 'Invalid timezone format',
  })
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  twoFactorEnabled?: boolean;
}

// ============================================
// PROVIDER CONNECTION DTOs
// ============================================

export enum AuthProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
  FACEBOOK = 'facebook',
  APPLE = 'apple',
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
}

export class ConnectProviderDto {
  @IsEnum(AuthProvider)
  @IsNotEmpty()
  provider!: AuthProvider;

  @IsString()
  @IsNotEmpty()
  @Length(10, 2000)
  accessToken!: string;

  @IsString()
  @IsOptional()
  refreshToken?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;
}

export class DisconnectProviderDto {
  @IsEnum(AuthProvider)
  @IsNotEmpty()
  provider!: AuthProvider;

  @IsBoolean()
  @IsOptional()
  revokeAccess?: boolean;
}

// ============================================
// COMPREHENSIVE SETTINGS DTOs
// ============================================

export class UpdateSettingsDto {
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  @IsOptional()
  notifications?: NotificationPreferencesDto;

  @ValidateNested()
  @Type(() => PrivacySettingsDto)
  @IsOptional()
  privacy?: PrivacySettingsDto;

  @IsEnum(Language)
  @IsOptional()
  language?: Language;

  @IsEnum(Theme)
  @IsOptional()
  theme?: Theme;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{2,4}\/[A-Za-z_/]+$/, {
    message: 'Invalid timezone format',
  })
  timezone?: string;
}
