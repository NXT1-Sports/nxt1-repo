/**
 * @fileoverview Organization Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/organization
 *
 * DTOs for organization management endpoints
 */

import { IsString, IsNotEmpty, IsOptional, IsEnum, Length } from 'class-validator';

// ============================================
// CREATE TEAM UNDER ORGANIZATION
// ============================================

export enum OrgTeamType {
  HIGH_SCHOOL = 'high-school',
  CLUB = 'club',
  COLLEGE = 'college',
  MIDDLE_SCHOOL = 'middle-school',
  TRAVEL = 'travel',
  ACADEMY = 'academy',
}

/**
 * DTO for creating a new team under an existing organization.
 * POST /api/v1/organizations/:organizationId/teams
 */
export class CreateOrgTeamDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  sport!: string;

  @IsString()
  @IsOptional()
  @IsEnum(OrgTeamType)
  teamType?: OrgTeamType;

  @IsString()
  @IsOptional()
  @Length(0, 100)
  level?: string;

  @IsString()
  @IsOptional()
  coachTitle?: string;
}
