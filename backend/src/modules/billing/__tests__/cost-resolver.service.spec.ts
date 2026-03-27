/**
 * @fileoverview Unit tests for Cost Resolver Service
 * @module @nxt1/backend/modules/billing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveAICost,
  estimateMaxCost,
  resolveMultiStepAICost,
  AI_MARGIN_MULTIPLIER,
  MIN_COST_CENTS,
} from '../cost-resolver.service.js';

describe('Cost Resolver Service', () => {
  describe('resolveAICost', () => {
    it('should apply margin multiplier and convert to cents', () => {
      // $0.15 raw * 3.0 margin * 100 = 45 cents
      const result = resolveAICost(0.15);
      expect(result).toBe(45);
    });

    it('should ceil fractional cents', () => {
      // $0.001 raw * 3.0 margin * 100 = 0.3 → ceil = 1
      const result = resolveAICost(0.001);
      expect(result).toBe(MIN_COST_CENTS);
    });

    it('should enforce minimum cost floor', () => {
      // Extremely cheap prompt: $0.0001 * 3.0 * 100 = 0.03 → ceil = 1
      const result = resolveAICost(0.0001);
      expect(result).toBe(MIN_COST_CENTS);
    });

    it('should return minimum for zero cost', () => {
      expect(resolveAICost(0)).toBe(MIN_COST_CENTS);
    });

    it('should return minimum for negative cost', () => {
      expect(resolveAICost(-1)).toBe(MIN_COST_CENTS);
    });

    it('should return minimum for NaN', () => {
      expect(resolveAICost(NaN)).toBe(MIN_COST_CENTS);
    });

    it('should return minimum for Infinity', () => {
      expect(resolveAICost(Infinity)).toBe(MIN_COST_CENTS);
    });

    it('should accept custom margin multiplier', () => {
      // $0.10 * 5.0 margin * 100 = 50 cents
      const result = resolveAICost(0.1, 5.0);
      expect(result).toBe(50);
    });

    it('should handle large costs correctly', () => {
      // $2.50 raw * 3.0 margin * 100 = 750 cents
      const result = resolveAICost(2.5);
      expect(result).toBe(750);
    });

    it('should default margin to AI_MARGIN_MULTIPLIER', () => {
      expect(AI_MARGIN_MULTIPLIER).toBe(3.0);
    });
  });

  describe('estimateMaxCost', () => {
    it('should return a positive cost estimate for balanced tier', () => {
      const estimate = estimateMaxCost('balanced');
      expect(estimate).toBeGreaterThan(0);
    });

    it('should return a positive cost estimate for fast tier', () => {
      const estimate = estimateMaxCost('fast');
      expect(estimate).toBeGreaterThan(0);
    });

    it('should return higher estimates for more output tokens', () => {
      const small = estimateMaxCost('balanced', 512, 500);
      const large = estimateMaxCost('balanced', 8192, 500);
      expect(large).toBeGreaterThan(small);
    });

    it('should return higher estimates for more input tokens', () => {
      const small = estimateMaxCost('balanced', 2048, 100);
      const large = estimateMaxCost('balanced', 2048, 5000);
      expect(large).toBeGreaterThan(small);
    });

    it('should handle unknown tier with conservative estimate', () => {
      const estimate = estimateMaxCost('unknown-tier');
      expect(estimate).toBeGreaterThan(0);
    });
  });

  describe('resolveMultiStepAICost', () => {
    it('should sum multiple step costs and apply margin once', () => {
      // Steps: $0.05 + $0.10 + $0.15 = ~$0.30 total
      // $0.30 * 3.0 * 100 = ~90 cents (ceil handles floating point)
      const result = resolveMultiStepAICost([0.05, 0.1, 0.15]);
      expect(result).toBeGreaterThanOrEqual(90);
      expect(result).toBeLessThanOrEqual(91);
    });

    it('should handle single step', () => {
      const result = resolveMultiStepAICost([0.1]);
      expect(result).toBe(resolveAICost(0.1));
    });

    it('should handle empty array', () => {
      const result = resolveMultiStepAICost([]);
      expect(result).toBe(MIN_COST_CENTS); // resolveAICost(0) = min
    });
  });
});
