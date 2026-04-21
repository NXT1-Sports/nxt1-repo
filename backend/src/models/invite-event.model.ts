/**
 * @fileoverview Invite Event MongoDB model
 * @module @nxt1/backend/models/invite-event
 */

import mongoose, { type Model } from 'mongoose';
import type { InviteChannel, InviteStatus, InviteType } from '@nxt1/core';
import type { RuntimeEnvironment } from '../config/runtime-environment.js';

const { model, models, Schema } = mongoose;

export interface InviteEventDocument {
  readonly id: string;
  readonly environment: RuntimeEnvironment;
  readonly inviteCode?: string | null;
  readonly referralCode?: string | null;
  readonly type: InviteType;
  readonly channel: InviteChannel;
  readonly status: InviteStatus;
  readonly recipient: {
    readonly id: string;
    readonly name?: string | null;
    readonly phone?: string | null;
    readonly email?: string | null;
  };
  readonly senderId: string;
  readonly teamId?: string | null;
  readonly teamCode?: string | null;
  readonly teamName?: string | null;
  readonly message?: string | null;
  readonly acceptedByUid?: string | null;
  readonly acceptedAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const InviteEventSchema = new Schema<InviteEventDocument>(
  {
    id: { type: String, required: true, index: true, unique: true },
    environment: { type: String, required: true, enum: ['staging', 'production'], index: true },
    inviteCode: { type: String, default: null, index: true },
    referralCode: { type: String, default: null, index: true },
    type: {
      type: String,
      required: true,
      enum: ['general', 'team', 'profile', 'event', 'recruit', 'referral'],
      index: true,
    },
    channel: {
      type: String,
      required: true,
      enum: [
        'sms',
        'email',
        'whatsapp',
        'messenger',
        'instagram',
        'twitter',
        'copy_link',
        'qr_code',
        'contacts',
        'airdrop',
      ],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'viewed', 'accepted', 'declined', 'expired'],
      index: true,
    },
    recipient: {
      type: {
        id: { type: String, required: true },
        name: { type: String, default: null },
        phone: { type: String, default: null },
        email: { type: String, default: null },
      },
      required: true,
      _id: false,
    },
    senderId: { type: String, required: true, index: true },
    teamId: { type: String, default: null, index: true },
    teamCode: { type: String, default: null, index: true },
    teamName: { type: String, default: null },
    message: { type: String, default: null },
    acceptedByUid: { type: String, default: null, index: true },
    acceptedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
  },
  {
    versionKey: false,
    collection: 'inviteEvents',
    timestamps: true,
  }
);

InviteEventSchema.index({ environment: 1, senderId: 1, createdAt: -1 });
InviteEventSchema.index({ environment: 1, senderId: 1, status: 1, createdAt: -1 });
InviteEventSchema.index({ environment: 1, senderId: 1, channel: 1, createdAt: -1 });
InviteEventSchema.index({ environment: 1, senderId: 1, type: 1, createdAt: -1 });
InviteEventSchema.index({ environment: 1, teamId: 1, status: 1, createdAt: -1 });
InviteEventSchema.index({ environment: 1, referralCode: 1, 'recipient.id': 1, status: 1 });
InviteEventSchema.index({ environment: 1, teamCode: 1, 'recipient.id': 1, status: 1 });

export const InviteEventModel: Model<InviteEventDocument> =
  (models['InviteEvent'] as Model<InviteEventDocument> | undefined) ??
  model<InviteEventDocument>('InviteEvent', InviteEventSchema, 'inviteEvents');
