/**
 * @fileoverview Unicode Generation Helper
 * @module @nxt1/functions/user/generateUnicode
 * @version 1.0.0
 *
 * Generates unique 6-digit unicode identifiers for users.
 * Range: 100000 - 999999 (900,000 possible codes)
 *
 * Strategy:
 * - Random generation with collision detection
 * - Firestore transaction for atomicity
 * - Tracks used codes in Unicodes collection
 * - Max 10 retries before fallback to sequential
 */

import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

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
 * Check if unicode is available (not used)
 */
async function isUnicodeAvailable(unicode: string): Promise<boolean> {
  const db = admin.firestore();
  const unicodeDoc = await db.collection('Unicodes').doc(unicode).get();
  return !unicodeDoc.exists || !unicodeDoc.data()?.['used'];
}

/**
 * Reserve unicode in Unicodes collection
 */
// async function reserveUnicode(unicode: string, userId: string): Promise<void> {
//   const db = admin.firestore();
//   await db.collection('Unicodes').doc(unicode).set({
//     used: true,
//     userId,
//     createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     assignedAt: admin.firestore.FieldValue.serverTimestamp(),
//   });
// }

/**
 * Assign unicode to user document
 */
// async function assignUnicodeToUser(userId: string, unicode: string): Promise<void> {
//   const db = admin.firestore();
//   await db.collection('Users').doc(userId).update({
//     unicode,
//     updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//   });
// }

/**
 * Generate and assign unique unicode to user
 *
 * Uses transaction-based approach with retries for collision handling.
 * Falls back to sequential search if random generation fails.
 *
 * @param userId - User document ID
 * @returns Generated unicode code
 * @throws Error if unable to generate unicode after max retries
 */
export async function generateUnicodeForUser(userId: string): Promise<string> {
  const db = admin.firestore();

  // Try random generation with retries
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const unicode = generateRandomUnicode();

    try {
      // Check availability
      const available = await isUnicodeAvailable(unicode);

      if (available) {
        // Use transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
          const unicodeRef = db.collection('Unicodes').doc(unicode);
          const userRef = db.collection('Users').doc(userId);

          // Double-check in transaction (prevent race condition)
          const unicodeDoc = await transaction.get(unicodeRef);
          if (unicodeDoc.exists && unicodeDoc.data()?.['used']) {
            throw new Error('Unicode already used');
          }

          // Reserve unicode
          transaction.set(unicodeRef, {
            used: true,
            userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            assignedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Assign to user
          transaction.update(userRef, {
            unicode,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        logger.info(`Generated unicode ${unicode} for user ${userId} (attempt ${attempt})`);
        return unicode;
      }
    } catch (error) {
      logger.warn(`Unicode ${unicode} collision on attempt ${attempt}`, {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue to next retry
    }
  }

  // Fallback: Sequential search (rare case)
  logger.warn(
    `Random generation failed after ${MAX_RETRIES} attempts, falling back to sequential`,
    {
      userId,
    }
  );

  return await fallbackSequentialGeneration(userId);
}

/**
 * Fallback: Find first available unicode sequentially
 * Only used when random generation consistently fails (very rare)
 */
async function fallbackSequentialGeneration(userId: string): Promise<string> {
  const db = admin.firestore();

  // Start from a random position to avoid clustering
  const startPosition = Math.floor(Math.random() * (MAX_UNICODE - MIN_UNICODE)) + MIN_UNICODE;

  // Search forward from start position
  for (let i = 0; i < MAX_UNICODE - MIN_UNICODE + 1; i++) {
    const code =
      ((startPosition - MIN_UNICODE + i) % (MAX_UNICODE - MIN_UNICODE + 1)) + MIN_UNICODE;
    const unicode = code.toString();

    try {
      const available = await isUnicodeAvailable(unicode);

      if (available) {
        // Use transaction
        await db.runTransaction(async (transaction) => {
          const unicodeRef = db.collection('Unicodes').doc(unicode);
          const userRef = db.collection('Users').doc(userId);

          const unicodeDoc = await transaction.get(unicodeRef);
          if (unicodeDoc.exists && unicodeDoc.data()?.['used']) {
            throw new Error('Unicode already used');
          }

          transaction.set(unicodeRef, {
            used: true,
            userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            assignedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          transaction.update(userRef, {
            unicode,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        logger.info(`Sequential fallback: assigned unicode ${unicode} to user ${userId}`);
        return unicode;
      }
    } catch {
      // Continue searching
      continue;
    }
  }

  // If we get here, all 900k codes are exhausted (virtually impossible)
  const errorMsg = 'All unicode codes exhausted - this should never happen';
  logger.error(errorMsg, { userId });
  throw new Error(errorMsg);
}

/**
 * Release unicode (for cleanup/deletion)
 */
export async function releaseUnicode(unicode: string): Promise<void> {
  const db = admin.firestore();
  await db.collection('Unicodes').doc(unicode).update({
    used: false,
    userId: admin.firestore.FieldValue.delete(),
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info(`Released unicode ${unicode}`);
}
