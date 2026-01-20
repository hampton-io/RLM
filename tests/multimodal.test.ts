import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type {
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  ImageMediaType,
} from '../src/types.js';
import {
  isMultimodalContent,
  isImageContent,
  isTextContent,
  getTextFromContent,
  getImagesFromContent,
} from '../src/types.js';
import {
  detectMediaType,
  isSupportedMediaType,
  getExtensionForMediaType,
  loadImage,
  createImageContent,
  createImageContentFromUrl,
  createImageContentFromBase64,
  estimateImageTokens,
  validateImageContent,
  summarizeImageContent,
} from '../src/utils/images.js';

describe('Multimodal Types', () => {
  describe('TextContent', () => {
    it('should have correct structure', () => {
      const text: TextContent = {
        type: 'text',
        text: 'Hello, world!',
      };
      expect(text.type).toBe('text');
      expect(text.text).toBe('Hello, world!');
    });
  });

  describe('ImageContent', () => {
    it('should support base64 source', () => {
      const image: ImageContent = {
        type: 'image',
        source: {
          type: 'base64',
          data: 'iVBORw0KGgo=',
          mediaType: 'image/png',
        },
      };
      expect(image.type).toBe('image');
      expect(image.source.type).toBe('base64');
      expect(image.source.data).toBe('iVBORw0KGgo=');
    });

    it('should support URL source', () => {
      const image: ImageContent = {
        type: 'image',
        source: {
          type: 'url',
          url: 'https://example.com/image.jpg',
          mediaType: 'image/jpeg',
        },
      };
      expect(image.source.type).toBe('url');
      expect(image.source.url).toBe('https://example.com/image.jpg');
    });

    it('should support detail option', () => {
      const image: ImageContent = {
        type: 'image',
        source: {
          type: 'base64',
          data: 'test',
          mediaType: 'image/png',
        },
        detail: 'high',
      };
      expect(image.detail).toBe('high');
    });
  });

  describe('MessageContent', () => {
    it('should support string content', () => {
      const content: MessageContent = 'Simple text message';
      expect(typeof content).toBe('string');
    });

    it('should support array of content parts', () => {
      const content: MessageContent = [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image', source: { type: 'base64', data: 'test', mediaType: 'image/png' } },
      ];
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBe(2);
    });
  });

  describe('Message with multimodal content', () => {
    it('should support multimodal user message', () => {
      const message: Message = {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
          { type: 'image', source: { type: 'url', url: 'https://example.com/img.jpg', mediaType: 'image/jpeg' } },
        ],
      };
      expect(message.role).toBe('user');
      expect(Array.isArray(message.content)).toBe(true);
    });
  });
});

describe('Multimodal Helper Functions', () => {
  describe('isMultimodalContent', () => {
    it('should return false for string content', () => {
      expect(isMultimodalContent('text')).toBe(false);
    });

    it('should return true for array content', () => {
      expect(isMultimodalContent([{ type: 'text', text: 'hi' }])).toBe(true);
    });
  });

  describe('isImageContent', () => {
    it('should return true for image content', () => {
      const part: ImageContent = {
        type: 'image',
        source: { type: 'base64', data: 'test', mediaType: 'image/png' },
      };
      expect(isImageContent(part)).toBe(true);
    });

    it('should return false for text content', () => {
      const part: TextContent = { type: 'text', text: 'hello' };
      expect(isImageContent(part)).toBe(false);
    });
  });

  describe('isTextContent', () => {
    it('should return true for text content', () => {
      const part: TextContent = { type: 'text', text: 'hello' };
      expect(isTextContent(part)).toBe(true);
    });

    it('should return false for image content', () => {
      const part: ImageContent = {
        type: 'image',
        source: { type: 'base64', data: 'test', mediaType: 'image/png' },
      };
      expect(isTextContent(part)).toBe(false);
    });
  });

  describe('getTextFromContent', () => {
    it('should return string content as-is', () => {
      expect(getTextFromContent('hello world')).toBe('hello world');
    });

    it('should extract text from multimodal content', () => {
      const content: MessageContent = [
        { type: 'text', text: 'First' },
        { type: 'image', source: { type: 'base64', data: 'test', mediaType: 'image/png' } },
        { type: 'text', text: 'Second' },
      ];
      expect(getTextFromContent(content)).toBe('First\nSecond');
    });

    it('should return empty string for image-only content', () => {
      const content: MessageContent = [
        { type: 'image', source: { type: 'base64', data: 'test', mediaType: 'image/png' } },
      ];
      expect(getTextFromContent(content)).toBe('');
    });
  });

  describe('getImagesFromContent', () => {
    it('should return empty array for string content', () => {
      expect(getImagesFromContent('hello')).toEqual([]);
    });

    it('should extract images from multimodal content', () => {
      const content: MessageContent = [
        { type: 'text', text: 'First' },
        { type: 'image', source: { type: 'base64', data: 'img1', mediaType: 'image/png' } },
        { type: 'image', source: { type: 'url', url: 'https://example.com', mediaType: 'image/jpeg' } },
      ];
      const images = getImagesFromContent(content);
      expect(images.length).toBe(2);
      expect(images[0].source.data).toBe('img1');
      expect(images[1].source.url).toBe('https://example.com');
    });
  });
});

describe('Image Utilities', () => {
  describe('detectMediaType', () => {
    it('should detect JPEG', () => {
      expect(detectMediaType('photo.jpg')).toBe('image/jpeg');
      expect(detectMediaType('photo.jpeg')).toBe('image/jpeg');
    });

    it('should detect PNG', () => {
      expect(detectMediaType('image.png')).toBe('image/png');
    });

    it('should detect GIF', () => {
      expect(detectMediaType('animation.gif')).toBe('image/gif');
    });

    it('should detect WebP', () => {
      expect(detectMediaType('modern.webp')).toBe('image/webp');
    });

    it('should return undefined for unsupported formats', () => {
      expect(detectMediaType('video.mp4')).toBeUndefined();
      expect(detectMediaType('document.pdf')).toBeUndefined();
    });

    it('should be case insensitive', () => {
      expect(detectMediaType('IMAGE.PNG')).toBe('image/png');
      expect(detectMediaType('photo.JPG')).toBe('image/jpeg');
    });
  });

  describe('isSupportedMediaType', () => {
    it('should return true for supported types', () => {
      expect(isSupportedMediaType('image/jpeg')).toBe(true);
      expect(isSupportedMediaType('image/png')).toBe(true);
      expect(isSupportedMediaType('image/gif')).toBe(true);
      expect(isSupportedMediaType('image/webp')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(isSupportedMediaType('image/bmp')).toBe(false);
      expect(isSupportedMediaType('video/mp4')).toBe(false);
    });
  });

  describe('getExtensionForMediaType', () => {
    it('should return correct extensions', () => {
      expect(getExtensionForMediaType('image/jpeg')).toBe('.jpg');
      expect(getExtensionForMediaType('image/png')).toBe('.png');
      expect(getExtensionForMediaType('image/gif')).toBe('.gif');
      expect(getExtensionForMediaType('image/webp')).toBe('.webp');
    });
  });

  describe('createImageContentFromUrl', () => {
    it('should create URL-based image content', () => {
      const content = createImageContentFromUrl('https://example.com/img.jpg', 'image/jpeg');
      expect(content.type).toBe('image');
      expect(content.source.type).toBe('url');
      expect(content.source.url).toBe('https://example.com/img.jpg');
      expect(content.source.mediaType).toBe('image/jpeg');
    });

    it('should include detail option', () => {
      const content = createImageContentFromUrl('https://example.com/img.jpg', 'image/jpeg', 'high');
      expect(content.detail).toBe('high');
    });
  });

  describe('createImageContentFromBase64', () => {
    it('should create base64-based image content', () => {
      const content = createImageContentFromBase64('iVBORw0KGgo=', 'image/png');
      expect(content.type).toBe('image');
      expect(content.source.type).toBe('base64');
      expect(content.source.data).toBe('iVBORw0KGgo=');
      expect(content.source.mediaType).toBe('image/png');
    });
  });

  describe('estimateImageTokens', () => {
    it('should return 85 tokens for low detail', () => {
      expect(estimateImageTokens(1000000, 'low')).toBe(85);
    });

    it('should estimate more tokens for larger images', () => {
      const small = estimateImageTokens(10000, 'high');
      const large = estimateImageTokens(1000000, 'high');
      expect(large).toBeGreaterThan(small);
    });

    it('should default to auto detail', () => {
      const tokens = estimateImageTokens(50000);
      expect(tokens).toBeGreaterThan(85);
    });
  });

  describe('validateImageContent', () => {
    it('should validate correct base64 content', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'base64', data: 'iVBORw0KGgo=', mediaType: 'image/png' },
      };
      const result = validateImageContent(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct URL content', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'url', url: 'https://example.com/img.png', mediaType: 'image/png' },
      };
      const result = validateImageContent(content);
      expect(result.valid).toBe(true);
    });

    it('should detect missing base64 data', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'base64', mediaType: 'image/png' },
      };
      const result = validateImageContent(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing base64 data for base64 source type');
    });

    it('should detect missing URL', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'url', mediaType: 'image/png' },
      };
      const result = validateImageContent(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing URL for url source type');
    });

    it('should detect invalid URL format', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'url', url: 'not-a-url', mediaType: 'image/png' },
      };
      const result = validateImageContent(content);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid URL format');
    });

    it('should detect unsupported media type', () => {
      const content = {
        type: 'image' as const,
        source: { type: 'base64' as const, data: 'test', mediaType: 'image/bmp' as ImageMediaType },
      };
      const result = validateImageContent(content);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unsupported media type'))).toBe(true);
    });
  });

  describe('summarizeImageContent', () => {
    it('should summarize URL-based content', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'url', url: 'https://example.com/img.png', mediaType: 'image/png' },
      };
      const summary = summarizeImageContent(content);
      expect(summary).toContain('image/png');
      expect(summary).toContain('URL:');
      expect(summary).toContain('example.com');
    });

    it('should summarize base64 content with size', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'base64', data: 'A'.repeat(1000), mediaType: 'image/jpeg' },
      };
      const summary = summarizeImageContent(content);
      expect(summary).toContain('image/jpeg');
      expect(summary).toContain('base64');
      expect(summary).toContain('KB');
    });

    it('should include detail level', () => {
      const content: ImageContent = {
        type: 'image',
        source: { type: 'base64', data: 'test', mediaType: 'image/png' },
        detail: 'high',
      };
      const summary = summarizeImageContent(content);
      expect(summary).toContain('detail: high');
    });
  });
});

describe('loadImage', () => {
  const testDir = join(tmpdir(), 'rlm-multimodal-test');
  const testImagePath = join(testDir, 'test.png');

  // Minimal valid PNG (1x1 pixel, transparent)
  const minimalPNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
    0x42, 0x60, 0x82,
  ]);

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(testImagePath, minimalPNG);
  });

  afterEach(async () => {
    try {
      await unlink(testImagePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should load a PNG image', async () => {
    const info = await loadImage(testImagePath);
    expect(info.mediaType).toBe('image/png');
    expect(info.size).toBe(minimalPNG.length);
    expect(info.base64).toBeTruthy();
  });

  it('should throw for unsupported formats', async () => {
    const txtPath = join(testDir, 'test.txt');
    await writeFile(txtPath, 'hello');

    await expect(loadImage(txtPath)).rejects.toThrow('Unsupported image format');

    await unlink(txtPath);
  });

  it('should throw for file too large', async () => {
    await expect(loadImage(testImagePath, { maxSize: 10 })).rejects.toThrow('too large');
  });
});

describe('createImageContent from file', () => {
  const testDir = join(tmpdir(), 'rlm-multimodal-test-2');
  const testImagePath = join(testDir, 'test.jpg');

  // Minimal valid JPEG
  const minimalJPEG = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, // JPEG header
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, // DQT
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
    0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
    0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34,
    0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, // SOF
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, // DHT
    0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff,
    0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04,
    0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00,
    0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32,
    0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1,
    0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a,
    0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, // SOS
    0x3f, 0x00, 0xfb, 0xd3, 0xff, 0xd9, // EOI
  ]);

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(testImagePath, minimalJPEG);
  });

  afterEach(async () => {
    try {
      await unlink(testImagePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create ImageContent from file', async () => {
    const content = await createImageContent(testImagePath);
    expect(content.type).toBe('image');
    expect(content.source.type).toBe('base64');
    expect(content.source.mediaType).toBe('image/jpeg');
    expect(content.source.data).toBeTruthy();
  });
});
