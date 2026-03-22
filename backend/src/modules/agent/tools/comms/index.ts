/**
 * @fileoverview Communication Tools
 * @module @nxt1/backend/modules/agent/tools/comms
 *
 * Tools for sending messages and managing outreach.
 *
 * Implemented:
 * - AskUserTool             — Suspend execution and ask the user a question
 *
 * Planned tools:
 * - DraftEmailTool          — Write a personalized recruiting email
 * - QueueEmailBatchTool     — Queue multiple emails for sending
 * - SendPushNotificationTool — Trigger a push notification
 * - PostToFeedTool          — Create a social feed post on behalf of the user
 * - ScheduleFollowUpTool   — Schedule a reminder/follow-up action
 */

export { AskUserTool, ASK_USER_CONTEXT_KEY, type AskUserToolContext } from './ask-user.tool.js';
