/**
 * Image utilities for multimodal support.
 *
 * Provides functions for loading, validating, and preparing images for LLM APIs.
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { ImageContent, ImageMediaType } from '../types.js';

// =============================================================================
// Types
// =============================================================================

export interface ImageLoadOptions {
  /** Maximum file size in bytes (default: 20MB) */
  maxSize?: number;
  /** Convert to specific format (default: keep original) */
  convertTo?: ImageMediaType;
}

export interface ImageInfo {
  /** Original file path */
  path: string;
  /** File size in bytes */
  size: number;
  /** Detected MIME type */
  mediaType: ImageMediaType;
  /** Base64 encoded data */
  base64: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum default file size (20MB) */
const DEFAULT_MAX_SIZE = 20 * 1024 * 1024;

/** Supported image extensions and their MIME types */
const EXTENSION_TO_MIME: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** MIME types to file extensions */
const MIME_TO_EXTENSION: Record<ImageMediaType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

// =============================================================================
// Functions
// =============================================================================

/**
 * Detect image MIME type from file extension.
 *
 * @param path - File path or filename
 * @returns Detected MIME type or undefined if not recognized
 */
export function detectMediaType(path: string): ImageMediaType | undefined {
  const ext = extname(path).toLowerCase();
  return EXTENSION_TO_MIME[ext];
}

/**
 * Validate that a MIME type is supported.
 *
 * @param mediaType - MIME type to validate
 * @returns true if supported
 */
export function isSupportedMediaType(mediaType: string): mediaType is ImageMediaType {
  return mediaType in MIME_TO_EXTENSION;
}

/**
 * Get file extension for a MIME type.
 *
 * @param mediaType - MIME type
 * @returns File extension (e.g., '.jpg')
 */
export function getExtensionForMediaType(mediaType: ImageMediaType): string {
  return MIME_TO_EXTENSION[mediaType];
}

/**
 * Load an image from a file path.
 *
 * Reads the file, detects the format, and returns base64 encoded data.
 *
 * @param path - Path to the image file
 * @param options - Load options
 * @returns Image info including base64 data
 *
 * @example
 * ```ts
 * const info = await loadImage('./screenshot.png');
 * console.log(`Loaded ${info.mediaType}, ${info.size} bytes`);
 * ```
 */
export async function loadImage(
  path: string,
  options: ImageLoadOptions = {}
): Promise<ImageInfo> {
  const { maxSize = DEFAULT_MAX_SIZE } = options;

  // Detect media type from extension
  const mediaType = detectMediaType(path);
  if (!mediaType) {
    throw new Error(
      `Unsupported image format: ${extname(path)}. ` +
      `Supported formats: ${Object.keys(EXTENSION_TO_MIME).join(', ')}`
    );
  }

  // Read the file
  const buffer = await readFile(path);

  // Check file size
  if (buffer.length > maxSize) {
    throw new Error(
      `Image file too large: ${buffer.length} bytes. ` +
      `Maximum allowed: ${maxSize} bytes (${Math.round(maxSize / 1024 / 1024)}MB)`
    );
  }

  // Convert to base64
  const base64 = buffer.toString('base64');

  return {
    path,
    size: buffer.length,
    mediaType,
    base64,
  };
}

/**
 * Create an ImageContent object from a file path.
 *
 * Convenience function that loads an image and returns it in the
 * format expected by the LLM clients.
 *
 * @param path - Path to the image file
 * @param options - Load options
 * @returns ImageContent ready for use in messages
 *
 * @example
 * ```ts
 * const image = await createImageContent('./chart.png');
 * const message = {
 *   role: 'user',
 *   content: [
 *     { type: 'text', text: 'What does this chart show?' },
 *     image,
 *   ],
 * };
 * ```
 */
export async function createImageContent(
  path: string,
  options: ImageLoadOptions = {}
): Promise<ImageContent> {
  const info = await loadImage(path, options);

  return {
    type: 'image',
    source: {
      type: 'base64',
      data: info.base64,
      mediaType: info.mediaType,
    },
  };
}

/**
 * Create an ImageContent object from a URL.
 *
 * Note: URLs are passed directly to the LLM API which will fetch them.
 * Not all providers support URL-based images.
 *
 * @param url - URL of the image
 * @param mediaType - MIME type of the image (must be known)
 * @param detail - Detail level for analysis (OpenAI only)
 * @returns ImageContent ready for use in messages
 *
 * @example
 * ```ts
 * const image = createImageContentFromUrl(
 *   'https://example.com/image.jpg',
 *   'image/jpeg'
 * );
 * ```
 */
export function createImageContentFromUrl(
  url: string,
  mediaType: ImageMediaType,
  detail?: 'low' | 'high' | 'auto'
): ImageContent {
  return {
    type: 'image',
    source: {
      type: 'url',
      url,
      mediaType,
    },
    detail,
  };
}

/**
 * Create an ImageContent object from base64 data.
 *
 * @param base64 - Base64 encoded image data
 * @param mediaType - MIME type of the image
 * @param detail - Detail level for analysis (OpenAI only)
 * @returns ImageContent ready for use in messages
 *
 * @example
 * ```ts
 * const image = createImageContentFromBase64(
 *   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
 *   'image/png'
 * );
 * ```
 */
export function createImageContentFromBase64(
  base64: string,
  mediaType: ImageMediaType,
  detail?: 'low' | 'high' | 'auto'
): ImageContent {
  return {
    type: 'image',
    source: {
      type: 'base64',
      data: base64,
      mediaType,
    },
    detail,
  };
}

/**
 * Estimate the token cost of an image for OpenAI models.
 *
 * OpenAI charges differently based on image size and detail level:
 * - Low detail: 85 tokens (regardless of size)
 * - High detail: 85 tokens + 170 tokens per 512x512 tile
 *
 * Since we don't know the actual dimensions without decoding,
 * this provides estimates based on file size.
 *
 * @param size - File size in bytes
 * @param detail - Detail level ('low', 'high', 'auto')
 * @returns Estimated token count
 */
export function estimateImageTokens(
  size: number,
  detail: 'low' | 'high' | 'auto' = 'auto'
): number {
  // Low detail is always 85 tokens
  if (detail === 'low') {
    return 85;
  }

  // High detail: estimate based on file size
  // Rough heuristic: larger files likely have more detail/resolution
  // Assuming average compression, estimate pixels from file size
  const estimatedPixels = size * 2; // Very rough estimate

  // Calculate number of 512x512 tiles
  const tilesPerSide = Math.max(1, Math.ceil(Math.sqrt(estimatedPixels) / 512));
  const totalTiles = tilesPerSide * tilesPerSide;

  // 85 base tokens + 170 per tile
  return 85 + (totalTiles * 170);
}

/**
 * Validate image content.
 *
 * Checks that the image content has valid structure and data.
 *
 * @param content - ImageContent to validate
 * @returns Validation result with any errors
 */
export function validateImageContent(
  content: ImageContent
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (content.type !== 'image') {
    errors.push(`Expected type 'image', got '${content.type}'`);
  }

  if (!content.source) {
    errors.push('Missing source property');
    return { valid: false, errors };
  }

  if (!isSupportedMediaType(content.source.mediaType)) {
    errors.push(`Unsupported media type: ${content.source.mediaType}`);
  }

  if (content.source.type === 'base64') {
    if (!content.source.data) {
      errors.push('Missing base64 data for base64 source type');
    } else {
      // Basic base64 validation
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(content.source.data)) {
        errors.push('Invalid base64 encoding');
      }
    }
  } else if (content.source.type === 'url') {
    if (!content.source.url) {
      errors.push('Missing URL for url source type');
    } else {
      try {
        new URL(content.source.url);
      } catch {
        errors.push('Invalid URL format');
      }
    }
  } else {
    errors.push(`Unknown source type: ${(content.source as { type: string }).type}`);
  }

  if (content.detail && !['low', 'high', 'auto'].includes(content.detail)) {
    errors.push(`Invalid detail level: ${content.detail}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a summary of image content for logging.
 *
 * @param content - ImageContent to summarize
 * @returns Human-readable summary string
 */
export function summarizeImageContent(content: ImageContent): string {
  const source = content.source.type === 'url'
    ? `URL: ${content.source.url}`
    : `base64 (${Math.round((content.source.data?.length ?? 0) / 1024)}KB)`;

  const parts = [
    content.source.mediaType,
    source,
  ];

  if (content.detail) {
    parts.push(`detail: ${content.detail}`);
  }

  return `[Image: ${parts.join(', ')}]`;
}
