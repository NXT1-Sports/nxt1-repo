/**
 * @fileoverview Message Mongoose Model
 * @module @nxt1/backend/models/message
 *
 * Mongoose schema and model for the `messages` collection.
 * Each document is a single message within a Conversation — either
 * a platform-native message or one synced from an email provider.
 *
 * Indexes:
 * - { conversationId, createdAt: 1 }       → Chronological thread listing
 * - { senderId, createdAt: -1 }             → User's sent messages
 * - { externalMessageId: 1 }                → Deduplicate synced emails (sparse)
 */

import { model, Schema, type Model } from 'mongoose';

// ─── Sub-schemas ────────────────────────────────────────────────────────────

interface IMessageSender {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: string;
  isVerified?: boolean;
  email?: string;
}

interface IMessageAttachment {
  type: 'image' | 'video' | 'file' | 'link';
  name: string;
  url: string;
  thumbnailUrl?: string;
  size?: number;
  mimeType?: string;
}

interface IReplyTo {
  messageId: string;
  senderName: string;
  preview: string;
}

// ─── Main Document Interface ────────────────────────────────────────────────

export interface IMessage {
  conversationId: string;
  sender: IMessageSender;
  body: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: IMessageAttachment[];
  replyTo?: IReplyTo;
  /** Email provider that originated this message (null for platform-native) */
  emailProvider?: 'gmail' | 'microsoft' | 'yahoo';
  /** External message ID from the email provider (for dedup) */
  externalMessageId?: string;
  /** Raw email headers (From, To, Subject, Date, Message-ID) for traceability */
  emailHeaders?: Record<string, string>;
  createdAt: string;
}

// ─── Sub-schemas ────────────────────────────────────────────────────────────

const SenderSchema = new Schema<IMessageSender>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    role: {
      type: String,
      required: true,
      enum: ['athlete', 'coach', 'recruiter', 'parent', 'admin'],
    },
    isVerified: { type: Boolean },
    email: { type: String },
  },
  { _id: false, versionKey: false }
);

const AttachmentSchema = new Schema<IMessageAttachment>(
  {
    type: { type: String, required: true, enum: ['image', 'video', 'file', 'link'] },
    name: { type: String, required: true },
    url: { type: String, required: true },
    thumbnailUrl: { type: String },
    size: { type: Number },
    mimeType: { type: String },
  },
  { _id: false, versionKey: false }
);

const ReplyToSchema = new Schema<IReplyTo>(
  {
    messageId: { type: String, required: true },
    senderName: { type: String, required: true },
    preview: { type: String, required: true },
  },
  { _id: false, versionKey: false }
);

// ─── Main Schema ────────────────────────────────────────────────────────────

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: String, required: true, index: true },
    sender: { type: SenderSchema, required: true },
    body: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    attachments: { type: [AttachmentSchema] },
    replyTo: { type: ReplyToSchema },
    emailProvider: { type: String, enum: ['gmail', 'microsoft', 'yahoo'] },
    externalMessageId: { type: String },
    emailHeaders: { type: Schema.Types.Mixed },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Chronological thread listing (primary query)
MessageSchema.index({ conversationId: 1, createdAt: 1 });

// User's sent messages sorted by recency
MessageSchema.index({ 'sender.userId': 1, createdAt: -1 });

// Email deduplication (sparse — platform messages won't have this)
MessageSchema.index({ externalMessageId: 1 }, { sparse: true, unique: true });

// ─── Model ──────────────────────────────────────────────────────────────────

export const MessageModel: Model<IMessage> = model<IMessage>('Message', MessageSchema);
