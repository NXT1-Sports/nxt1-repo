/**
 * Team and personal scoped semantic chunk index for UniversalFiles.
 *
 * Atlas Search Index (create on the `agentTeamUniversalFileSemantic` collection):
 * ```json
 * {
 *   "fields": [
 *     { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
 *     { "type": "filter", "path": "teamId" },
 *     { "type": "filter", "path": "ownerUserId" },
 *     { "type": "filter", "path": "classificationPrimary" },
 *     { "type": "filter", "path": "route" },
 *     { "type": "filter", "path": "classificationLabels" },
 *     { "type": "filter", "path": "isArchived" }
 *   ]
 * }
 * ```
 */
import { Schema, type Connection, type Model } from 'mongoose';
import { getMongoEnvironmentConnection } from '../../../config/database.config.js';

export const TEAM_UNIVERSAL_FILE_SEMANTIC_MODEL_NAME = 'AgentTeamUniversalFileSemantic';
export const TEAM_UNIVERSAL_FILE_SEMANTIC_COLLECTION_NAME = 'agentTeamUniversalFileSemantic';
export const TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME =
  'agent_team_universal_file_semantic_vector_index';
export const TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_DEFINITION = {
  fields: [
    { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
    { type: 'filter', path: 'teamId' },
    { type: 'filter', path: 'ownerUserId' },
    { type: 'filter', path: 'classificationPrimary' },
    { type: 'filter', path: 'route' },
    { type: 'filter', path: 'classificationLabels' },
    { type: 'filter', path: 'isArchived' },
  ],
} as const;

export interface TeamUniversalFileSemanticChunkDocument {
  _id: string;
  teamId?: string;
  ownerUserId: string;
  fileId: string;
  title: string;
  normalizedTitle: string;
  classificationPrimary?: string;
  classificationLabels?: string[];
  route?: string;
  content: string;
  embedding: number[];
  contentHash: string;
  version: number;
  chunkIndex: number;
  totalChunks: number;
  payloadKind: 'native' | 'pointer';
  sourceKind: 'binary' | 'structured' | 'pointer' | 'metadata';
  isArchived: boolean;
  mimeType?: string;
  sport?: string;
  tags?: string[];
  summary?: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

const TeamUniversalFileSemanticSchema = new Schema<TeamUniversalFileSemanticChunkDocument>(
  {
    teamId: { type: String, default: '', index: true },
    ownerUserId: { type: String, required: true, index: true },
    fileId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    normalizedTitle: { type: String, required: true, index: true },
    classificationPrimary: { type: String, index: true },
    classificationLabels: { type: [String], default: undefined },
    route: { type: String },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true, select: false },
    contentHash: { type: String, required: true, index: true },
    version: { type: Number, required: true, default: 1, index: true },
    chunkIndex: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    payloadKind: { type: String, enum: ['native', 'pointer'], required: true },
    sourceKind: {
      type: String,
      enum: ['binary', 'structured', 'pointer', 'metadata'],
      required: true,
    },
    isArchived: { type: Boolean, required: true, default: false, index: true },
    mimeType: { type: String },
    sport: { type: String },
    tags: { type: [String], default: undefined },
    summary: { type: String },
    sourceRef: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  {
    versionKey: false,
    collection: TEAM_UNIVERSAL_FILE_SEMANTIC_COLLECTION_NAME,
  }
);

TeamUniversalFileSemanticSchema.index({ fileId: 1, version: 1, chunkIndex: 1 }, { unique: true });
TeamUniversalFileSemanticSchema.index({ teamId: 1, classificationPrimary: 1, isArchived: 1 });
TeamUniversalFileSemanticSchema.index({ ownerUserId: 1, teamId: 1, isArchived: 1 });
TeamUniversalFileSemanticSchema.index({ content: 'text', title: 'text', summary: 'text' });

export function getTeamUniversalFileSemanticModel(
  connection: Connection = getMongoEnvironmentConnection()
): Model<TeamUniversalFileSemanticChunkDocument> {
  const existingModel = connection.models[TEAM_UNIVERSAL_FILE_SEMANTIC_MODEL_NAME] as
    Model<TeamUniversalFileSemanticChunkDocument> | undefined;
  if (existingModel) {
    return existingModel;
  }

  return connection.model<TeamUniversalFileSemanticChunkDocument>(
    TEAM_UNIVERSAL_FILE_SEMANTIC_MODEL_NAME,
    TeamUniversalFileSemanticSchema
  );
}

export const TeamUniversalFileSemanticModel = new Proxy(
  {} as Model<TeamUniversalFileSemanticChunkDocument>,
  {
    get(_target, prop) {
      const model = getTeamUniversalFileSemanticModel();
      const value = (model as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === 'function' ? value.bind(model) : value;
    },
    has(_target, prop) {
      const model = getTeamUniversalFileSemanticModel();
      return prop in model;
    },
    getOwnPropertyDescriptor(_target, prop) {
      const model = getTeamUniversalFileSemanticModel() as unknown as Record<PropertyKey, unknown>;
      const value = model[prop];
      if (value === undefined) {
        return undefined;
      }
      return { configurable: true, enumerable: true, writable: true, value };
    },
  }
);
