import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Google GenAI SDK - everything must be inside the factory due to hoisting
vi.mock('@google/genai', async (importOriginal) => {
  const { vi: vitest } = await import('vitest');
  return {
    GoogleGenAI: vitest.fn(function MockGoogleGenAI(this: any) {
      this.models = {
        generateContent: vitest.fn(),
        generateContentStream: vitest.fn(),
      };
    }),
  };
});

import { GoogleClient } from '../src/clients/google.js';
import { GoogleGenAI } from '@google/genai';

describe('GoogleClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GOOGLE_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create client with API key from config', () => {
      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'config-key' });
      expect(client.model).toBe('gemini-2.0-flash');
      expect(client.provider).toBe('google');
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'config-key' });
    });

    it('should create client with GOOGLE_API_KEY env var', () => {
      process.env.GOOGLE_API_KEY = 'env-google-key';
      delete process.env.GEMINI_API_KEY;
      const client = new GoogleClient('gemini-2.0-flash');
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'env-google-key' });
    });

    it('should create client with GEMINI_API_KEY env var', () => {
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'env-gemini-key';
      const client = new GoogleClient('gemini-2.0-flash');
      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'env-gemini-key' });
    });

    it('should throw error without API key', () => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      expect(() => new GoogleClient('gemini-2.0-flash')).toThrow(
        'Google API key is required'
      );
    });

    it('should support all Gemini models', () => {
      const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
      ];

      for (const model of models) {
        const client = new GoogleClient(model as any, { apiKey: 'test-key' });
        expect(client.model).toBe(model);
      }
    });
  });

  describe('completion', () => {
    it('should generate basic completion', async () => {
      const mockResponse = {
        text: 'Hello, world!',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const result = await client.completion([
        { role: 'user', content: 'Say hello' },
      ]);

      expect(result.content).toBe('Hello, world!');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
      expect(result.finishReason).toBe('stop');
    });

    it('should handle system messages', async () => {
      const mockResponse = {
        text: 'I am a helpful assistant.',
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 8,
          totalTokenCount: 28,
        },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      await client.completion([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who are you?' },
      ]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: 'You are a helpful assistant.',
          }),
        })
      );
    });

    it('should handle multi-turn conversations', async () => {
      const mockResponse = {
        text: 'Your name is Alice.',
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 6,
          totalTokenCount: 36,
        },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      await client.completion([
        { role: 'user', content: 'My name is Alice.' },
        { role: 'assistant', content: 'Nice to meet you, Alice!' },
        { role: 'user', content: 'What is my name?' },
      ]);

      // Should convert messages to Gemini format with 'model' role for assistant
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
            expect.objectContaining({ role: 'model' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        })
      );
    });

    it('should pass completion options', async () => {
      const mockResponse = {
        text: 'Response',
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      await client.completion([{ role: 'user', content: 'Hi' }], {
        maxTokens: 100,
        temperature: 0.5,
        stopSequences: ['STOP'],
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxOutputTokens: 100,
            temperature: 0.5,
            stopSequences: ['STOP'],
          }),
        })
      );
    });

    it('should handle MAX_TOKENS finish reason', async () => {
      const mockResponse = {
        text: 'Truncated...',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 100, totalTokenCount: 110 },
        candidates: [{ finishReason: 'MAX_TOKENS' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const result = await client.completion([{ role: 'user', content: 'Long story' }]);

      expect(result.finishReason).toBe('length');
    });

    it('should handle SAFETY finish reason', async () => {
      const mockResponse = {
        text: '',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 },
        candidates: [{ finishReason: 'SAFETY' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const result = await client.completion([{ role: 'user', content: 'Bad content' }]);

      expect(result.finishReason).toBe('content_filter');
    });

    it('should handle API errors', async () => {
      const mockGenerateContent = vi.fn().mockRejectedValue(new Error('API Error'));
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });

      await expect(
        client.completion([{ role: 'user', content: 'Hi' }])
      ).rejects.toThrow('API Error');
    });

    it('should handle missing usage metadata', async () => {
      const mockResponse = {
        text: 'Response',
        usageMetadata: undefined,
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const result = await client.completion([{ role: 'user', content: 'Hi' }]);

      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
      expect(result.usage.totalTokens).toBe(0);
    });

    it('should handle null text response', async () => {
      const mockResponse = {
        text: null,
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0, totalTokenCount: 5 },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const result = await client.completion([{ role: 'user', content: 'Hi' }]);

      expect(result.content).toBe('');
    });
  });

  describe('streamCompletion', () => {
    it('should stream content chunks', async () => {
      const mockStream = (async function* () {
        yield { text: 'Hello', usageMetadata: null, candidates: null };
        yield { text: ', ', usageMetadata: null, candidates: null };
        yield {
          text: 'world!',
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
          candidates: [{ finishReason: 'STOP' }],
        };
      })();

      const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: vi.fn(),
          generateContentStream: mockGenerateContentStream,
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const chunks: string[] = [];
      let finalResult;

      const generator = client.streamCompletion([{ role: 'user', content: 'Say hello' }]);
      for await (const chunk of generator) {
        chunks.push(chunk.content);
        if (chunk.done) {
          finalResult = await generator.next();
        }
      }

      expect(chunks.join('')).toContain('Hello');
      expect(chunks.join('')).toContain('world');
    });

    it('should return final result with usage', async () => {
      const mockStream = (async function* () {
        yield { text: 'Test', usageMetadata: null, candidates: null };
        yield {
          text: ' response',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          candidates: [{ finishReason: 'STOP' }],
        };
      })();

      const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: vi.fn(),
          generateContentStream: mockGenerateContentStream,
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const generator = client.streamCompletion([{ role: 'user', content: 'Test' }]);

      // Consume all chunks
      let result;
      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          result = value;
          break;
        }
      }

      expect(result?.content).toBe('Test response');
      expect(result?.usage.promptTokens).toBe(10);
      expect(result?.usage.completionTokens).toBe(5);
      expect(result?.finishReason).toBe('stop');
    });

    it('should handle system messages in streaming', async () => {
      const mockStream = (async function* () {
        yield { text: 'I am helpful', usageMetadata: null, candidates: null };
        yield {
          text: '',
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 4, totalTokenCount: 19 },
          candidates: [{ finishReason: 'STOP' }],
        };
      })();

      const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: vi.fn(),
          generateContentStream: mockGenerateContentStream,
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const generator = client.streamCompletion([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Who are you?' },
      ]);

      // Consume generator
      for await (const _ of generator) {}

      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction: 'Be helpful',
          }),
        })
      );
    });

    it('should handle empty chunks', async () => {
      const mockStream = (async function* () {
        yield { text: '', usageMetadata: null, candidates: null };
        yield { text: 'Content', usageMetadata: null, candidates: null };
        yield { text: '', usageMetadata: null, candidates: null };
        yield {
          text: '',
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
          candidates: [{ finishReason: 'STOP' }],
        };
      })();

      const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: vi.fn(),
          generateContentStream: mockGenerateContentStream,
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      const chunks: string[] = [];

      const generator = client.streamCompletion([{ role: 'user', content: 'Test' }]);
      for await (const chunk of generator) {
        if (chunk.content) {
          chunks.push(chunk.content);
        }
      }

      expect(chunks).toContain('Content');
    });
  });

  describe('multimodal content', () => {
    it('should handle text-only multimodal content', async () => {
      const mockResponse = {
        text: 'Processed text',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 13 },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      await client.completion([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello from multimodal' }],
        },
      ]);

      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should handle image content with base64', async () => {
      const mockResponse = {
        text: 'I see an image',
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 5, totalTokenCount: 505 },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      await client.completion([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What do you see?' },
            {
              type: 'image',
              source: {
                type: 'base64',
                mediaType: 'image/png',
                data: 'iVBORw0KGgo=',
              },
            },
          ],
        },
      ]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({ text: 'What do you see?' }),
                expect.objectContaining({
                  inlineData: expect.objectContaining({
                    mimeType: 'image/png',
                    data: 'iVBORw0KGgo=',
                  }),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle image URL as text placeholder', async () => {
      const mockResponse = {
        text: 'URL placeholder noted',
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 4, totalTokenCount: 24 },
        candidates: [{ finishReason: 'STOP' }],
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
      await client.completion([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: 'https://example.com/image.png',
              },
            },
          ],
        },
      ]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('https://example.com/image.png'),
                }),
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('429 Too Many Requests');
      (rateLimitError as any).status = 429;

      const mockGenerateContent = vi.fn().mockRejectedValue(rateLimitError);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });

      await expect(
        client.completion([{ role: 'user', content: 'Hi' }])
      ).rejects.toThrow('429');
    });

    it('should handle server errors', async () => {
      const serverError = new Error('500 Internal Server Error');
      (serverError as any).status = 500;

      const mockGenerateContent = vi.fn().mockRejectedValue(serverError);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });

      await expect(
        client.completion([{ role: 'user', content: 'Hi' }])
      ).rejects.toThrow('500');
    });

    it('should handle invalid API key', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;

      const mockGenerateContent = vi.fn().mockRejectedValue(authError);
      (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
        models: {
          generateContent: mockGenerateContent,
          generateContentStream: vi.fn(),
        },
      }); });

      const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'bad-key' });

      await expect(
        client.completion([{ role: 'user', content: 'Hi' }])
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('finish reason mapping', () => {
    const testCases = [
      { input: 'STOP', expected: 'stop' },
      { input: 'MAX_TOKENS', expected: 'length' },
      { input: 'SAFETY', expected: 'content_filter' },
      { input: 'RECITATION', expected: 'content_filter' },
      { input: 'BLOCKLIST', expected: 'content_filter' },
      { input: 'OTHER', expected: 'unknown' },
      { input: undefined, expected: 'unknown' },
      { input: null, expected: 'unknown' },
    ];

    for (const { input, expected } of testCases) {
      it(`should map "${input}" to "${expected}"`, async () => {
        const mockResponse = {
          text: 'Response',
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
          candidates: [{ finishReason: input }],
        };

        const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
        (GoogleGenAI as any).mockImplementation(function(this: any) { Object.assign(this, {
          models: {
            generateContent: mockGenerateContent,
            generateContentStream: vi.fn(),
          },
        }); });

        const client = new GoogleClient('gemini-2.0-flash', { apiKey: 'test-key' });
        const result = await client.completion([{ role: 'user', content: 'Hi' }]);

        expect(result.finishReason).toBe(expected);
      });
    }
  });
});
