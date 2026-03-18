/**
 * @fileoverview Teams & Invite Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/teams
 *
 * DTOs for team management and invitation endpoints
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsUrl,
  Length,
  Matches,
  ArrayMaxSize,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// TEAM MANAGEMENT DTOs
// ============================================

export enum TeamType {
  HIGH_SCHOOL = 'high-school',
  CLUB = 'club',
  COLLEGE = 'college',
  MIDDLE_SCHOOL = 'middle-school',
  JUCO = 'juco',
  ORGANIZATION = 'organization',
}

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100, { message: 'Team name must be between 2 and 100 characters' })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 20, { message: 'Team code must be between 6 and 20 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Team code must contain only uppercase letters and numbers' })
  code!: string;

  @IsString()
  @IsOptional()
  @Length(0, 500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsString()
  @IsNotEmpty()
  sport!: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsUrl({}, { message: 'Invalid logo URL format' })
  @IsOptional()
  logoUrl?: string;
}

export class UpdateTeamDto {
  @IsString()
  @IsOptional()
  @Length(2, 100, { message: 'Team name must be between 2 and 100 characters' })
  name?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsUrl({}, { message: 'Invalid logo URL format' })
  @IsOptional()
  logoUrl?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class GetTeamsDto {
  @IsString()
  @IsOptional()
  sportName?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(['name', 'traffic', 'created', 'members'])
  @IsOptional()
  sortBy?: 'name' | 'traffic' | 'created' | 'members';

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be a number' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;
}

// ============================================
// TEAM MEMBER DTOs
// ============================================

export enum TeamMemberRole {
  ADMINISTRATIVE = 'Administrative',
  COACH = 'Coach',
  ATHLETE = 'Athlete',
  MEDIA = 'Media',
  PARENT = 'Parent',
}

export class AddTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(TeamMemberRole)
  @IsNotEmpty()
  role!: TeamMemberRole;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  jerseyNumber?: string;
}

export class JoinTeamDto {
  @IsEnum(TeamMemberRole)
  @IsOptional()
  role?: TeamMemberRole;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  lastName!: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phoneNumber?: string;
}

export class InviteMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(TeamMemberRole)
  @IsNotEmpty()
  role!: TeamMemberRole;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  lastName!: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phoneNumber?: string;
}

export class UpdateTeamMemberDto {
  @IsEnum(TeamMemberRole)
  @IsOptional()
  role?: TeamMemberRole;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  jerseyNumber?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class RemoveTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// ============================================
// TEAM MANAGEMENT DTOs
// ============================================

export class UpdateTeamSettingsDto {
  @IsString()
  @IsOptional()
  @Length(2, 100)
  name?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  description?: string;

  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @IsUrl()
  @IsOptional()
  bannerUrl?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  allowJoinRequests?: boolean;

  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  secondaryColor?: string;
}

export class TransferOwnershipDto {
  @IsString()
  @IsNotEmpty()
  newOwnerId!: string;

  @IsString()
  @IsNotEmpty()
  confirmationCode!: string;
}

// ============================================
// INVITE DTOs
// ============================================

export enum InviteType {
  EMAIL = 'email',
  LINK = 'link',
  QR_CODE = 'qr_code',
}

export class CreateInviteLinkDto {
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @IsEnum(TeamMemberRole)
  @IsNotEmpty()
  role!: TeamMemberRole;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Expiry date must be in YYYY-MM-DD format' })
  expiresAt?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1000)
  maxUses?: number;
}

export class SendInviteDto {
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty()
  email!: string;

  @IsEnum(TeamMemberRole)
  @IsNotEmpty()
  role!: TeamMemberRole;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  message?: string;
}

export class InviteRecipientDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty()
  email!: string;

  @IsEnum(TeamMemberRole)
  @IsNotEmpty()
  role!: TeamMemberRole;

  @IsString()
  @IsOptional()
  customMessage?: string;
}

export class SendBulkInvitesDto {
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @IsArray()
  @ArrayMaxSize(100, { message: 'Maximum 100 invites per batch' })
  @ValidateNested({ each: true })
  @Type(() => InviteRecipientDto)
  recipients!: InviteRecipientDto[];

  @IsString()
  @IsOptional()
  @Length(0, 500)
  message?: string;
}

export class ValidateInviteDto {
  @IsString()
  @IsNotEmpty()
  inviteCode!: string;
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  /** Team code to join after accepting (present for team invites) */
  @IsString()
  @IsOptional()
  teamCode?: string;

  /**
   * Role the invitee chose on the /join landing page.
   * Athlete/Parent/Media join automatically; Coach/Administrative are added as pending.
   */
  @IsEnum(TeamMemberRole)
  @IsOptional()
  role?: TeamMemberRole;
}
