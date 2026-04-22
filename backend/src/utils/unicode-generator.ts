/**
 * @fileoverview Unicode Generation Utilities
 * @module @nxt1/backend/utils/unicode
 * @version 1.0.0
 *
 * Backend utilities for unicode generation and validation.
 * Complements Cloud Functions unicode generation.
 *
 * Use Cases:
 * - Manual unicode generation for existing users
 * - Validation of unicode format
 * - Backend fallback if Cloud Function fails
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from './logger.js';

const MIN_UNICODE = 100000;
const MAX_UNICODE = 999999;
const MAX_RETRIES = 10;

/**
 * Generate random 6-digit unicode
 */
function generateRandomUnicode(): string {
  const code = Math.floor(Math.random() * (MAX_UNICODE - MIN_UNICODE + 1)) + MIN_UNICODE;
  return code.toString();
}

/**
 * Generate unique unicode for user (backend version)
 *
 * This is the backend equivalent of the Cloud Function generator.
 * Used for manual generation or fallback.
 *
 * @param db - Firestore instance
 * @param userId - User ID to assign unicode to
 * @returns Generated unicode string
 */
export async function generateUnicodeForUser(db: Firestore, userId: string): Promise<string> {
  // Try random generation with retries
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const unicode = generateRandomUnicode();

    try {
      // Use transaction for atomicity
      const result = await db.runTransaction(async (transaction) => {
        const unicodeRef = db.collection('Unicodes').doc(unicode);
        const userRef = db.collection('Users').doc(userId);

        // Check availability in transaction
        const unicodeDoc = await transaction.get(unicodeRef);
        if (unicodeDoc.exists && unicodeDoc.data()?.['used']) {
          throw new Error('Unicode already used');
        }

        // Reserve unicode
        transaction.set(unicodeRef, {
          used: true,
          userId,
          createdAt: FieldValue.serverTimestamp(),
          assignedAt: FieldValue.serverTimestamp(),
        });

        // Assign to user
        transaction.update(userRef, {
          unicode,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return unicode;
      });

      logger.info(`[Unicode] Generated ${unicode} for user ${userId} (attempt ${attempt})`);
      return result;
    } catch (error) {
      logger.warn(`[Unicode] Collision on attempt ${attempt}`, {
        userId,
        unicode,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue to next retry
    }
  }

  // Fallback: Sequential search
  logger.warn(`[Unicode] Random generation failed, using sequential fallback`, { userId });
  return await fallbackSequentialGeneration(db, userId);
}

/**
 * Fallback sequential generation
 */
async function fallbackSequentialGeneration(db: Firestore, userId: string): Promise<string> {
  const startPosition = Math.floor(Math.random() * (MAX_UNICODE - MIN_UNICODE)) + MIN_UNICODE;

  for (let i = 0; i < MAX_UNICODE - MIN_UNICODE + 1; i++) {
    const code =
      ((startPosition - MIN_UNICODE + i) % (MAX_UNICODE - MIN_UNICODE + 1)) + MIN_UNICODE;
    const unicode = code.toString();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const unicodeRef = db.collection('Unicodes').doc(unicode);
        const userRef = db.collection('Users').doc(userId);

        const unicodeDoc = await transaction.get(unicodeRef);
        if (unicodeDoc.exists && unicodeDoc.data()?.['used']) {
          throw new Error('Unicode already used');
        }

        transaction.set(unicodeRef, {
          used: true,
          userId,
          createdAt: FieldValue.serverTimestamp(),
          assignedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(userRef, {
          unicode,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return unicode;
      });

      logger.info(`[Unicode] Sequential fallback: assigned ${unicode} to user ${userId}`);
      return result;
    } catch {
      // Continue searching
      continue;
    }
  }

  throw new Error('All unicode codes exhausted');
}

/**
 * Get user's current unicode
 */
export async function getUserUnicode(db: Firestore, userId: string): Promise<string | null> {
  const userDoc = await db.collection('Users').doc(userId).get();
  const userData = userDoc.data();
  return (userData?.['unicode'] as string) || null;
}
