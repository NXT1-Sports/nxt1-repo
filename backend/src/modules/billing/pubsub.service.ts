/**
 * @fileoverview Pub/Sub Service
 * @module @nxt1/backend/modules/billing
 *
 * Service for publishing and subscribing to usage events
 */

import type { PubSub } from '@google-cloud/pubsub';
import { createPubSubClient } from '../../utils/pubsub.js';
import { logger } from '../../utils/logger.js';
import { TOPICS } from './config.js';
import type { UsageEventMessage } from './types/index.js';

let pubsubClient: PubSub | null = null;

/**
 * Get or create Pub/Sub client
 */
function getPubSubClient(): PubSub {
  if (!pubsubClient) {
    pubsubClient = createPubSubClient();
  }
  return pubsubClient;
}

/**
 * Publish usage event for async processing
 */
export async function publishUsageEvent(
  usageEventId: string,
  environment: 'staging' | 'production'
): Promise<void> {
  try {
    const pubsub = getPubSubClient();
    const topic = pubsub.topic(TOPICS.USAGE_EVENTS);

    const message: UsageEventMessage = {
      usageEventId,
      environment,
    };

    const messageId = await topic.publishMessage({
      json: message,
    });

    logger.info('[publishUsageEvent] Message published', {
      messageId,
      usageEventId,
      environment,
    });
  } catch (error) {
    logger.error('[publishUsageEvent] Failed to publish message', {
      error,
      usageEventId,
      environment,
    });
    throw error;
  }
}

/**
 * Create Pub/Sub topic if it doesn't exist
 * Should be called during deployment/setup
 */
export async function ensureTopicExists(): Promise<void> {
  try {
    const pubsub = getPubSubClient();
    const topicName = TOPICS.USAGE_EVENTS;
    const topic = pubsub.topic(topicName);

    const [exists] = await topic.exists();

    if (!exists) {
      await pubsub.createTopic(topicName);
      logger.info(`[ensureTopicExists] Created topic: ${topicName}`);
    } else {
      logger.info(`[ensureTopicExists] Topic already exists: ${topicName}`);
    }
  } catch (error) {
    logger.error('[ensureTopicExists] Failed to ensure topic exists', {
      error,
    });
    throw error;
  }
}

/**
 * Create Pub/Sub subscription if it doesn't exist
 * Should be called during deployment/setup
 */
export async function ensureSubscriptionExists(subscriptionName: string): Promise<void> {
  try {
    const pubsub = getPubSubClient();
    const topicName = TOPICS.USAGE_EVENTS;
    const topic = pubsub.topic(topicName);

    const subscription = topic.subscription(subscriptionName);
    const [exists] = await subscription.exists();

    if (!exists) {
      await topic.createSubscription(subscriptionName, {
        ackDeadlineSeconds: 60,
        retryPolicy: {
          minimumBackoff: { seconds: 10 },
          maximumBackoff: { seconds: 600 },
        },
        deadLetterPolicy: {
          deadLetterTopic: `projects/${pubsub.projectId}/topics/${topicName}-dlq`,
          maxDeliveryAttempts: 5,
        },
      });
      logger.info(`[ensureSubscriptionExists] Created subscription: ${subscriptionName}`);
    } else {
      logger.info(`[ensureSubscriptionExists] Subscription already exists: ${subscriptionName}`);
    }
  } catch (error) {
    logger.error('[ensureSubscriptionExists] Failed to ensure subscription exists', {
      error,
      subscriptionName,
    });
    throw error;
  }
}
