/**
 * @fileoverview Social & Activity Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/social
 *
 * DTOs for feed, activity, and social interaction endpoints
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';

// ============================================
// ACTIVITY DTOs
// ============================================

export class MarkActivityReadDto {
  @IsArray()
  @ArrayMaxSize(100, { message: 'Maximum 100 activities can be marked at once' })
  @IsString({ each: true })
  ids!: string[];
}

export class MarkAllActivityReadDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(['alerts', 'analytics'])
  tab!: string;
}

export class ArchiveActivityDto {
  @IsArray()
  @ArrayMaxSize(100, { message: 'Maximum 100 activities can be archived at once' })
  @IsString({ each: true })
  ids!: string[];
}

export class RestoreActivityDto {
  @IsArray()
  @ArrayMaxSize(100, { message: 'Maximum 100 activities can be restored at once' })
  @IsString({ each: true })
  ids!: string[];
}

// ============================================
// POST INTERACTION DTOs
// ============================================

export class LikePostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;
}

export class SharePostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsEnum(['public', 'team', 'private'])
  @IsOptional()
  visibility?: string;
}

export class ReportPostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsEnum(['spam', 'inappropriate', 'harassment', 'false-information', 'other'])
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsOptional()
  details?: string;
}

export class HidePostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;
}

export class PinPostDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;
}

export class TrackPostViewDto {
  @IsString()
  @IsNotEmpty()
  postId!: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  durationSeconds?: number;
}

// ============================================
// NEWS INTERACTION DTOs
// ============================================

export class BookmarkNewsDto {
  @IsString()
  @IsNotEmpty()
  newsId!: string;
}

export class TrackNewsProgressDto {
  @IsString()
  @IsNotEmpty()
  newsId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number; // 0-100%
}

export class UpdateNewsProgressDto {
  @IsInt()
  @Min(0, { message: 'Progress must be at least 0' })
  @Max(100, { message: 'Progress cannot exceed 100' })
  progress!: number; // 0-100%
}

export class MarkNewsReadDto {
  @IsString()
  @IsNotEmpty()
  newsId!: string;
}
