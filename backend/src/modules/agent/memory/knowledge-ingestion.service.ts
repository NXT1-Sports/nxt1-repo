/**
 * @fileoverview Knowledge Ingestion Service — Document Chunking & Embedding
 * @module @nxt1/backend/modules/agent/memory
 *
 * Handles the ingestion pipeline for the global knowledge base:
 *   1. Accept raw text content (from PDFs, URLs, manual input, Help Center)
 *   2. Compute a content hash for deduplication and versioning
 *   3. Chunk the document into token-sized pieces with overlap
 *   4. Embed each chunk via OpenRouter (text-embedding-3-small, 1536 dims)
 *   5. Upsert into MongoDB `agentGlobalKnowledge` collection
 *   6. Delete stale chunks from previous versions of the same source
 *
 * Re-ingestion strategy:
 * - Same content hash → skip (idempotent, no wasted embeddings)
 * - Different content hash, same sourceRef → increment version, delete old chunks
 * - New sourceRef → insert as version 1
 *
 * @example
 * ```ts
 * const ingestion = new KnowledgeIngestionService(llm);
 * const result = await ingestion.ingest({
 *   content: pdfTextContent,
 *   category: 'ncaa_rules',
 *   source: 'pdf',
 *   title: 'NCAA Division I Manual 2025-26',
 *   sourceRef: 'https://ncaa.org/d1-manual-2025-26.pdf',
 *   chunkSize: 512,
 *   chunkOverlap: 64,
 * });
 * // → { chunksCreated: 48, title: '...', category: 'ncaa_rules', version: 2 }
 * ```
 */

import { createHash } from 'node:crypto';
import type {
  KnowledgeCategory,
  KnowledgeSourceType,
  KnowledgeIngestionRequest,
  KnowledgeIngestionResult,
} from '@nxt1/core';
import { getGlobalKnowledgeModel } from './global-knowledge.model.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { logger } from '../../../utils/logger.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default chunk size in characters (~128 tokens at ~4 chars/token = 512 tokens). */
const DEFAULT_CHUNK_SIZE = 2048;

/** Default overlap in characters (~16 tokens). */
const DEFAULT_CHUNK_OVERLAP = 256;

/** Maximum concurrent embedding calls to avoid rate limiting. */
const EMBEDDING_CONCURRENCY = 10;

// ─── Service ──────────────────────────────────────────────────────────────────

export class KnowledgeIngestionService {
  private readonly llm: OpenRouterService;

  constructor(llm: OpenRouterService) {
    this.llm = llm;
  }

  /**
   * Ingest a document into the global knowledge base.
   *
   * Flow:
   *   1. Hash the content for deduplication
   *   2. Check if this exact content already exists (skip if so)
   *   3. Chunk the content with overlap
   *   4. Embed all chunks in parallel (batched)
   *   5. Insert new chunks
   *   6. Delete stale chunks from previous versions
   */
  async ingest(request: KnowledgeIngestionRequest): Promise<KnowledgeIngestionResult> {
    const GlobalKnowledgeModel = getGlobalKnowledgeModel();
    const {
      content,
      category,
      source,
      title,
      sourceRef,
      metadata,
      chunkSize = DEFAULT_CHUNK_SIZE,
      chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    } = request;

    if (!content || content.trim().length === 0) {
      throw new AgentEngineError('AGENT_VALIDATION_FAILED', 'Cannot ingest empty content');
    }

    const contentHash = this.hashContent(content);
    const now = new Date().toISOString();

    // ── Step 1: Check for existing identical content ─────────────────────
    const existingExact = await GlobalKnowledgeModel.findOne({
      contentHash,
      chunkIndex: 0,
    }).lean();

    if (existingExact) {
      logger.info('[KnowledgeIngestion] Content already ingested (same hash) — skipping', {
        title,
        contentHash,
        existingVersion: existingExact.version,
      });
      return {
        chunksCreated: 0,
        title,
        category,
        version: existingExact.version,
      };
    }

    // ── Step 2: Determine version (increment if same sourceRef exists) ──
    let version = 1;
    if (sourceRef) {
      const latestVersion = await GlobalKnowledgeModel.findOne({ sourceRef })
        .sort({ version: -1 })
        .select('version')
        .lean();
      if (latestVersion) {
        version = latestVersion.version + 1;
      }
    }

    // ── Step 3: Chunk the content ───────────────────────────────────────
    const chunks = this.chunkText(content, chunkSize, chunkOverlap);

    logger.info('[KnowledgeIngestion] Chunking complete', {
      title,
      category,
      source,
      totalChunks: chunks.length,
      version,
      contentLength: content.length,
      chunkSize,
      chunkOverlap,
    });

    // ── Step 4: Embed all chunks in batches ─────────────────────────────
    const embeddings = await this.embedBatch(chunks);

    // ── Step 5: Insert new chunks ───────────────────────────────────────
    const documents = chunks.map((chunk, index) => ({
      content: chunk,
      embedding: Array.from(embeddings[index]),
      category,
      source,
      title,
      sourceRef,
      chunkIndex: index,
      totalChunks: chunks.length,
      contentHash,
      version,
      metadata,
      createdAt: now,
      updatedAt: now,
    }));

    await GlobalKnowledgeModel.insertMany(documents);

    // ── Step 6: Delete stale chunks from previous versions ─────────────
    if (sourceRef && version > 1) {
      const deleteResult = await GlobalKnowledgeModel.deleteMany({
        sourceRef,
        version: { $lt: version },
      });

      logger.info('[KnowledgeIngestion] Cleaned up stale chunks', {
        sourceRef,
        deletedCount: deleteResult.deletedCount,
        previousVersions: `< ${version}`,
      });
    }

    logger.info('[KnowledgeIngestion] Ingestion complete', {
      title,
      category,
      chunksCreated: chunks.length,
      version,
      contentHash,
    });

    return {
      chunksCreated: chunks.length,
      title,
      category,
      version,
    };
  }

  /**
   * Delete all chunks for a specific source reference.
   */
  async deleteBySourceRef(sourceRef: string): Promise<number> {
    const GlobalKnowledgeModel = getGlobalKnowledgeModel();
    const result = await GlobalKnowledgeModel.deleteMany({ sourceRef });
    logger.info('[KnowledgeIngestion] Deleted by sourceRef', {
      sourceRef,
      deletedCount: result.deletedCount,
    });
    return result.deletedCount;
  }

  /**
   * Delete all chunks in a specific category.
   */
  async deleteByCategory(category: KnowledgeCategory): Promise<number> {
    const GlobalKnowledgeModel = getGlobalKnowledgeModel();
    const result = await GlobalKnowledgeModel.deleteMany({ category });
    logger.info('[KnowledgeIngestion] Deleted by category', {
      category,
      deletedCount: result.deletedCount,
    });
    return result.deletedCount;
  }

  /**
   * List all unique documents (by sourceRef + latest version) in the knowledge base.
   */
  async listDocuments(): Promise<
    readonly {
      title: string;
      sourceRef: string | undefined;
      category: KnowledgeCategory;
      source: KnowledgeSourceType;
      version: number;
      totalChunks: number;
      createdAt: string;
    }[]
  > {
    const GlobalKnowledgeModel = getGlobalKnowledgeModel();
    const docs = await GlobalKnowledgeModel.aggregate<{
      title: string;
      sourceRef: string | undefined;
      category: KnowledgeCategory;
      source: KnowledgeSourceType;
      version: number;
      totalChunks: number;
      createdAt: string;
    }>([
      { $match: { chunkIndex: 0 } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 0,
          title: 1,
          sourceRef: 1,
          category: 1,
          source: 1,
          version: 1,
          totalChunks: 1,
          createdAt: 1,
        },
      },
    ]);

    return docs;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Split text into overlapping chunks.
   *
   * Strategy: Split by paragraphs first (preserves semantic boundaries),
   * then merge paragraphs into chunks that fit within the size limit.
   * Overlap is achieved by carrying over the tail of the previous chunk.
   */
  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    // Normalize whitespace
    const normalized = text.replace(/\r\n/g, '\n').trim();

    // If the entire text fits in one chunk, return as-is
    if (normalized.length <= chunkSize) {
      return [normalized];
    }

    // Split into paragraphs (double newline = paragraph boundary)
    const paragraphs = normalized.split(/\n{2,}/).filter((p) => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      // If a single paragraph exceeds chunk size, split by sentences
      if (paragraph.length > chunkSize) {
        // Flush current chunk if non-empty
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // Split long paragraph by sentences
        const sentences = paragraph.match(/[^.!?]+[.!?]+\s*/g) ?? [paragraph];
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > chunkSize && currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            // Overlap: carry the tail of the previous chunk
            currentChunk = overlap > 0 ? currentChunk.slice(-overlap) : '';
          }
          currentChunk += sentence;
        }
        continue;
      }

      // Normal paragraph — try to append to current chunk
      const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      if (candidate.length > chunkSize && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        // Overlap: carry the tail of the previous chunk
        currentChunk = overlap > 0 ? currentChunk.slice(-overlap) + '\n\n' + paragraph : paragraph;
      } else {
        currentChunk = candidate;
      }
    }

    // Flush remaining content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Embed multiple text chunks in parallel, respecting concurrency limits.
   */
  private async embedBatch(chunks: string[]): Promise<readonly (readonly number[])[]> {
    const results: (readonly number[])[] = new Array(chunks.length);

    // Process in batches to avoid rate limiting
    for (let i = 0; i < chunks.length; i += EMBEDDING_CONCURRENCY) {
      const batch = chunks.slice(i, i + EMBEDDING_CONCURRENCY);
      const batchResults = await Promise.all(batch.map((chunk) => this.llm.embed(chunk)));

      for (let j = 0; j < batchResults.length; j++) {
        results[i + j] = batchResults[j];
      }

      if (i + EMBEDDING_CONCURRENCY < chunks.length) {
        logger.debug('[KnowledgeIngestion] Embedded batch', {
          batchStart: i,
          batchEnd: i + batch.length,
          total: chunks.length,
        });
      }
    }

    return results;
  }

  /**
   * Compute SHA-256 hash of content for deduplication.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
