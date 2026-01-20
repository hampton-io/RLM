# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-20

### Added

#### Core Features
- **RLM Class**: Main entry point for recursive language model completions
- **Streaming Support**: Real-time progress updates via async generators
- **Multi-Provider Support**: OpenAI (GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo) and Anthropic (Claude 3.5 Sonnet, Haiku, Opus)

#### Sandbox Environment
- Secure VM-based JavaScript sandbox using Node.js `vm` module
- Context variable injection for long document processing
- `llm_query()` function for recursive sub-queries
- `llm_query_parallel()` for parallel sub-queries
- Utility functions: `print()`, `chunk()`, `grep()`, `len()`
- Configurable timeout and memory limits

#### Execution Engine
- REPL-style execution loop with configurable max iterations
- `FINAL("answer")` and `FINAL_VAR("varName")` termination signals
- Recursive depth tracking with configurable limits
- Code block extraction and execution from LLM responses

#### API & Deployment
- Vercel-ready API routes (`/api/completion`, `/api/health`)
- Server-Sent Events (SSE) streaming endpoint
- Request validation with Zod schemas
- CORS and error handling middleware

#### Observability
- Comprehensive trace logging with timestamps
- Token usage tracking per call and total
- Cost estimation for all supported models
- JSONL export format for trace analysis
- Console and file trace reporters

#### Resilience
- Retry utilities with exponential backoff and jitter
- `ResilientClient` wrapper for automatic retries
- Retryable error detection (rate limits, network errors)
- Configurable retry strategies

#### Rate Limiting
- Token bucket rate limiter
- Requests-per-minute and tokens-per-minute limits
- Provider-specific rate limit presets
- `withRateLimit()` wrapper function

#### Cost Management
- `CostTracker` class for budget enforcement
- Per-model pricing data
- `BudgetExceededError` and `TokenLimitExceededError`

#### Timeout Handling
- `withTimeout()` function with abort signal support
- Partial results on timeout
- `ExecutionTimer` for tracking execution time
- Deadline utilities

#### CLI
- Command-line interface for testing
- File and stdin context input
- Streaming and verbose modes
- Model selection and configuration flags

#### Examples
- Basic usage example
- Needle-in-haystack benchmark
- Long document Q&A
- Multi-document reasoning

#### Testing
- Comprehensive unit tests (133 tests)
- Sandbox security and isolation tests
- LLM client mocking helpers
- Integration tests with mock clients
- Retry and timeout utility tests

### Technical Details

- **Language**: TypeScript 5.7
- **Runtime**: Node.js 20+
- **Build**: TypeScript compiler
- **Test Framework**: Vitest
- **Package Type**: ES Modules

### Dependencies

- `openai` ^4.77.0 - OpenAI API client
- `@anthropic-ai/sdk` ^0.39.0 - Anthropic API client
- `zod` ^3.24.1 - Schema validation

## [0.2.0] - 2026-01-20

### Added

#### Google Gemini Support
- New `GoogleClient` for Google Gemini models
- Supported models: Gemini 3 Pro/Flash (preview), Gemini 2.5 Pro/Flash/Flash-Lite, Gemini 2.0 Flash/Flash-Lite
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` environment variable support
- Full streaming support for Gemini models
- Model pricing for all Gemini variants

#### OpenAI Model Updates (January 2026)
- **GPT-5 Series**: `gpt-5`, `gpt-5-mini`, `gpt-5.1`, `gpt-5.2` - Latest flagship reasoning models
- **GPT-4.1 Series**: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- **o3 Reasoning Models**: `o3`, `o3-mini`, `o3-pro`
- **o1 Reasoning Models**: `o1`, `o1-mini`, `o1-pro`

#### Anthropic Model Updates (January 2026)
- **Claude 4.5 Series**: `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5` - Current flagship
- **Versioned aliases**: `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`, `claude-opus-4-5-20251101`
- **Claude 4 Legacy**: `claude-sonnet-4`, `claude-opus-4`, `claude-opus-4-1`
- Deprecated Claude 3.x models still available for backwards compatibility

#### Advanced Features (from Phase 6)
- **Caching Layer**: LRU cache with configurable TTL, max entries, and max size
- **Batch Processing**: Process multiple queries in parallel with configurable concurrency
- **Progress Callbacks**: Event-based progress tracking with webhook support
- **Progress Bar**: CLI helper for displaying execution progress

### Changed
- Updated `ModelProvider` type to include `'google'`
- Updated `detectProvider()` to detect Gemini models
- Updated model pricing for all providers (January 2026 rates)
- README documentation with comprehensive model tables

### Dependencies
- Added `@google/genai` ^1.0.0 for Gemini API support

## [Unreleased]

### Planned
- Performance benchmarks
- Additional examples for new models
- Extended thinking mode support for Claude 4.5
