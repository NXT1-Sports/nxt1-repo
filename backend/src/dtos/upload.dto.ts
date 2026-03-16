/**
 * @fileoverview Upload & Media Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/upload
 *
 * DTOs for file upload and media management endpoints
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsUrl,
  IsArray,
  Min,
  Max,
  Matches,
  ArrayMaxSize,
  Length,
} from 'class-validator';

// ============================================
// UPLOAD DTOs
// ============================================

export enum FileType {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio',
}

export enum UploadPurpose {
  PROFILE_IMAGE = 'profile-image',
  BANNER = 'banner',
  POST_MEDIA = 'post-media',
  TEAM_LOGO = 'team-logo',
  HIGHLIGHT_VIDEO = 'highlight-video',
  DOCUMENT = 'document',
  AVATAR = 'avatar',
}

export class InitiateUploadDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf|doc|docx)$/i, {
    message: 'Invalid filename format or unsupported file type',
  })
  filename!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(image|video|application)\/.+$/, {
    message: 'Invalid content type format',
  })
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(5000000000) // 5GB max
  fileSize!: number;

  @IsEnum(UploadPurpose)
  @IsNotEmpty()
  purpose!: UploadPurpose;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CompleteUploadDto {
  @IsString()
  @IsNotEmpty()
  uploadId!: string;

  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10000) // S3 multipart upload can have up to 10,000 parts
  @IsString({ each: true })
  etags?: string[];
}

export class GenerateSignedUrlDto {
  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @IsInt()
  @IsOptional()
  @Min(60)
  @Max(604800) // 7 days max
  expiresIn?: number; // seconds
}

// ============================================
// VIDEO DTOs
// ============================================

export enum VideoVisibility {
  PUBLIC = 'public',
  UNLISTED = 'unlisted',
  PRIVATE = 'private',
  TEAM_ONLY = 'team-only',
}

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title!: string;

  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @IsUrl({}, { message: 'Invalid video URL' })
  @IsNotEmpty()
  videoUrl!: string;

  @IsUrl({}, { message: 'Invalid thumbnail URL' })
  @IsOptional()
  thumbnailUrl?: string;

  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  @IsString()
  @IsOptional()
  sport?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsInt()
  @IsOptional()
  @Min(0)
  durationSeconds?: number;
}

export class UpdateVideoDto {
  @IsString()
  @IsOptional()
  @Length(1, 200)
  title?: string;

  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @IsUrl({}, { message: 'Invalid thumbnail URL' })
  @IsOptional()
  thumbnailUrl?: string;

  @IsEnum(VideoVisibility)
  @IsOptional()
  visibility?: VideoVisibility;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class TrackVideoViewDto {
  @IsString()
  @IsNotEmpty()
  videoId!: string;

  @IsInt()
  @Min(0)
  watchTimeSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  completionPercentage!: number;
}

// ============================================
// IMAGE PROCESSING DTOs
// ============================================

export enum ImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

export class ProcessImageDto {
  @IsUrl({}, { message: 'Invalid image URL' })
  @IsNotEmpty()
  imageUrl!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(4000)
  width?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(4000)
  height?: number;

  @IsEnum(ImageFormat)
  @IsOptional()
  format?: ImageFormat;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  quality?: number;
}
