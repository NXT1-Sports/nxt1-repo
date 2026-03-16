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
