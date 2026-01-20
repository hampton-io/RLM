import { describe, it, expect } from 'vitest';
import {
  estimateTokensForString,
  estimateTokensForMessages,
  estimateInputTokens,
  estimateOutputTokens,
  estimateTokens,
  estimateCost,
  estimateTotalCost,
  formatCostEstimate,
  formatCostSummary,
  compareCosts,
  getCheapestModel,
} from '../src/utils/tokens.js';
import type { Message, SupportedModel } from '../src/types.js';

describe('Token Estimation', () => {
  describe('estimateTokensForString', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokensForString('')).toBe(0);
      expect(estimateTokensForString('', 'anthropic')).toBe(0);
      expect(estimateTokensForString('', 'google')).toBe(0);
    });

    it('should estimate tokens for plain text', () => {
      const text = 'Hello, world! This is a test.';
      const tokens = estimateTokensForString(text, 'openai');

      // ~0.25 tokens per char for OpenAI
      // 29 chars * 0.25 = ~7-8 tokens
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(15);
    });

    it('should use provider-specific ratios', () => {
      const text = 'A'.repeat(100);

      const openaiTokens = estimateTokensForString(text, 'openai');
      const anthropicTokens = estimateTokensForString(text, 'anthropic');
      const googleTokens = estimateTokensForString(text, 'google');

      // OpenAI: 0.25 * 100 = 25 tokens
      expect(openaiTokens).toBe(25);

      // Anthropic: 0.27 * 100 = 27 tokens
      expect(anthropicTokens).toBe(27);

      // Google: 0.26 * 100 = 26 tokens
      expect(googleTokens).toBe(26);
    });

    it('should handle code blocks with higher token ratio', () => {
      const plainText = 'a'.repeat(100);
      const codeText = '```javascript\n' + 'a'.repeat(100) + '\n```';

      const plainTokens = estimateTokensForString(plainText, 'openai');
      const codeTokens = estimateTokensForString(codeText, 'openai');

      // Code should have more tokens due to higher ratio (0.35 vs 0.25)
      expect(codeTokens).toBeGreaterThan(plainTokens);
    });

    it('should handle mixed content with code blocks', () => {
      const text = `
Here is some explanation:

\`\`\`javascript
function hello() {
  console.log("Hello");
}
\`\`\`

And more text after.
      `;

      const tokens = estimateTokensForString(text, 'openai');
      expect(tokens).toBeGreaterThan(20);
    });
  });

  describe('estimateTokensForMessages', () => {
    it('should estimate tokens for a single message', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello, world!' },
      ];

      const tokens = estimateTokensForMessages(messages, 'openai');

      // Content tokens + overhead (4 per message) + priming (3)
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(20);
    });

    it('should estimate tokens for multiple messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: 'The answer is 4.' },
      ];

      const tokens = estimateTokensForMessages(messages, 'openai');

      // Should include overhead for each message
      expect(tokens).toBeGreaterThan(15);
    });

    it('should use provider-specific overhead', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
      ];

      const openaiTokens = estimateTokensForMessages(messages, 'openai');
      const anthropicTokens = estimateTokensForMessages(messages, 'anthropic');

      // Different overhead values should result in different totals
      expect(openaiTokens).not.toBe(anthropicTokens);
    });
  });

  describe('estimateInputTokens', () => {
    it('should estimate input tokens for RLM query', () => {
      const query = 'What is the main topic?';
      const context = 'This is a document about machine learning.';

      const tokens = estimateInputTokens(query, context, 'gpt-4o-mini');

      // Should include system prompt overhead (~800) + query + context
      expect(tokens).toBeGreaterThan(800);
    });

    it('should exclude system prompt when disabled', () => {
      const query = 'Hello';
      const context = 'World';

      const withSystem = estimateInputTokens(query, context, 'gpt-4o-mini', {
        includeSystemPrompt: true,
      });
      const withoutSystem = estimateInputTokens(query, context, 'gpt-4o-mini', {
        includeSystemPrompt: false,
      });

      expect(withSystem).toBeGreaterThan(withoutSystem);
      expect(withSystem - withoutSystem).toBeCloseTo(800, -1);
    });
  });

  describe('estimateOutputTokens', () => {
    it('should estimate output tokens', () => {
      const query = 'Summarize this document';
      const context = 'A '.repeat(1000);

      const tokens = estimateOutputTokens(query, context, 'gpt-4o-mini');

      // Should return reasonable estimate
      expect(tokens).toBeGreaterThan(50);
      expect(tokens).toBeLessThan(5000);
    });

    it('should use explicit output tokens when provided', () => {
      const query = 'Hello';
      const context = 'World';

      const tokens = estimateOutputTokens(query, context, 'gpt-4o-mini', {
        expectedOutputTokens: 500,
      });

      expect(tokens).toBe(500);
    });

    it('should scale with iterations', () => {
      const query = 'Analyze';
      const context = 'Document content here';

      const tokens1 = estimateOutputTokens(query, context, 'gpt-4o-mini', {
        estimatedIterations: 1,
      });
      const tokens3 = estimateOutputTokens(query, context, 'gpt-4o-mini', {
        estimatedIterations: 3,
      });
      const tokens5 = estimateOutputTokens(query, context, 'gpt-4o-mini', {
        estimatedIterations: 5,
      });

      expect(tokens3).toBeGreaterThan(tokens1);
      expect(tokens5).toBeGreaterThan(tokens3);
    });
  });

  describe('estimateTokens', () => {
    it('should return complete token estimate', () => {
      const query = 'What is the answer?';
      const context = 'The context here.';

      const estimate = estimateTokens(query, context, 'gpt-4o-mini');

      expect(estimate).toHaveProperty('inputTokens');
      expect(estimate).toHaveProperty('outputTokens');
      expect(estimate).toHaveProperty('totalTokens');
      expect(estimate).toHaveProperty('method');

      expect(estimate.totalTokens).toBe(estimate.inputTokens + estimate.outputTokens);
      expect(estimate.method).toBe('heuristic');
    });
  });
});

describe('Cost Estimation', () => {
  describe('estimateCost', () => {
    it('should estimate cost for known models', () => {
      const query = 'Summarize';
      const context = 'A '.repeat(1000);

      const estimate = estimateCost(query, context, 'gpt-4o-mini');

      expect(estimate).toHaveProperty('tokens');
      expect(estimate).toHaveProperty('cost');
      expect(estimate).toHaveProperty('breakdown');
      expect(estimate).toHaveProperty('model');
      expect(estimate).toHaveProperty('provider');
      expect(estimate).toHaveProperty('pricing');

      expect(estimate.cost).toBeGreaterThan(0);
      expect(estimate.breakdown.inputCost).toBeGreaterThanOrEqual(0);
      expect(estimate.breakdown.outputCost).toBeGreaterThanOrEqual(0);
      expect(estimate.cost).toBeCloseTo(
        estimate.breakdown.inputCost + estimate.breakdown.outputCost,
        10
      );
    });

    it('should return zero cost for unknown models', () => {
      const query = 'Hello';
      const context = 'World';

      const estimate = estimateCost(query, context, 'unknown-model' as SupportedModel);

      expect(estimate.cost).toBe(0);
      expect(estimate.pricing.inputPer1M).toBe(0);
    });

    it('should estimate different costs for different models', () => {
      const query = 'Analyze this';
      const context = 'Some content here.';

      const miniEstimate = estimateCost(query, context, 'gpt-4o-mini');
      const fullEstimate = estimateCost(query, context, 'gpt-4o');
      const gpt5Estimate = estimateCost(query, context, 'gpt-5');

      // More expensive models should cost more
      expect(fullEstimate.cost).toBeGreaterThan(miniEstimate.cost);
      expect(gpt5Estimate.cost).toBeGreaterThan(fullEstimate.cost);
    });

    it('should work with all providers', () => {
      const query = 'Hello';
      const context = 'World';

      const openaiEstimate = estimateCost(query, context, 'gpt-4o-mini');
      const anthropicEstimate = estimateCost(query, context, 'claude-haiku-4-5');
      const googleEstimate = estimateCost(query, context, 'gemini-2.5-flash');

      expect(openaiEstimate.provider).toBe('openai');
      expect(anthropicEstimate.provider).toBe('anthropic');
      expect(googleEstimate.provider).toBe('google');

      // All should have valid costs
      expect(openaiEstimate.cost).toBeGreaterThan(0);
      expect(anthropicEstimate.cost).toBeGreaterThan(0);
      expect(googleEstimate.cost).toBeGreaterThan(0);
    });
  });

  describe('estimateTotalCost', () => {
    it('should estimate total cost for multiple iterations', () => {
      const query = 'Analyze';
      const context = 'Content';

      const singleIteration = estimateTotalCost(query, context, 'gpt-4o-mini', {
        iterations: 1,
      });
      const threeIterations = estimateTotalCost(query, context, 'gpt-4o-mini', {
        iterations: 3,
      });
      const fiveIterations = estimateTotalCost(query, context, 'gpt-4o-mini', {
        iterations: 5,
      });

      // More iterations should cost more
      expect(threeIterations.cost).toBeGreaterThan(singleIteration.cost);
      expect(fiveIterations.cost).toBeGreaterThan(threeIterations.cost);
    });
  });
});

describe('Formatting', () => {
  describe('formatCostEstimate', () => {
    it('should format estimate for display', () => {
      const estimate = estimateCost('Hello', 'World', 'gpt-4o-mini');
      const formatted = formatCostEstimate(estimate);

      expect(formatted).toContain('Model:');
      expect(formatted).toContain('gpt-4o-mini');
      expect(formatted).toContain('Token Estimate:');
      expect(formatted).toContain('Cost Estimate:');
      expect(formatted).toContain('Pricing');
      expect(formatted).toContain('$');
    });
  });

  describe('formatCostSummary', () => {
    it('should format brief summary', () => {
      const estimate = estimateCost('Hello', 'World', 'gpt-4o-mini');
      const summary = formatCostSummary(estimate);

      expect(summary).toContain('tokens');
      expect(summary).toContain('$');
      expect(summary.length).toBeLessThan(50);
    });
  });
});

describe('Model Comparison', () => {
  describe('compareCosts', () => {
    it('should rank models by cost', () => {
      const models: SupportedModel[] = ['gpt-4o-mini', 'gpt-4o', 'gpt-5'];
      const ranked = compareCosts('Hello', 'World', models);

      expect(ranked).toHaveLength(3);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);

      // First should be cheapest
      expect(ranked[0].cost).toBeLessThanOrEqual(ranked[1].cost);
      expect(ranked[1].cost).toBeLessThanOrEqual(ranked[2].cost);
    });
  });

  describe('getCheapestModel', () => {
    it('should return the cheapest model', () => {
      const models: SupportedModel[] = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-5',
        'claude-opus-4-5',
      ];

      const { model, estimate } = getCheapestModel('Hello', 'World', models);

      // gpt-4o-mini should be cheapest among these
      expect(model).toBe('gpt-4o-mini');
      expect(estimate.model).toBe('gpt-4o-mini');
    });

    it('should work with single model', () => {
      const models: SupportedModel[] = ['gpt-4o'];
      const { model } = getCheapestModel('Hello', 'World', models);

      expect(model).toBe('gpt-4o');
    });
  });
});

describe('LLM Client countTokens', () => {
  it('should be inherited from BaseLLMClient', async () => {
    // Import dynamically to check inheritance
    const { BaseLLMClient } = await import('../src/clients/base.js');

    // Verify countTokens is defined on the prototype
    expect(BaseLLMClient.prototype.countTokens).toBeDefined();
    expect(typeof BaseLLMClient.prototype.countTokens).toBe('function');
  });
});
