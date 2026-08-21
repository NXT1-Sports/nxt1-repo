/**
 * @fileoverview Article Feedback Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Tracks user feedback (helpful/not helpful) on help articles.
 * One feedback per user per article (upsert pattern).
 */

import { Schema, type Model, type Connection } from 'mongoose';
import { getMongoGlobalConnection } from '../../config/database.config.js';

export interface ArticleFeedbackDocument {
  readonly articleId: string;
  readonly userId: string;
  readonly isHelpful: boolean;
  readonly feedback?: string;
  readonly createdAt: string;
}

const ARTICLE_FEEDBACK_MODEL_NAME = 'ArticleFeedback';

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

export function getArticleFeedbackModel(
  connection: Connection = getMongoGlobalConnection()
): Model<ArticleFeedbackDocument> {
  const existingModel = connection.models[ARTICLE_FEEDBACK_MODEL_NAME] as
    | Model<ArticleFeedbackDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<ArticleFeedbackDocument>(
    ARTICLE_FEEDBACK_MODEL_NAME,
    ArticleFeedbackSchema
  );
}

export const ArticleFeedbackModel = new Proxy({} as Model<ArticleFeedbackDocument>, {
  get(_target, prop) {
    const model = getArticleFeedbackModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getArticleFeedbackModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getArticleFeedbackModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
