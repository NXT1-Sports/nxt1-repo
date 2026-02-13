/**
 * @fileoverview MongoDB Database Configuration
 * @module @nxt1/backend/config/database
 *
 * MongoDB connection setup with Mongoose
 */

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

let isConnected = false;

/**
 * Initialize MongoDB connection
 * @returns {Promise<void>}
 */
export async function connectToMongoDB(): Promise<void> {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  const mongoUri = process.env['MONGO'] || process.env['MONGODB_URI'];

  if (!mongoUri) {
    throw new Error('MONGO or MONGODB_URI environment variable is not set');
  }

  try {
    await mongoose.connect(mongoUri);
    isConnected = true;

    const sanitizedUri = mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    logger.info(`✅ MongoDB connected successfully to: ${sanitizedUri}`);
  } catch (error) {
    logger.error('❌ MongoDB connection error:', { error });
    throw error;
  }
}

/**
 * Close MongoDB connection
 * @returns {Promise<void>}
 */
export async function disconnectFromMongoDB(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('MongoDB disconnect error:', { error });
    throw error;
  }
}

/**
 * Get MongoDB connection status
 */
export function isMongoDBConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
