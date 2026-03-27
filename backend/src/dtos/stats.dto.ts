/**
 * @fileoverview Player Stats Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/stats
 *
 * DTOs for creating and updating stats in the PlayerStats collection.
 * Stats surface as FeedItemStat in the polymorphic timeline.
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  Length,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// ENUMS
// ============================================

export enum DataSource {
  MANUAL = 'manual',
  MAXPREPS = 'maxpreps',
  HUDL = 'hudl',
  AGENT_X = 'agent-x',
}

// ============================================
// NESTED DTOs
// ============================================

export class StatEntryDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  field!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  label!: string;

  @IsNotEmpty()
  value!: string | number;

  @IsString()
  @IsOptional()
  @Length(0, 20)
  unit?: string;

  @IsString()
  @IsOptional()
  @Length(0, 50)
  category?: string;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;

  @IsString()
  @IsOptional()
  verifiedBy?: string;
}

// ============================================
// UPSERT PLAYER STATS DTO
// ============================================

/**
 * Upsert player stats for a specific sport + season.
 * Document ID = `${userId}_${sportId}_${season}`
 */
export class UpsertPlayerStatsDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  sportId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  season!: string;

  @IsString()
  @IsOptional()
  @Length(0, 50)
  position?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one stat entry is required' })
  @ArrayMaxSize(100, { message: 'Maximum 100 stat entries allowed' })
  @ValidateNested({ each: true })
  @Type(() => StatEntryDto)
  stats!: StatEntryDto[];

  @IsEnum(DataSource)
  @IsOptional()
  source?: DataSource;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;
}

// ============================================
// ADD GAME LOG DTO
// ============================================

export class GameLogStatDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsNotEmpty()
  value!: string | number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsBoolean()
  @IsOptional()
  isHighlight?: boolean;
}

export class AddGameLogDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  sportId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  season!: string;

  @IsString()
  @IsNotEmpty()
  gameDate!: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  opponent?: string;

  @IsString()
  @IsOptional()
  @Length(0, 20)
  gameResult?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GameLogStatDto)
  stats!: GameLogStatDto[];
}
