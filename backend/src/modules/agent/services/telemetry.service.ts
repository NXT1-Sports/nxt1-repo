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
 * Without cost tracking, a user could chain 50 scouting reports
 * and burn $200 in Claude API calls. The TelemetryService enforces daily limits
 * and provides the data for the admin Usage Dashboard.
 */

import type {
  AgentIdentifier,
  AgentLLMCallRecord,
  AgentUsageSummary,
  AgentUsageLimits,
} from '@nxt1/core';
import { AGENT_USAGE_LIMITS, AGENT_MODEL_PRICING } from '@nxt1/core';
import { LLMCallModel } from '../../../models/llm-call.model.js';
import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import { logger } from '../../../utils/logger.js';

export class TelemetryService {
  /**
   * Check if a user has remaining quota before making an LLM call.
   * Called BEFORE the OpenRouter request fires.
   *
   * @returns true if the user is within limits, false if blocked.
   */
  async checkUsageLimits(
    userId: string,
    _userTier?: string
  ): Promise<{ allowed: boolean; reason?: string; remaining?: Partial<AgentUsageLimits> }> {
    // No per-user tiers — use single default limits for all users
    const limits = AGENT_USAGE_LIMITS[0];
    if (!limits) {
      return { allowed: false, reason: 'No usage limits configured' };
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
   * Check if a specific model tier is allowed.
   * No per-user tiers — all model tiers are allowed for all users.
   */
  isModelAllowed(_userTier: string, modelTier: string): boolean {
    const limits = AGENT_USAGE_LIMITS[0];
    if (!limits) return false;
    return (limits.allowedModelTiers as readonly string[]).includes(modelTier);
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
      id: `llm_${crypto.randomUUID()}`,
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

    try {
      await LLMCallModel.create({
        environment: getRuntimeEnvironment(),
        operationId: record.operationId,
        userId: record.userId,
        agentId: record.agentId,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        totalTokens: record.totalTokens,
        costUsd: record.costUsd,
        latencyMs: record.latencyMs,
        hadToolCall: record.hadToolCall,
        timestamp: new Date(record.timestamp),
      });
    } catch (err) {
      logger.warn('[TelemetryService] Failed to persist LLM call record', {
        operationId: record.operationId,
        userId: record.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

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
    try {
      const environment = getRuntimeEnvironment();
      const calls = await LLMCallModel.find({
        environment,
        userId,
        timestamp: { $gte: new Date(periodStart), $lte: new Date(periodEnd) },
      }).lean();

      const totalCalls = calls.length;
      const totalInputTokens = calls.reduce((sum, c) => sum + c.inputTokens, 0);
      const totalOutputTokens = calls.reduce((sum, c) => sum + c.outputTokens, 0);
      const totalCostUsd = Number(calls.reduce((sum, c) => sum + c.costUsd, 0).toFixed(6));

      const modelMap = new Map<
        string,
        { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
      >();
      const agentMap = new Map<string, { calls: number; totalTokens: number; costUsd: number }>();

      for (const call of calls) {
        const modelEntry = modelMap.get(call.model) ?? {
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
        modelEntry.calls += 1;
        modelEntry.inputTokens += call.inputTokens;
        modelEntry.outputTokens += call.outputTokens;
        modelEntry.costUsd = Number((modelEntry.costUsd + call.costUsd).toFixed(6));
        modelMap.set(call.model, modelEntry);

        const agentEntry = agentMap.get(call.agentId) ?? {
          calls: 0,
          totalTokens: 0,
          costUsd: 0,
        };
        agentEntry.calls += 1;
        agentEntry.totalTokens += call.totalTokens;
        agentEntry.costUsd = Number((agentEntry.costUsd + call.costUsd).toFixed(6));
        agentMap.set(call.agentId, agentEntry);
      }

      return {
        userId,
        periodStart,
        periodEnd,
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
        byModel: [...modelMap.entries()].map(([model, stats]) => ({ model, ...stats })),
        byAgent: [...agentMap.entries()].map(([agentId, stats]) => ({
          agentId: agentId as AgentIdentifier,
          ...stats,
        })),
      };
    } catch (err) {
      logger.warn('[TelemetryService] Failed to query usage summary', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
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
    userId: string
  ): Promise<{ totalCalls: number; totalTokens: number; totalCostUsd: number }> {
    try {
      const environment = getRuntimeEnvironment();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const calls = await LLMCallModel.find({
        environment,
        userId,
        timestamp: { $gte: today },
      })
        .select('totalTokens costUsd')
        .lean();

      return {
        totalCalls: calls.length,
        totalTokens: calls.reduce((sum, c) => sum + c.totalTokens, 0),
        totalCostUsd: calls.reduce((sum, c) => sum + c.costUsd, 0),
      };
    } catch (err) {
      logger.warn('[TelemetryService] Failed to query today usage', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { totalCalls: 0, totalTokens: 0, totalCostUsd: 0 };
    }
  }
}
