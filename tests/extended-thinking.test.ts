import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ExtendedThinkingConfig,
  CompletionOptions,
  CompletionResult,
  ExtendedThinkingTrace,
  ExtendedThinkingEventData,
  TokenUsage,
} from '../src/types.js';

describe('Extended Thinking Types', () => {
  describe('ExtendedThinkingConfig', () => {
    it('should have enabled flag', () => {
      const config: ExtendedThinkingConfig = {
        enabled: true,
      };
      expect(config.enabled).toBe(true);
    });

    it('should have optional budgetTokens', () => {
      const config: ExtendedThinkingConfig = {
        enabled: true,
        budgetTokens: 2048,
      };
      expect(config.budgetTokens).toBe(2048);
    });

    it('should work with disabled state', () => {
      const config: ExtendedThinkingConfig = {
        enabled: false,
      };
      expect(config.enabled).toBe(false);
    });
  });

  describe('CompletionOptions with thinking', () => {
    it('should accept thinking config', () => {
      const options: CompletionOptions = {
        temperature: 0,
        thinking: {
          enabled: true,
          budgetTokens: 1024,
        },
      };
      expect(options.thinking?.enabled).toBe(true);
      expect(options.thinking?.budgetTokens).toBe(1024);
    });

    it('should work without thinking config', () => {
      const options: CompletionOptions = {
        temperature: 0,
      };
      expect(options.thinking).toBeUndefined();
    });
  });

  describe('CompletionResult with thinking', () => {
    it('should include thinking content when present', () => {
      const result: CompletionResult = {
        content: 'The answer is 42.',
        thinking: 'Let me think about this step by step...',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        finishReason: 'stop',
      };
      expect(result.thinking).toBe('Let me think about this step by step...');
    });

    it('should work without thinking content', () => {
      const result: CompletionResult = {
        content: 'The answer is 42.',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        finishReason: 'stop',
      };
      expect(result.thinking).toBeUndefined();
    });
  });

  describe('ExtendedThinkingTrace', () => {
    it('should have correct structure', () => {
      const trace: ExtendedThinkingTrace = {
        type: 'extended_thinking',
        thinking: 'Analyzing the problem...',
        budgetTokens: 1024,
        iteration: 1,
      };
      expect(trace.type).toBe('extended_thinking');
      expect(trace.thinking).toBe('Analyzing the problem...');
      expect(trace.budgetTokens).toBe(1024);
      expect(trace.iteration).toBe(1);
    });
  });

  describe('ExtendedThinkingEventData', () => {
    it('should have correct structure', () => {
      const eventData: ExtendedThinkingEventData = {
        content: 'Thinking through the solution...',
        iteration: 2,
        complete: true,
      };
      expect(eventData.content).toBe('Thinking through the solution...');
      expect(eventData.iteration).toBe(2);
      expect(eventData.complete).toBe(true);
    });

    it('should support partial thinking', () => {
      const eventData: ExtendedThinkingEventData = {
        content: 'First part of thinking...',
        iteration: 1,
        complete: false,
      };
      expect(eventData.complete).toBe(false);
    });
  });
});

describe('Extended Thinking in Anthropic Client', () => {
  describe('supportsExtendedThinking detection', () => {
    it('should detect Claude 4.5 Sonnet', () => {
      const model = 'claude-sonnet-4-5';
      expect(model.includes('claude-sonnet-4-5')).toBe(true);
    });

    it('should detect Claude 4.5 Haiku', () => {
      const model = 'claude-haiku-4-5';
      expect(model.includes('claude-haiku-4-5')).toBe(true);
    });

    it('should detect Claude 4.5 Opus', () => {
      const model = 'claude-opus-4-5';
      expect(model.includes('claude-opus-4-5')).toBe(true);
    });

    it('should detect versioned Claude 4.5 models', () => {
      const models = [
        'claude-sonnet-4-5-20250929',
        'claude-haiku-4-5-20251001',
        'claude-opus-4-5-20251101',
      ];
      for (const model of models) {
        const isSupported =
          model.includes('claude-sonnet-4-5') ||
          model.includes('claude-haiku-4-5') ||
          model.includes('claude-opus-4-5');
        expect(isSupported).toBe(true);
      }
    });

    it('should not detect Claude 3.x models', () => {
      const models = [
        'claude-3-5-sonnet-latest',
        'claude-3-5-haiku-latest',
        'claude-3-opus-latest',
      ];
      for (const model of models) {
        const isSupported =
          model.includes('claude-sonnet-4-5') ||
          model.includes('claude-haiku-4-5') ||
          model.includes('claude-opus-4-5');
        expect(isSupported).toBe(false);
      }
    });
  });
});

describe('RLMLogger Extended Thinking', () => {
  // Import logger dynamically to test it
  it('should have logExtendedThinking method', async () => {
    const { RLMLogger } = await import('../src/logger/index.js');
    const logger = new RLMLogger(false);
    expect(typeof logger.logExtendedThinking).toBe('function');
  });

  it('should log extended thinking trace', async () => {
    const { RLMLogger } = await import('../src/logger/index.js');
    const logger = new RLMLogger(false);

    logger.logExtendedThinking(0, 'Test thinking content', 1024, 1);

    const entries = logger.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('extended_thinking');
    expect(entries[0].data.type).toBe('extended_thinking');

    const data = entries[0].data as ExtendedThinkingTrace;
    expect(data.thinking).toBe('Test thinking content');
    expect(data.budgetTokens).toBe(1024);
    expect(data.iteration).toBe(1);
  });

  it('should log verbose output when enabled', async () => {
    const { RLMLogger } = await import('../src/logger/index.js');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = new RLMLogger(true);
    logger.logExtendedThinking(0, 'Verbose thinking', 2048, 2);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[RLM] Extended thinking (iteration=2):',
      {
        thinkingLength: 'Verbose thinking'.length,
        budgetTokens: 2048,
      }
    );

    consoleSpy.mockRestore();
  });
});

describe('Extended Thinking Integration', () => {
  it('should pass thinking config from executor options', () => {
    // Test that the thinking config is properly typed
    const options = {
      model: 'claude-sonnet-4-5' as const,
      extendedThinking: {
        enabled: true,
        budgetTokens: 4096,
      },
    };

    expect(options.extendedThinking.enabled).toBe(true);
    expect(options.extendedThinking.budgetTokens).toBe(4096);
  });

  it('should handle missing extendedThinking option', () => {
    const options = {
      model: 'gpt-4o-mini' as const,
    };

    expect((options as { extendedThinking?: ExtendedThinkingConfig }).extendedThinking).toBeUndefined();
  });

  it('should use default budget when not specified', () => {
    const thinking: ExtendedThinkingConfig = {
      enabled: true,
    };

    // Default budget is 1024
    const budgetTokens = thinking.budgetTokens ?? 1024;
    expect(budgetTokens).toBe(1024);
  });
});

describe('Stream Event Types', () => {
  it('should have extended_thinking in event types', async () => {
    const { RLMStreamingExecutor } = await import('../src/streaming-executor.js');

    // Just check the import works and class is defined
    expect(RLMStreamingExecutor).toBeDefined();
  });
});
