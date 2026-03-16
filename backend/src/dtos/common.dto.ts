/**
 * @fileoverview Common Data Transfer Objects (DTOs) for Request Validation
 * @module @nxt1/backend/dtos
 *
 * Type-safe DTOs using class-validator decorators to replace manual validation.
 * These DTOs are used with the validation middleware for structured request validation.
 */

import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  Length,
  IsNotEmpty,
  IsPhoneNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// POST DTOs (replaces manual validation in postValidation.ts)
// ============================================

export enum PostType {
  TEXT = 'text',
  PHOTO = 'photo',
  VIDEO = 'video',
  HIGHLIGHT = 'highlight',
  STATS = 'stats',
  ACHIEVEMENT = 'achievement',
  ANNOUNCEMENT = 'announcement',
  POLL = 'poll',
}

export enum PostVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  TEAM = 'team',
  PRIVATE = 'private',
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000, { message: 'Content must be between 1 and 5000 characters' })
  content!: string;

  @IsEnum(PostType, { message: 'Invalid post type' })
  type!: PostType;

  @IsEnum(PostVisibility, { message: 'Invalid visibility setting' })
  visibility!: PostVisibility;

  // Support legacy 'privacy' field for backwards compatibility
  @IsEnum(PostVisibility, { message: 'Invalid privacy setting' })
  @IsOptional()
  privacy?: PostVisibility;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10, { message: 'Maximum 10 media files allowed' })
  @IsString({ each: true })
  mediaIds?: string[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20, { message: 'Maximum 20 users can be tagged' })
  @IsString({ each: true })
  taggedUserIds?: string[];

  @IsString()
  @IsOptional()
  locationId?: string;

  // Poll support
  @IsOptional()
  poll?: {
    question: string;
    options: string[];
    durationHours: number;
  };

  // Scheduling support
  @IsDateString()
  @IsOptional()
  scheduledFor?: string;
}

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000, { message: 'Comment must be between 1 and 2000 characters' })
  content!: string;

  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsString()
  @IsOptional()
  parentCommentId?: string; // For reply comments
}

// ============================================
// AUTH DTOs
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

// ============================================
// TEAM DTOs (replaces manual validation in teams.routes.ts)
// ============================================

export enum TeamRole {
  ADMINISTRATIVE = 'Administrative',
  COACH = 'Coach',
  ATHLETE = 'Athlete',
  MEDIA = 'Media',
}

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

export class AddTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(TeamRole, { message: 'Invalid team role' })
  role!: TeamRole;
}

// ============================================
// QUERY DTOs (for pagination, filtering, etc.)
// ============================================

export class PaginationDto {
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

export class SearchDto extends PaginationDto {
  @IsString()
  @IsOptional()
  @Length(1, 100, { message: 'Search query must be between 1 and 100 characters' })
  q?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  sortBy?: string;

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

// ============================================
// CONTACT/EMAIL DTOs
// ============================================

export class ContactDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @Length(5, 1000, { message: 'Message must be between 5 and 1000 characters' })
  message!: string;

  @IsString()
  @IsOptional()
  subject?: string;
}
