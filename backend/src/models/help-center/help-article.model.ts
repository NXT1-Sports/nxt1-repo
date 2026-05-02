/**
 * @fileoverview Help Article Mongoose Model
 * @module @nxt1/backend/models/help-center
 *
 * Mongoose schema for help center articles.
 * Maps to HelpArticle type from @nxt1/core.
 */

import { Schema, type Model, type Connection } from 'mongoose';
import type { HelpArticle, HelpContentType } from '@nxt1/core';
import { getMongoGlobalConnection } from '../../config/database.config.js';

/**
 * Stored article document (writable version of HelpArticle + isPublished flag)
 */
export interface HelpArticleDocument extends Omit<HelpArticle, 'id'> {
  readonly isPublished: boolean;
  readonly lastAgentRefresh?: Date | null;
}

const ArticleTableOfContentsSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    level: { type: Number, enum: [1, 2, 3], required: true },
  },
  { _id: false, versionKey: false }
);

const RelatedContentSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['article', 'video', 'faq', 'guide', 'tutorial'], required: true },
    thumbnailUrl: { type: String },
    category: { type: String, required: true },
  },
  { _id: false, versionKey: false }
);

const SeoSchema = new Schema(
  {
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: { type: [String] },
  },
  { _id: false, versionKey: false }
);

const HELP_ARTICLE_MODEL_NAME = 'HelpArticle';

const HelpArticleSchema = new Schema<HelpArticleDocument>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ['article', 'video', 'faq', 'guide', 'tutorial'] satisfies HelpContentType[],
      required: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    tags: { type: [String], default: [] },
    targetUsers: {
      type: [String],
      default: ['all'],
      index: true,
    },
    heroImageUrl: { type: String },
    thumbnailUrl: { type: String },
    videoUrl: { type: String },
    videoDuration: { type: Number },
    readingTimeMinutes: { type: Number, required: true, default: 1 },
    tableOfContents: { type: [ArticleTableOfContentsSchema], default: [] },
    relatedContent: { type: [RelatedContentSchema], default: [] },
    publishedAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    viewCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isNew: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true, index: true },
    lastAgentRefresh: { type: Date, default: null, index: true },
    seo: { type: SeoSchema },
  },
  { versionKey: false, timestamps: false, suppressReservedKeysWarning: true }
);

// Text index for full-text search
HelpArticleSchema.index(
  { title: 'text', excerpt: 'text', tags: 'text', content: 'text' },
  {
    weights: { title: 10, tags: 5, excerpt: 3, content: 1 },
    name: 'help_article_text_search',
  }
);

// Compound index for category listing
HelpArticleSchema.index({ category: 1, isPublished: 1, publishedAt: -1 });

export function getHelpArticleModel(
  connection: Connection = getMongoGlobalConnection()
): Model<HelpArticleDocument> {
  const existingModel = connection.models[HELP_ARTICLE_MODEL_NAME] as
    | Model<HelpArticleDocument>
    | undefined;
  if (existingModel) return existingModel;

  return connection.model<HelpArticleDocument>(HELP_ARTICLE_MODEL_NAME, HelpArticleSchema);
}

export const HelpArticleModel = new Proxy({} as Model<HelpArticleDocument>, {
  get(_target, prop) {
    const model = getHelpArticleModel();
    const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? value.bind(model) : value;
  },
  has(_target, prop) {
    const model = getHelpArticleModel();
    return prop in model;
  },
  getOwnPropertyDescriptor(_target, prop) {
    const model = getHelpArticleModel() as unknown as Record<PropertyKey, unknown>;
    const value = model[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
