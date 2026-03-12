/**
 * @fileoverview Article Feedback Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Tracks user feedback (helpful/not helpful) on help articles.
 * One feedback per user per article (upsert pattern).
 */

import { model, Schema, type Model } from 'mongoose';

export interface ArticleFeedbackDocument {
  readonly articleId: string;
  readonly userId: string;
  readonly isHelpful: boolean;
  readonly feedback?: string;
  readonly createdAt: string;
}

const ArticleFeedbackSchema = new Schema<ArticleFeedbackDocument>(
  {
    articleId: { type: String, required: true },
    userId: { type: String, required: true },
    isHelpful: { type: Boolean, required: true },
    feedback: { type: String, maxlength: 1000 },
    createdAt: { type: String, required: true },
  },
  { versionKey: false, timestamps: false }
);

// One feedback per user per article
ArticleFeedbackSchema.index({ articleId: 1, userId: 1 }, { unique: true });

export const ArticleFeedbackModel: Model<ArticleFeedbackDocument> = model<ArticleFeedbackDocument>(
  'ArticleFeedback',
  ArticleFeedbackSchema
);
