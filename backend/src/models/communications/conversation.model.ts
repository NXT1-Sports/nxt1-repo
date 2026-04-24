/**
 * @fileoverview Conversation Mongoose Model
 * @module @nxt1/backend/models/conversation
 *
 * Mongoose schema and model for the `conversations` collection.
 * Each document represents a messaging conversation (direct, group, team, or coach).
 *
 * Email-sourced conversations link to external email threads via
 * `emailProvider` and `externalThreadId` fields, enabling seamless
 * two-way sync with Gmail, Microsoft, and Yahoo inboxes.
 *
 * Indexes:
 * - { 'participants.userId': 1, updatedAt: -1 }  → Conversation list per user
 * - { emailProvider: 1, externalThreadId: 1 }      → Deduplicate synced threads
 * - { updatedAt: -1 }                              → Global sort
 */

import { model, Schema, type Model } from 'mongoose';

// ─── Sub-schemas ────────────────────────────────────────────────────────────

/** Participant stored inside a conversation document. */
interface IConversationParticipant {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: string;
  isVerified?: boolean;
  email?: string;
}

/** Last message preview embedded in the conversation. */
interface ILastMessage {
  body: string;
  senderName: string;
  timestamp: string;
  isOwn: boolean;
}

// ─── Main Document Interface ────────────────────────────────────────────────

export interface IConversation {
  /** Conversation type discriminator */
  type: 'direct' | 'group' | 'team' | 'coach';
  /** Display title (group name, or recipient name for DMs) */
  title: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Participants in this conversation */
  participants: IConversationParticipant[];
  /** Embedded last message preview */
  lastMessage?: ILastMessage;
  /** Per-user unread counts: { [userId]: number } */
  unreadCounts: Map<string, number>;
  /** Per-user mute flags */
  mutedBy: string[];
  /** Per-user pin flags */
  pinnedBy: string[];
  /** Whether a verified participant exists */
  hasVerifiedParticipant?: boolean;
  /** Email provider that originated this conversation (null for platform-native) */
  emailProvider?: 'gmail' | 'microsoft' | 'yahoo';
  /** External thread ID from the email provider (for dedup) */
  externalThreadId?: string;
  /** Email subject line (used for email-sourced conversations) */
  emailSubject?: string;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const ParticipantSchema = new Schema<IConversationParticipant>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    role: {
      type: String,
      required: true,
      enum: ['athlete', 'coach', 'director', 'admin'],
    },
    isVerified: { type: Boolean },
    email: { type: String },
  },
  { _id: false, versionKey: false }
);

const LastMessageSchema = new Schema<ILastMessage>(
  {
    body: { type: String, required: true },
    senderName: { type: String, required: true },
    timestamp: { type: String, required: true },
    isOwn: { type: Boolean, default: false },
  },
  { _id: false, versionKey: false }
);

// ─── Main Schema ────────────────────────────────────────────────────────────

const ConversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      required: true,
      enum: ['direct', 'group', 'team', 'coach'],
    },
    title: { type: String, required: true },
    avatarUrl: { type: String },
    participants: { type: [ParticipantSchema], required: true },
    lastMessage: { type: LastMessageSchema },
    unreadCounts: { type: Map, of: Number, default: new Map() },
    mutedBy: { type: [String], default: [] },
    pinnedBy: { type: [String], default: [] },
    hasVerifiedParticipant: { type: Boolean },
    emailProvider: { type: String, enum: ['gmail', 'microsoft', 'yahoo'] },
    externalThreadId: { type: String },
    emailSubject: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Primary: user's conversation list sorted by recency
ConversationSchema.index({ 'participants.userId': 1, updatedAt: -1 });

// Email thread deduplication (sparse — most conversations are platform-native)
ConversationSchema.index({ emailProvider: 1, externalThreadId: 1 }, { sparse: true, unique: true });

// Global sort by update time
ConversationSchema.index({ updatedAt: -1 });

// ─── Model ──────────────────────────────────────────────────────────────────

export const ConversationModel: Model<IConversation> = model<IConversation>(
  'Conversation',
  ConversationSchema
);
