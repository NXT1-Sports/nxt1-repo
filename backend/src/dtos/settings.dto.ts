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
  ValidateNested,
  IsEmail,
  Matches,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// NOTIFICATION DTOs
// ============================================

export class NotificationPreferencesDto {
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  pushNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  smsNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  postLikes?: boolean;

  @IsBoolean()
  @IsOptional()
  postComments?: boolean;

  @IsBoolean()
  @IsOptional()
  postShares?: boolean;

  @IsBoolean()
  @IsOptional()
  teamInvites?: boolean;

  @IsBoolean()
  @IsOptional()
  teamUpdates?: boolean;

  @IsBoolean()
  @IsOptional()
  messages?: boolean;

  @IsBoolean()
  @IsOptional()
  weeklyDigest?: boolean;

  @IsBoolean()
  @IsOptional()
  marketingEmails?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  @IsOptional()
  preferences?: NotificationPreferencesDto;

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Quiet hours must be in HH:MM format (24-hour)',
  })
  quietHoursStart?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Quiet hours must be in HH:MM format (24-hour)',
  })
  quietHoursEnd?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{2,4}\/[A-Za-z_/]+$/, {
    message: 'Invalid timezone format. Use IANA timezone (e.g., America/New_York)',
  })
  timezone?: string;
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

  @IsBoolean()
  @IsOptional()
  allowComments?: boolean;
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
