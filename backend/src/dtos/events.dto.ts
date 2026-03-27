/**
 * @fileoverview Events Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/events
 *
 * DTOs for creating and updating events in the Events collection.
 * Events surface as FeedItemEvent in the polymorphic timeline.
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  Matches,
  Length,
} from 'class-validator';

// ============================================
// ENUMS
// ============================================

export enum EventType {
  GAME = 'game',
  CAMP = 'camp',
  VISIT = 'visit',
  TOURNAMENT = 'tournament',
  COMBINE = 'combine',
  TRYOUT = 'tryout',
  PRACTICE = 'practice',
  OTHER = 'other',
}

export enum EventStatus {
  UPCOMING = 'upcoming',
  LIVE = 'live',
  FINAL = 'final',
  POSTPONED = 'postponed',
  CANCELLED = 'cancelled',
}

export enum EventOwnerType {
  USER = 'user',
  TEAM = 'team',
}

export enum DataSource {
  MANUAL = 'manual',
  MAXPREPS = 'maxpreps',
  HUDL = 'hudl',
  AGENT_X = 'agent-x',
}

// ============================================
// CREATE EVENT DTO
// ============================================

export class CreateEventDto {
  @IsEnum(EventType, { message: 'Invalid event type' })
  eventType!: EventType;

  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/, {
    message: 'date must be in ISO 8601 format',
  })
  date!: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/, {
    message: 'endDate must be in ISO 8601 format',
  })
  endDate?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  location?: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  opponent?: string;

  @IsString()
  @IsOptional()
  opponentLogoUrl?: string;

  @IsBoolean()
  @IsOptional()
  isHome?: boolean;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @IsString()
  @IsOptional()
  @Length(0, 50)
  sport?: string;

  @IsString()
  @IsOptional()
  @Length(0, 1000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isAllDay?: boolean;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  graphicUrl?: string;

  @IsString()
  @IsOptional()
  teamId?: string;

  @IsEnum(DataSource)
  @IsOptional()
  source?: DataSource;
}

// ============================================
// UPDATE EVENT DTO
// ============================================

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  @Length(1, 200)
  title?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/, {
    message: 'date must be in ISO 8601 format',
  })
  date?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  location?: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  opponent?: string;

  @IsString()
  @IsOptional()
  opponentLogoUrl?: string;

  @IsBoolean()
  @IsOptional()
  isHome?: boolean;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @IsString()
  @IsOptional()
  @Length(0, 1000)
  description?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  graphicUrl?: string;
}
