/**
 * @fileoverview Communication Tools
 * @module @nxt1/backend/modules/agent/tools/comms
 *
 * Tools for sending messages and managing outreach.
 *
 * Implemented:
 * - AskUserTool             — Suspend execution and ask the user a question
 * - WriteTimelinePostTool   — Create a social feed post on behalf of the user
 * - ScanTimelinePostsTool   — Scan timeline posts and extract durable facts into memory
 *
 * Planned tools:
 * - DraftEmailTool          — Write a personalized recruiting email
 * - QueueEmailBatchTool     — Queue multiple emails for sending
 * - SendPushNotificationTool — Trigger a push notification
 * - ScheduleFollowUpTool   — Schedule a reminder/follow-up action
 */

export { AskUserTool, ASK_USER_CONTEXT_KEY, type AskUserToolContext } from './ask-user.tool.js';
export { WriteTimelinePostTool } from './write-timeline-post.tool.js';
export { ScanTimelinePostsTool } from './scan-timeline-posts.tool.js';
