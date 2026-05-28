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
  IsUUID,
  IsUrl,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AGENT_X_MAX_VIDEO_FILE_SIZE } from '@nxt1/core';

const SELECTED_CONTEXT_SUMMARY_MAX_CHARS = 600;

function clampSelectedContextSummary(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length <= SELECTED_CONTEXT_SUMMARY_MAX_CHARS) {
    return trimmed;
  }

  if (SELECTED_CONTEXT_SUMMARY_MAX_CHARS <= 3) {
    return trimmed.slice(0, SELECTED_CONTEXT_SUMMARY_MAX_CHARS);
  }

  return `${trimmed.slice(0, SELECTED_CONTEXT_SUMMARY_MAX_CHARS - 3)}...`;
}

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
  @IsString()
  @IsOptional()
  id?: string;

  @IsEnum(AgentRole)
  @IsNotEmpty()
  role!: AgentRole;

  @IsString()
  @IsNotEmpty()
  // 50 000 chars accommodates long AI responses (markdown reports, code blocks, etc.)
  // that legitimately exceed the previous 10 000-char ceiling when stored in history.
  @Length(1, 50000)
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

export class ChatAttachmentDto {
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  storagePath?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsIn(['image', 'video', 'pdf', 'csv', 'doc', 'app'])
  @IsNotEmpty()
  type!: string;

  @IsNumber()
  @Min(1)
  @Max(AGENT_X_MAX_VIDEO_FILE_SIZE)
  @IsOptional()
  sizeBytes?: number;

  /** Cloudflare Stream video ID — present only for video attachments uploaded via TUS. */
  @IsString()
  @Length(8, 128)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  @IsOptional()
  cloudflareVideoId?: string;

  /** Poster image for Cloudflare-backed video attachments. */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  thumbnailUrl?: string;

  /** Platform name for app attachments (e.g., 'Instagram', 'TikTok', 'YouTube'). */
  @IsString()
  @IsOptional()
  platform?: string;

  /** Profile/account URL for app attachments (e.g., https://instagram.com/username). */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  profileUrl?: string;

  /** Favicon/logo URL for app attachments. */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  faviconUrl?: string;
}

export class SelectedActionDto {
  @IsString()
  @IsNotEmpty()
  coordinatorId!: string;

  @IsString()
  @IsNotEmpty()
  actionId!: string;

  @IsString()
  @IsIn(['command', 'scheduled', 'suggested'])
  surface!: 'command' | 'scheduled' | 'suggested';

  @IsString()
  @IsOptional()
  label?: string;
}

export class ConnectedSourceDto {
  /** Platform name (e.g., 'Hudl', 'Instagram', 'TikTok'). */
  @IsString()
  @IsNotEmpty()
  platform!: string;

  /** Profile/account URL on the connected platform. */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsNotEmpty()
  profileUrl!: string;

  /** Favicon/logo URL for the platform. */
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  faviconUrl?: string;

  /** Optional scope type emitted by the attachments picker context. */
  @IsString()
  @IsIn(['global', 'sport', 'team'])
  @IsOptional()
  scopeType?: 'global' | 'sport' | 'team';

  /** Optional scope identifier when scopeType is sport/team. */
  @IsString()
  @IsOptional()
  scopeId?: string;
}

export class SelectedContextSourceDto {
  @IsString()
  @IsIn(['film_review', 'playbook', 'game_plan', 'agent_x', 'external'])
  type!: 'film_review' | 'playbook' | 'game_plan' | 'agent_x' | 'external';

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  label?: string;
}

export class SelectedContextTimeRangeDto {
  @IsNumber()
  @Min(0)
  startSec!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  endSec?: number;
}

export class SelectedContextEntityRefDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsOptional()
  label?: string;
}

export class SelectedContextMediaDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  videoUrl?: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  imageUrl?: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsOptional()
  thumbnailUrl?: string;

  @IsString()
  @Length(8, 128)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  @IsOptional()
  cloudflareVideoId?: string;
}

export class SelectedContextAnnotationPointDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;
}

export class SelectedContextAnnotationBoundsDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  minX!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  minY!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  maxX!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  maxY!: number;
}

export class SelectedContextAnnotationDto {
  @IsString()
  @IsIn(['freehand'])
  kind!: 'freehand';

  @ValidateNested()
  @Type(() => SelectedContextAnnotationBoundsDto)
  bounds!: SelectedContextAnnotationBoundsDto;

  @IsInt()
  @Min(1)
  strokeCount!: number;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => SelectedContextAnnotationPointDto)
  points?: SelectedContextAnnotationPointDto[];
}

export class SelectedContextDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  id!: string;

  @IsString()
  @IsIn(['film_play', 'playbook_item', 'game_plan_item', 'document', 'custom'])
  kind!: 'film_play' | 'playbook_item' | 'game_plan_item' | 'document' | 'custom';

  @IsString()
  @IsNotEmpty()
  @Length(1, 160)
  title!: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => clampSelectedContextSummary(value))
  @Length(0, 600)
  summary?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedContextSourceDto)
  source?: SelectedContextSourceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedContextTimeRangeDto)
  timeRange?: SelectedContextTimeRangeDto;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SelectedContextEntityRefDto)
  entityRefs?: SelectedContextEntityRefDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedContextMediaDto)
  media?: SelectedContextMediaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedContextAnnotationDto)
  annotation?: SelectedContextAnnotationDto;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, string | number | boolean | null>;
}

export class AgentChatRequestDto {
  @ValidateIf((o) => !o.resumeOperationId)
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

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];

  /**
   * Connected app sources the user selected for this message.
   * Backend injects these as context so Agent X knows which platforms
   * are available for data retrieval or virtual browser navigation.
   */
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConnectedSourceDto)
  connectedSources?: ConnectedSourceDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => SelectedContextDto)
  selectedContexts?: SelectedContextDto[];

  /** Resume streaming for an in-progress heavy task (drop recovery). */
  @IsUUID('4')
  @IsOptional()
  resumeOperationId?: string;

  /** Replay dedup: skip events with seq ≤ this value on reconnect. */
  @IsNumber()
  @IsOptional()
  @Min(0)
  afterSeq?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedActionDto)
  selectedAction?: SelectedActionDto;

  /**
   * Metadata for files that are still uploading when the user hits Send.
   * When present, the backend starts the SSE stream immediately, emits
   * `waiting_for_attachments`, then awaits a subsequent POST to
   * `/agent-x/chat/pending-attachments/:operationId` before enqueueing.
   */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttachmentStubDto)
  attachmentStubs?: AttachmentStubDto[];
}

/**
 * Minimal metadata for a file that is selected but not yet uploaded.
 * Sent alongside (or instead of) fully resolved {@link ChatAttachmentDto} entries.
 */
export class AttachmentStubDto {
  @IsUUID('4')
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(1)
  @Max(AGENT_X_MAX_VIDEO_FILE_SIZE)
  sizeBytes!: number;

  @IsIn(['image', 'video', 'pdf', 'csv', 'doc', 'app'])
  @IsNotEmpty()
  type!: string;
}

/**
 * Body for `POST /agent-x/chat/pending-attachments/:operationId`.
 * Sent by the frontend after background uploads complete to unblock the
 * backend waiter and inject the resolved URLs into the job payload.
 */
export class ResolvePendingAttachmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments!: ChatAttachmentDto[];
}

export class AgentEnqueueRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000, { message: 'Intent must be between 1 and 5000 characters' })
  intent!: string;

  @IsObject()
  @IsOptional()
  userContext?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @Matches(/^[a-f0-9]{24}$/i, { message: 'threadId must be a valid 24-character hex string' })
  threadId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ConnectedSourceDto)
  connectedSources?: ConnectedSourceDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => SelectedContextDto)
  selectedContexts?: SelectedContextDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SelectedActionDto)
  selectedAction?: SelectedActionDto;
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
// AGENT MESSAGE ACTION DTOs
// ============================================

export class SyncAgentMessageAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  @Matches(/^[A-Za-z0-9:_-]+$/, {
    message: 'idempotencyKey must use only letters, numbers, colon, underscore, or hyphen',
  })
  idempotencyKey!: string;

  @ValidateNested()
  @Type(() => ChatAttachmentDto)
  attachment!: ChatAttachmentDto;
}

export class UpdateAgentMessageDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 5000, { message: 'Message must be between 1 and 5000 characters' })
  message!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{24}$/i, { message: 'threadId must be a valid 24-character hex string' })
  threadId!: string;

  @IsString()
  @IsOptional()
  @Length(0, 120)
  reason?: string;
}

export class DeleteAgentMessageDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{24}$/i, { message: 'threadId must be a valid 24-character hex string' })
  threadId!: string;

  @IsBoolean()
  @IsOptional()
  deleteResponse?: boolean;
}

export class UndoAgentMessageDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  restoreTokenId!: string;
}

export class AgentMessageFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: 1 | 2 | 3 | 4 | 5;

  @IsString()
  @IsOptional()
  @IsIn(['helpful', 'incorrect', 'incomplete', 'confusing', 'other'])
  category?: 'helpful' | 'incorrect' | 'incomplete' | 'confusing' | 'other';

  @IsString()
  @IsOptional()
  @Length(0, 500)
  text?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{24}$/i, { message: 'threadId must be a valid 24-character hex string' })
  threadId!: string;
}

export class AgentMessageAnnotationDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['copied', 'viewed'])
  action!: 'copied' | 'viewed';

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
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
// COMPLETE GOAL DTO
// ============================================

export class CompleteGoalDto {
  @IsString()
  @IsOptional()
  @Length(0, 500)
  notes?: string;
}

// ============================================
// PLAYBOOK ITEM STATUS DTOs
// ============================================

export enum PlaybookItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETE = 'complete',
  SNOOZED = 'snoozed',
  PROBLEM = 'problem',
}

export class UpdatePlaybookItemStatusDto {
  @IsEnum(PlaybookItemStatus, {
    message: 'Status must be one of: pending, in-progress, complete, snoozed, problem',
  })
  @IsNotEmpty()
  status!: PlaybookItemStatus;

  @IsString()
  @IsOptional()
  playbookId?: string;
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
