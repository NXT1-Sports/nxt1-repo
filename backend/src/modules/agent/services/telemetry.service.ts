/**
 * @fileoverview AI Telemetry Service — Cost Tracking & Usage Limits
 * @module @nxt1/backend/modules/agent/services
 *
 * Wraps every LLM API call with telemetry recording.
 * Tracks tokens consumed, cost in USD, latency, and model usage.
 * Enforces per-tier usage limits to prevent cost overruns.
 *
 * Architecture:
 * ┌──────────────────┐     ┌───────────────────┐     ┌──────────────┐
 * │ Agent calls LLM  │ ──► │ TelemetryService  │ ──► │ OpenRouter   │
 * │ (BaseAgent)      │     │ (wraps the call)  │     │ API          │
 * └──────────────────┘     └───────────────────┘     └──────────────┘
 *                                   │
 *                                   ▼
 *                          ┌───────────────────┐
 *                          │ Records:          │
 *                          │ - tokens used     │
 *                          │ - cost in USD     │
 *                          │ - latency (ms)    │
 *                          │ - model & agent   │
 *                          │ - tool calls      │
 *                          └───────────────────┘
 *                                   │
 *                                   ▼
 *                          ┌───────────────────┐
 *                          │ MongoDB/Firestore │
 *                          │ (usage collection)│
 *                          └───────────────────┘
 *
 * Why this exists:
 * Without cost tracking, a free-tier user could chain 50 scouting reports
 * and burn $200 in Claude API calls. The TelemetryService enforces daily limits
 * per subscription tier and provides the data for the admin Usage Dashboard.
 */

import type {
  AgentIdentifier,
  AgentLLMCallRecord,
  AgentUsageSummary,
  AgentUsageLimits,
} from '@nxt1/core';
import { AGENT_USAGE_LIMITS, AGENT_MODEL_PRICING } from '@nxt1/core';

export class TelemetryService {
  /**
   * Check if a user has remaining quota before making an LLM call.
   * Called BEFORE the OpenRouter request fires.
   *
   * @returns true if the user is within limits, false if blocked.
   */
  async checkUsageLimits(
    userId: string,
    userTier: string
  ): Promise<{ allowed: boolean; reason?: string; remaining?: Partial<AgentUsageLimits> }> {
    const limits = AGENT_USAGE_LIMITS.find((l) => l.tier === userTier);
    if (!limits) {
      return { allowed: false, reason: `Unknown tier: ${userTier}` };
    }

    const todayUsage = await this.getTodayUsage(userId);

    if (todayUsage.totalCalls >= limits.maxCallsPerDay) {
      return {
        allowed: false,
        reason: `Daily call limit reached (${limits.maxCallsPerDay} calls). Resets at midnight UTC.`,
      };
    }

    if (todayUsage.totalTokens >= limits.maxTokensPerDay) {
      return {
        allowed: false,
        reason: `Daily token limit reached (${limits.maxTokensPerDay.toLocaleString()} tokens).`,
      };
    }

    if (todayUsage.totalCostUsd >= limits.maxCostPerDay) {
      return {
        allowed: false,
        reason: `Daily cost limit reached ($${limits.maxCostPerDay.toFixed(2)}).`,
      };
    }

    return {
      allowed: true,
      remaining: {
        maxCallsPerDay: limits.maxCallsPerDay - todayUsage.totalCalls,
        maxTokensPerDay: limits.maxTokensPerDay - todayUsage.totalTokens,
        maxCostPerDay: Number((limits.maxCostPerDay - todayUsage.totalCostUsd).toFixed(4)),
      },
    };
  }

  /**
   * Check if a specific model tier is allowed for the user's subscription.
   */
  isModelAllowed(userTier: string, modelTier: string): boolean {
    const limits = AGENT_USAGE_LIMITS.find((l) => l.tier === userTier);
    if (!limits) return false;
    return limits.allowedModelTiers.includes(
      modelTier as 'fast' | 'balanced' | 'reasoning' | 'creative'
    );
  }

  /**
   * Record a completed LLM call.
   * Called AFTER every successful OpenRouter response.
   */
  async recordLLMCall(params: {
    operationId: string;
    userId: string;
    agentId: AgentIdentifier;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    hadToolCall: boolean;
  }): Promise<AgentLLMCallRecord> {
    const costUsd = this.calculateCost(params.model, params.inputTokens, params.outputTokens);

    const record: AgentLLMCallRecord = {
      id: `llm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      operationId: params.operationId,
      userId: params.userId,
      agentId: params.agentId,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      costUsd,
      latencyMs: params.latencyMs,
      hadToolCall: params.hadToolCall,
      timestamp: new Date().toISOString(),
    };

    // TODO: Store in MongoDB/Firestore
    // await LLMCallModel.create(record);

    return record;
  }

  /**
   * Get aggregated usage for a user over a billing period.
   * Used by the admin dashboard and the user's Usage page.
   */
  async getUsageSummary(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<AgentUsageSummary> {
    // TODO: Aggregate from MongoDB/Firestore
    // const calls = await LLMCallModel.find({
    //   userId,
    //   timestamp: { $gte: periodStart, $lte: periodEnd },
    // }).lean();

    return {
      userId,
      periodStart,
      periodEnd,
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      byModel: [],
      byAgent: [],
    };
  }

  // ─── Internal Helpers ───────────────────────────────────────────────────

  /**
   * Calculate cost in USD based on model pricing table.
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = AGENT_MODEL_PRICING[model];
    if (!pricing) {
      // Unknown model — estimate conservatively
      return (inputTokens * 1.0 + outputTokens * 3.0) / 1_000_000;
    }
    const inputCost = (inputTokens * pricing.input) / 1_000_000;
    const outputCost = (outputTokens * pricing.output) / 1_000_000;
    return Number((inputCost + outputCost).toFixed(6));
  }

  /**
   * Get today's aggregated usage for a user (for limit checking).
   */
  private async getTodayUsage(
    _userId: string
  ): Promise<{ totalCalls: number; totalTokens: number; totalCostUsd: number }> {
    // TODO: Query today's records from MongoDB/Firestore
    // const today = new Date().toISOString().split('T')[0];
    // const calls = await LLMCallModel.find({
    //   userId: _userId,
    //   timestamp: { $gte: `${today}T00:00:00Z` },
    // }).lean();
    //
    // return {
    //   totalCalls: calls.length,
    //   totalTokens: calls.reduce((sum, c) => sum + c.totalTokens, 0),
    //   totalCostUsd: calls.reduce((sum, c) => sum + c.costUsd, 0),
    // };

    return { totalCalls: 0, totalTokens: 0, totalCostUsd: 0 };
  }
}
