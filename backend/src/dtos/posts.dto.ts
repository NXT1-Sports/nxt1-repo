/**
 * @fileoverview Posts & Content Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/posts
 *
 * DTOs for post creation, editing, and interaction management
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  IsUrl,
  ValidateNested,
  Min,
  Max,
  Length,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// POST CREATION DTOs
// ============================================

export enum PostVisibility {
  PUBLIC = 'public',
  FOLLOWERS = 'followers',
  TEAM_ONLY = 'team-only',
  PRIVATE = 'private',
}

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

export class PostMediaDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: 'Invalid media URL' })
  url!: string;

  @IsEnum(['image', 'video'])
  @IsNotEmpty()
  type!: 'image' | 'video';

  @IsString()
  @IsOptional()
  @Length(0, 500)
  caption?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  width?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  height?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  durationSeconds?: number;
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
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/, {
    message: 'scheduledFor must be in ISO 8601 format',
  })
  scheduledFor?: string;

  // Keep new fields for compatibility
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostMediaDto)
  media?: PostMediaDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  gameId?: string;

  @IsBoolean()
  @IsOptional()
  allowComments?: boolean;

  @IsBoolean()
  @IsOptional()
  allowSharing?: boolean;
}

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  @Length(1, 5000)
  content?: string;

  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostMediaDto)
  media?: PostMediaDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  allowComments?: boolean;

  @IsBoolean()
  @IsOptional()
  allowSharing?: boolean;
}

// ============================================
// DRAFT DTOs
// ============================================

export class SaveDraftDto {
  @IsString()
  @IsOptional()
  @Length(0, 5000)
  content?: string;

  @IsEnum(PostType)
  @IsOptional()
  type?: PostType;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostMediaDto)
  media?: PostMediaDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsString()
  @IsOptional()
  location?: string;
}

export class PublishDraftDto {
  @IsString()
  @IsNotEmpty()
  draftId!: string;

  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;

  @IsBoolean()
  @IsOptional()
  allowComments?: boolean;

  @IsBoolean()
  @IsOptional()
  allowSharing?: boolean;
}

// ============================================
// SCHEDULING DTOs
// ============================================

export class SchedulePostDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message: 'Scheduled time must be in ISO 8601 format',
  })
  scheduledFor!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 5000)
  content!: string;

  @IsEnum(PostType)
  @IsOptional()
  type?: PostType;

  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PostMediaDto)
  media?: PostMediaDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateScheduledPostDto {
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message: 'Scheduled time must be in ISO 8601 format',
  })
  scheduledFor?: string;

  @IsString()
  @IsOptional()
  @Length(1, 5000)
  content?: string;

  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;
}

// ============================================
// COMMENT DTOs
// ============================================

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content!: string;

  @IsString()
  @IsOptional()
  parentCommentId?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^@[a-zA-Z0-9_]{3,30}$/, { each: true, message: 'Invalid mention format' })
  mentions?: string[];
}

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content!: string;
}

// ============================================
// GAME STATS DTOs
// ============================================

export class GameStatsDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  points?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  assists?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  rebounds?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  steals?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  blocks?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  turnovers?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(999)
  minutesPlayed?: number;
}

export class AttachGameStatsDto {
  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @ValidateNested()
  @Type(() => GameStatsDto)
  @IsNotEmpty()
  stats!: GameStatsDto;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  notes?: string;
}
