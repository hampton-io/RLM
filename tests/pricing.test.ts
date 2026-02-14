import { describe, it, expect } from 'vitest';
import { MODEL_PRICING, calculateCost, detectProvider } from '../src/clients/types.js';

describe('Model Pricing', () => {
  describe('MODEL_PRICING coverage', () => {
    // All expected models
    const expectedModels = [
      // OpenAI - GPT-5
      'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'gpt-5.2',
      // OpenAI - GPT-4.1
      'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
      // OpenAI - GPT-4o
      'gpt-4o', 'gpt-4o-mini',
      // OpenAI - o3
      'o3', 'o3-mini', 'o3-pro',
      // OpenAI - o1
      'o1', 'o1-mini', 'o1-pro',
      // OpenAI - Legacy
      'gpt-4-turbo', 'gpt-3.5-turbo',
      // Anthropic - Claude 4.5
      'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5',
      'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-5-20251101',
      // Anthropic - Claude 4
      'claude-opus-4-1',
      // Anthropic - Claude 3.x
      'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307',
      // Google - Gemini 3 (preview)
      'gemini-3-pro-preview', 'gemini-3-flash-preview',
      // Google - Gemini 2.5
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
      // Google - Gemini 2.0
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
    ];

    it('should have pricing for all expected models', () => {
      for (const model of expectedModels) {
        expect(MODEL_PRICING[model], `Missing pricing for ${model}`).toBeDefined();
      }
    });

    it('should have at least 30 models defined', () => {
      const modelCount = Object.keys(MODEL_PRICING).length;
      expect(modelCount).toBeGreaterThanOrEqual(30);
    });

    it('should have all required pricing fields', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.inputPer1M, `${model} missing inputPer1M`).toBeDefined();
        expect(pricing.outputPer1M, `${model} missing outputPer1M`).toBeDefined();
        expect(typeof pricing.inputPer1M).toBe('number');
        expect(typeof pricing.outputPer1M).toBe('number');
      }
    });

    it('should have positive prices for all models', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.inputPer1M, `${model} inputPer1M should be positive`).toBeGreaterThan(0);
        expect(pricing.outputPer1M, `${model} outputPer1M should be positive`).toBeGreaterThan(0);
      }
    });

    it('should have output prices >= input prices for all models', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(
          pricing.outputPer1M,
          `${model} output should be >= input`
        ).toBeGreaterThanOrEqual(pricing.inputPer1M);
      }
    });
  });

  describe('OpenAI model pricing', () => {
    it('should have correct GPT-5 pricing hierarchy', () => {
      // GPT-5 should be more expensive than GPT-5-mini
      expect(MODEL_PRICING['gpt-5'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gpt-5-mini'].inputPer1M);
      expect(MODEL_PRICING['gpt-5'].outputPer1M).toBeGreaterThan(MODEL_PRICING['gpt-5-mini'].outputPer1M);
    });

    it('should have correct GPT-4.1 pricing hierarchy', () => {
      // GPT-4.1 > GPT-4.1-mini > GPT-4.1-nano
      expect(MODEL_PRICING['gpt-4.1'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gpt-4.1-mini'].inputPer1M);
      expect(MODEL_PRICING['gpt-4.1-mini'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gpt-4.1-nano'].inputPer1M);
    });

    it('should have correct o3 pricing hierarchy', () => {
      // o3-pro > o3 > o3-mini
      expect(MODEL_PRICING['o3-pro'].inputPer1M).toBeGreaterThan(MODEL_PRICING['o3'].inputPer1M);
      expect(MODEL_PRICING['o3'].inputPer1M).toBeGreaterThan(MODEL_PRICING['o3-mini'].inputPer1M);
    });

    it('should have correct o1 pricing hierarchy', () => {
      // o1-pro > o1 > o1-mini
      expect(MODEL_PRICING['o1-pro'].inputPer1M).toBeGreaterThan(MODEL_PRICING['o1'].inputPer1M);
      expect(MODEL_PRICING['o1'].inputPer1M).toBeGreaterThan(MODEL_PRICING['o1-mini'].inputPer1M);
    });

    it('should have GPT-4o-mini cheaper than GPT-4o', () => {
      expect(MODEL_PRICING['gpt-4o-mini'].inputPer1M).toBeLessThan(MODEL_PRICING['gpt-4o'].inputPer1M);
      expect(MODEL_PRICING['gpt-4o-mini'].outputPer1M).toBeLessThan(MODEL_PRICING['gpt-4o'].outputPer1M);
    });
  });

  describe('Anthropic model pricing', () => {
    it('should have correct Claude 4.5 pricing hierarchy', () => {
      // Claude Opus > Sonnet > Haiku
      expect(MODEL_PRICING['claude-opus-4-5'].inputPer1M).toBeGreaterThan(MODEL_PRICING['claude-sonnet-4-5'].inputPer1M);
      expect(MODEL_PRICING['claude-sonnet-4-5'].inputPer1M).toBeGreaterThan(MODEL_PRICING['claude-haiku-4-5'].inputPer1M);
    });

    it('should have versioned models match base model pricing', () => {
      expect(MODEL_PRICING['claude-sonnet-4-5-20250929']).toEqual(MODEL_PRICING['claude-sonnet-4-5']);
      expect(MODEL_PRICING['claude-haiku-4-5-20251001']).toEqual(MODEL_PRICING['claude-haiku-4-5']);
      expect(MODEL_PRICING['claude-opus-4-5-20251101']).toEqual(MODEL_PRICING['claude-opus-4-5']);
    });

    it('should have Claude 3.x pricing defined', () => {
      expect(MODEL_PRICING['claude-3-5-sonnet-latest']).toBeDefined();
      expect(MODEL_PRICING['claude-3-5-haiku-latest']).toBeDefined();
      expect(MODEL_PRICING['claude-3-opus-latest']).toBeDefined();
    });
  });

  describe('Google model pricing', () => {
    it('should have correct Gemini 3 pricing hierarchy', () => {
      // Gemini 3 Pro > Flash
      expect(MODEL_PRICING['gemini-3-pro-preview'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gemini-3-flash-preview'].inputPer1M);
    });

    it('should have correct Gemini 2.5 pricing hierarchy', () => {
      // Gemini 2.5 Pro > Flash > Flash-Lite
      expect(MODEL_PRICING['gemini-2.5-pro'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gemini-2.5-flash'].inputPer1M);
      expect(MODEL_PRICING['gemini-2.5-flash'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gemini-2.5-flash-lite'].inputPer1M);
    });

    it('should have correct Gemini 2.0 pricing hierarchy', () => {
      // Gemini 2.0 Flash > Flash-Lite
      expect(MODEL_PRICING['gemini-2.0-flash'].inputPer1M).toBeGreaterThan(MODEL_PRICING['gemini-2.0-flash-lite'].inputPer1M);
    });

    it('should have Gemini models reasonably priced compared to competition', () => {
      // Gemini Flash models should be competitive with GPT-4o-mini
      expect(MODEL_PRICING['gemini-2.5-flash'].inputPer1M).toBeLessThanOrEqual(MODEL_PRICING['gpt-4o-mini'].inputPer1M);
      expect(MODEL_PRICING['gemini-2.0-flash'].inputPer1M).toBeLessThanOrEqual(MODEL_PRICING['gpt-4o-mini'].inputPer1M);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly for GPT-4o', () => {
      const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
      const cost = calculateCost('gpt-4o', usage);
      // GPT-4o: $2.5/1M input, $10/1M output
      // (1000/1M * 2.5) + (500/1M * 10) = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 5);
    });

    it('should calculate cost correctly for GPT-4o-mini', () => {
      const usage = { promptTokens: 10000, completionTokens: 5000, totalTokens: 15000 };
      const cost = calculateCost('gpt-4o-mini', usage);
      // GPT-4o-mini: $0.15/1M input, $0.6/1M output
      // (10000/1M * 0.15) + (5000/1M * 0.6) = 0.0015 + 0.003 = 0.0045
      expect(cost).toBeCloseTo(0.0045, 5);
    });

    it('should calculate cost correctly for Claude Sonnet 4.5', () => {
      const usage = { promptTokens: 100000, completionTokens: 50000, totalTokens: 150000 };
      const cost = calculateCost('claude-sonnet-4-5', usage);
      // Claude Sonnet 4.5: $3/1M input, $15/1M output
      // (100000/1M * 3) + (50000/1M * 15) = 0.3 + 0.75 = 1.05
      expect(cost).toBeCloseTo(1.05, 2);
    });

    it('should calculate cost correctly for Gemini 2.0 Flash', () => {
      const usage = { promptTokens: 50000, completionTokens: 25000, totalTokens: 75000 };
      const cost = calculateCost('gemini-2.0-flash', usage);
      // Gemini 2.0 Flash: $0.1/1M input, $0.4/1M output
      // (50000/1M * 0.1) + (25000/1M * 0.4) = 0.005 + 0.01 = 0.015
      expect(cost).toBeCloseTo(0.015, 4);
    });

    it('should return 0 for unknown models', () => {
      const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
      const cost = calculateCost('unknown-model', usage);
      expect(cost).toBe(0);
    });

    it('should handle zero tokens', () => {
      const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const cost = calculateCost('gpt-4o', usage);
      expect(cost).toBe(0);
    });

    it('should handle only input tokens', () => {
      const usage = { promptTokens: 1000000, completionTokens: 0, totalTokens: 1000000 };
      const cost = calculateCost('gpt-4o', usage);
      // 1M input tokens at $2.5/1M = $2.5
      expect(cost).toBeCloseTo(2.5, 2);
    });

    it('should handle only output tokens', () => {
      const usage = { promptTokens: 0, completionTokens: 1000000, totalTokens: 1000000 };
      const cost = calculateCost('gpt-4o', usage);
      // 1M output tokens at $10/1M = $10
      expect(cost).toBeCloseTo(10, 2);
    });

    it('should handle large token counts', () => {
      const usage = { promptTokens: 10000000, completionTokens: 5000000, totalTokens: 15000000 };
      const cost = calculateCost('gpt-4o', usage);
      // (10M/1M * 2.5) + (5M/1M * 10) = 25 + 50 = 75
      expect(cost).toBeCloseTo(75, 1);
    });

    it('should handle fractional results correctly', () => {
      const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };
      const cost = calculateCost('gpt-4o', usage);
      // (1/1M * 2.5) + (1/1M * 10) = 0.0000025 + 0.00001 = 0.0000125
      expect(cost).toBeCloseTo(0.0000125, 8);
    });

    it('should calculate cost for expensive models correctly', () => {
      const usage = { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 };

      // o1-pro is very expensive
      const o1ProCost = calculateCost('o1-pro', usage);
      // (1000/1M * 150) + (1000/1M * 600) = 0.15 + 0.6 = 0.75
      expect(o1ProCost).toBeCloseTo(0.75, 3);

      // o3-pro
      const o3ProCost = calculateCost('o3-pro', usage);
      // (1000/1M * 20) + (1000/1M * 80) = 0.02 + 0.08 = 0.1
      expect(o3ProCost).toBeCloseTo(0.1, 3);
    });

    it('should calculate cost for cheap models correctly', () => {
      const usage = { promptTokens: 1000000, completionTokens: 1000000, totalTokens: 2000000 };

      // gemini-2.0-flash-lite is very cheap
      const cost = calculateCost('gemini-2.0-flash-lite', usage);
      // (1M/1M * 0.075) + (1M/1M * 0.3) = 0.075 + 0.3 = 0.375
      expect(cost).toBeCloseTo(0.375, 3);
    });
  });

  describe('detectProvider', () => {
    it('should detect OpenAI models', () => {
      const openaiModels = [
        'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'gpt-5.2',
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
        'gpt-4o', 'gpt-4o-mini',
        'gpt-4-turbo', 'gpt-3.5-turbo',
        'o3', 'o3-mini', 'o3-pro',
        'o1', 'o1-mini', 'o1-pro',
      ];

      for (const model of openaiModels) {
        expect(detectProvider(model), `${model} should be OpenAI`).toBe('openai');
      }
    });

    it('should detect Anthropic models', () => {
      const anthropicModels = [
        'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5',
        'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-5-20251101',
        'claude-opus-4-1',
        'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest',
      ];

      for (const model of anthropicModels) {
        expect(detectProvider(model), `${model} should be Anthropic`).toBe('anthropic');
      }
    });

    it('should detect Google models', () => {
      const googleModels = [
        'gemini-3-pro-preview', 'gemini-3-flash-preview',
        'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
        'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      ];

      for (const model of googleModels) {
        expect(detectProvider(model), `${model} should be Google`).toBe('google');
      }
    });

    it('should default to openai for unknown models', () => {
      expect(detectProvider('unknown-model')).toBe('openai');
      expect(detectProvider('some-random-model')).toBe('openai');
    });
  });

  describe('cost comparison across providers', () => {
    const standardUsage = { promptTokens: 1000000, completionTokens: 500000, totalTokens: 1500000 };

    it('should show reasonable cost differences between tiers', () => {
      // Mini/Flash models should be significantly cheaper than flagship
      const gpt5Cost = calculateCost('gpt-5', standardUsage);
      const gpt5MiniCost = calculateCost('gpt-5-mini', standardUsage);
      expect(gpt5MiniCost).toBeLessThan(gpt5Cost * 0.5);

      const claudeOpusCost = calculateCost('claude-opus-4-5', standardUsage);
      const claudeHaikuCost = calculateCost('claude-haiku-4-5', standardUsage);
      expect(claudeHaikuCost).toBeLessThan(claudeOpusCost * 0.5);
    });

    it('should have all three providers in competitive range for equivalent tiers', () => {
      // Compare flagship models
      const gpt4oCost = calculateCost('gpt-4o', standardUsage);
      const claudeSonnetCost = calculateCost('claude-sonnet-4-5', standardUsage);
      const geminiProCost = calculateCost('gemini-2.5-pro', standardUsage);

      // All should be within same order of magnitude
      const costs = [gpt4oCost, claudeSonnetCost, geminiProCost];
      const maxCost = Math.max(...costs);
      const minCost = Math.min(...costs);
      expect(maxCost / minCost).toBeLessThan(10); // Within 10x
    });

    it('should have mini/flash models be significantly cheaper', () => {
      const gptMiniCost = calculateCost('gpt-4o-mini', standardUsage);
      const geminiFlashCost = calculateCost('gemini-2.5-flash', standardUsage);
      const claudeHaikuCost = calculateCost('claude-haiku-4-5', standardUsage);

      // All mini models should be under $5 for this usage
      expect(gptMiniCost).toBeLessThan(5);
      expect(geminiFlashCost).toBeLessThan(5);
      expect(claudeHaikuCost).toBeLessThan(5);
    });
  });
});
