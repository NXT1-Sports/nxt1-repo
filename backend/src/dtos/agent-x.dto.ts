/**
 * @fileoverview Agent-X AI Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/agent-x
 *
 * DTOs for AI agent and automation endpoints
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  IsObject,
  ValidateNested,
  Min,
  Max,
  Length,
  ArrayMaxSize,
  IsNumber,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// AGENT CHAT DTOs
// ============================================

export enum AgentRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum AgentModel {
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo',
  CLAUDE_3_OPUS = 'claude-3-opus',
  CLAUDE_3_SONNET = 'claude-3-sonnet',
}

export class ChatMessageDto {
  @IsEnum(AgentRole)
  @IsNotEmpty()
  role!: AgentRole;

  @IsString()
  @IsNotEmpty()
  @Length(1, 10000)
  content!: string;

  @IsString()
  @IsOptional()
  timestamp?: string;
}

export class AskAgentDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000, { message: 'Intent must be between 1 and 5000 characters' })
  intent!: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @Matches(/^[a-f0-9]{24}$/i, { message: 'threadId must be a valid 24-character hex string' })
  threadId?: string;

  @IsEnum(AgentModel)
  @IsOptional()
  model?: AgentModel;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, string | number | boolean>;
}

export class AgentChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000, { message: 'Message must be between 1 and 5000 characters' })
  message!: string;

  @IsString()
  @IsOptional()
  mode?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-f0-9]{24}$/i, { message: 'threadId must be a valid 24-character hex string' })
  threadId?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  @IsObject()
  @IsOptional()
  userContext?: Record<string, unknown>;
}

export class AgentChatDto {
  @IsArray()
  @IsNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsEnum(AgentModel)
  @IsOptional()
  model?: AgentModel;

  @IsInt()
  @IsOptional()
  @Min(50)
  @Max(4000)
  maxTokens?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;
}

export class CancelAgentTaskDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  reason?: string;
}

// ============================================
// AGENT GOALS DTOs
// ============================================

export enum GoalStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum GoalPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export class AgentGoalDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 200, { message: 'Goal text must be between 1 and 200 characters' })
  text!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsOptional()
  createdAt?: string;
}

export class SetGoalsDto {
  @IsArray()
  @IsNotEmpty()
  @ArrayMaxSize(3, { message: 'Maximum 3 goals allowed' })
  @ValidateNested({ each: true })
  @Type(() => AgentGoalDto)
  goals!: AgentGoalDto[];
}

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title!: string;

  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @IsEnum(GoalPriority)
  @IsOptional()
  priority?: GoalPriority;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message: 'Due date must be in ISO 8601 format',
  })
  dueDate?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateGoalDto {
  @IsString()
  @IsOptional()
  @Length(1, 200)
  title?: string;

  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @IsEnum(GoalStatus)
  @IsOptional()
  status?: GoalStatus;

  @IsEnum(GoalPriority)
  @IsOptional()
  priority?: GoalPriority;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
    message: 'Due date must be in ISO 8601 format',
  })
  dueDate?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];
}

// ============================================
// PLAYBOOK ITEM STATUS DTOs
// ============================================

export enum PlaybookItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETE = 'complete',
  PROBLEM = 'problem',
}

export class UpdatePlaybookItemStatusDto {
  @IsEnum(PlaybookItemStatus, {
    message: 'Status must be one of: pending, in-progress, complete, problem',
  })
  @IsNotEmpty()
  status!: PlaybookItemStatus;
}

export class GenerateBriefingDto {
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

// ============================================
// PLAYBOOK DTOs
// ============================================

export enum PlaybookType {
  RECRUITING = 'recruiting',
  TRAINING = 'training',
  OUTREACH = 'outreach',
  CONTENT_CREATION = 'content-creation',
  ANALYSIS = 'analysis',
}

export class GeneratePlaybookDto {
  @IsEnum(PlaybookType)
  @IsNotEmpty()
  type!: PlaybookType;

  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title!: string;

  @IsString()
  @IsOptional()
  @Length(0, 2000)
  description?: string;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  autoExecute?: boolean;
}

// ============================================
// AGENT CONTROL DTOs
// ============================================

export class PauseAgentDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  reason?: string;

  @IsInt()
  @IsOptional()
  @Min(60)
  @Max(86400) // Max 24 hours
  pauseDurationSeconds?: number;
}

export class ResumeAgentDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;

  @IsBoolean()
  @IsOptional()
  continueCurrentTask?: boolean;
}
