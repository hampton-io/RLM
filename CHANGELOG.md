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

## [Unreleased]

### Planned
- Caching layer for repeated queries
- Batch processing support
- Progress callbacks and webhooks
- Additional model providers
- Performance benchmarks
