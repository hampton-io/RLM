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

### Added

#### Token Counter & Cost Estimation (Phase 8.1)
- New `src/utils/tokens.ts` module with comprehensive token counting utilities
- `estimateTokens()` for pre-execution token prediction using provider-specific heuristics
- `estimateTokensForString()` with provider-aware character-to-token ratios
- `estimateTokensForMessages()` for message array token estimation
- `estimateCost()` and `estimateTotalCost()` for pre-execution cost prediction
- `formatCostEstimate()` and `formatCostSummary()` for display formatting
- `compareCosts()` and `getCheapestModel()` for multi-model cost comparison
- `countTokens()` method added to `LLMClient` interface and `BaseLLMClient`
- CLI `--estimate` flag for cost estimation without execution
- CLI `--compare` flag for comparing costs across 12 popular models
- 25 new unit tests for token counting accuracy

#### Dry Run Mode (Phase 8.2)
- `DryRunResult` type for comprehensive dry run output
- Static `RLM.dryRun()` method - no API keys required
- `RLM.formatDryRun()` for formatted console output
- Shows configuration, context stats, token/cost estimates
- Lists all available sandbox functions
- Previews system prompt
- CLI `--dry-run` flag for full dry run analysis

#### Model Fallback Chain (Phase 8.3)
- `FallbackChainClient` - automatic retry with next model on failure
- `FallbackChainOptions` interface with customizable retry behavior
- `FallbackEvent` type for fallback notifications
- `createFallbackChain()` factory for custom chains
- `createProviderFallbackChain()` for provider-specific chains
- `createCostOptimizedChain()` - cheapest models first
- `createQualityOptimizedChain()` - best models first
- `withFallback()` wrapper for any async operation
- Error classification: `isRateLimitError()`, `isTimeoutError()`, `isServerError()`
- `DEFAULT_FALLBACK_CHAINS` for OpenAI, Anthropic, Google
- 25 new unit tests for fallback scenarios

#### Prompt Templates (Phase 8.4)
- New `src/templates/` module for prompt template management
- `PromptTemplate` interface with id, name, description, category, template, variables
- `TemplateVariable` interface with name, description, required, default, example
- `TemplateRegistry` interface for custom template management
- 7 built-in templates:
  - `summarize` - Document summarization with customizable format and focus
  - `extract` - Structured data extraction to JSON
  - `analyze` - Deep analysis with findings, patterns, implications
  - `compare` - Multi-item comparison with criteria
  - `search` - Find specific information with filters
  - `qa` - Question answering with constraints
  - `code-review` - Code review for bugs, security, quality
- `renderTemplate()` with variable substitution and conditionals (`{{#if}}...{{/if}}`)
- `render()` for rendering templates by ID
- `quickTemplate()` for one-off template strings
- `createTemplateRegistry()` factory for custom registries
- `defaultRegistry` global registry with all built-in templates
- `parseTemplateVars()` for CLI variable parsing (`key=value,key2=value2`)
- `listTemplateIds()` and `getTemplateHelp()` utilities
- CLI `--template <id>` flag to use a built-in template
- CLI `--template-vars <vars>` flag to set template variables
- CLI `--list-templates` flag to show available templates
- 29 new unit tests for template rendering

#### Custom Sandbox Tools (Phase 8.5)
- New `src/sandbox/tools.ts` module for sandbox tool management
- `SandboxTool` interface with name, description, function, parameters, category
- `ToolRegistry` interface for managing available tools
- `ToolParameter` interface for documenting tool parameters
- 14 built-in tools:
  - `parseJSON` - Safe JSON parsing with default value on error
  - `parseCSV` - CSV parsing with configurable delimiter and headers
  - `formatTable` - Format data as markdown table
  - `dedupe` - Remove duplicates from arrays (by value or key)
  - `sort` - Sort arrays (ascending/descending, by key for objects)
  - `groupBy` - Group array items by a key value
  - `flatten` - Flatten nested arrays to specified depth
  - `pick` - Pick specific keys from objects
  - `omit` - Omit specific keys from objects
  - `countBy` - Count occurrences of values
  - `summarize` - Statistical summary (sum, avg, min, max, count)
  - `extractBetween` - Extract text between start/end markers
  - `truncate` - Truncate text with custom suffix
  - `textStats` - Get text statistics (words, lines, chars, sentences)
- `createToolRegistry()` factory for custom tool registries
- `defaultToolRegistry` with all built-in tools
- `validateTool()` for validating custom tool definitions
- `wrapToolFunction()` for error handling in tool execution
- `getToolsHelp()` for generating help documentation
- `SandboxConfig` updated to accept:
  - `tools` - Array of custom tools to inject
  - `toolRegistry` - Custom tool registry to use
  - `includeBuiltinTools` - Whether to include built-in tools (default: true)
- 65 new unit tests for sandbox tools

#### Extended Thinking for Claude 4.5 (Phase 9.1)
- New `ExtendedThinkingConfig` interface with `enabled` and `budgetTokens` options
- Added `extendedThinking` option to `RLMOptions` for enabling thinking mode
- Updated `CompletionOptions` with `thinking` configuration
- Updated `CompletionResult` with optional `thinking` content field
- Updated `StreamChunk` with `type` field ('text' | 'thinking')
- Added `extended_thinking` event type to `RLMStreamEvent`
- Added `ExtendedThinkingEventData` interface for streaming events
- Added `ExtendedThinkingTrace` interface for execution traces
- Updated `AnthropicClient` to:
  - Detect Claude 4.5 models that support extended thinking
  - Pass thinking configuration to Anthropic API
  - Handle thinking blocks in responses
  - Stream thinking content in `streamCompletion()`
- Updated `RLMExecutor` to pass thinking options and log thinking traces
- Updated `RLMStreamingExecutor` to emit `extended_thinking` events
- Added `logExtendedThinking()` method to `RLMLogger`
- 22 new unit tests for extended thinking functionality

#### Multimodal Support (Phase 9.2)
- New multimodal content types for vision capabilities:
  - `TextContent` interface for text parts
  - `ImageContent` interface for image parts (base64 and URL)
  - `MessageContent` type union for string or array of content parts
  - `ImageMediaType` type for supported formats (jpeg, png, gif, webp)
- Helper functions for multimodal content:
  - `isMultimodalContent()` - Check if content is multimodal
  - `isImageContent()` - Check if part is an image
  - `isTextContent()` - Check if part is text
  - `getTextFromContent()` - Extract text from any content
  - `getImagesFromContent()` - Extract images from content
- Updated all LLM clients for multimodal support:
  - OpenAI client with vision support (GPT-4o)
  - Anthropic client with vision support (Claude)
  - Google client with vision support (Gemini)
- New image utilities module (`src/utils/images.ts`):
  - `loadImage()` - Load image from file path
  - `createImageContent()` - Create ImageContent from file
  - `createImageContentFromUrl()` - Create from URL
  - `createImageContentFromBase64()` - Create from base64 data
  - `detectMediaType()` - Detect MIME type from file extension
  - `isSupportedMediaType()` - Validate media type
  - `estimateImageTokens()` - Estimate token cost for images
  - `validateImageContent()` - Validate image content structure
  - `summarizeImageContent()` - Get human-readable summary
- 46 new unit tests for multimodal functionality

#### Semantic Chunking with Embeddings (Phase 9.3)
- New `src/embeddings/` module for embedding-based text processing
- Embedding client implementations:
  - `OpenAIEmbeddingClient` - text-embedding-3-small/large, ada-002
  - `GoogleEmbeddingClient` - text-embedding-004/005
  - `createEmbeddingClient()` factory for auto-detecting provider
  - `detectEmbeddingProvider()` for model-based provider detection
- Chunking strategies (`src/embeddings/semantic-chunking.ts`):
  - `chunkFixed()` - Fixed-size windowed chunking with overlap
  - `chunkBySentences()` - Sentence-aware chunking respecting size limits
  - `chunkByParagraphs()` - Paragraph-aware chunking with sentence fallback
  - `chunkSemantic()` - Embedding-based semantic boundary detection
  - `chunkText()` - Main entry point with strategy selection
- Text splitting utilities:
  - `splitIntoSentences()` - Split on sentence-ending punctuation
  - `splitIntoParagraphs()` - Split on paragraph boundaries
  - `estimateTokenCount()` - Approximate token estimation
- Vector similarity operations (`src/embeddings/similarity.ts`):
  - `cosineSimilarity()` - Calculate cosine similarity
  - `euclideanDistance()` - Calculate Euclidean distance
  - `dotProduct()` - Calculate dot product
  - `normalizeVector()` - Normalize to unit length
  - `averageVectors()` - Average multiple vectors
- Vector store implementation:
  - `MemoryVectorStore` - In-memory brute-force similarity search
  - `createMemoryVectorStore()` factory function
  - `findSimilarChunks()` - Find similar chunks from array
  - `rerankBySimilarity()` - Reorder chunks by query similarity
- `embedChunks()` - Add embeddings to existing chunks
- Full TypeScript type definitions:
  - `EmbeddingClient`, `EmbeddingModel`, `EmbeddingProvider`
  - `TextChunk`, `ChunkStrategy`, `SemanticChunkOptions`
  - `SimilarityResult`, `VectorStore`, `VectorStoreOptions`
- 52 new unit tests for embeddings module

#### Session Persistence (Phase 9.4)
- New `src/session.ts` module for session management and persistence
- Core types:
  - `RLMSession` - Complete session state including query, context, config, checkpoint, sandbox, trace, and cost
  - `SessionStatus` - Session lifecycle states (created, running, paused, completed, failed, interrupted)
  - `ExecutionCheckpoint` - Resumable execution state (iteration, depth, messages)
  - `SandboxSnapshot` - Sandbox variables and output
  - `SessionCost` - Token usage and cost accumulator with per-call breakdown
  - `SessionMetadata` - Name, description, and tags for organization
- Session factory and persistence:
  - `createSession()` - Create new session with query, context, and config
  - `saveSession()` - Save session to JSON file with pretty-print and context externalization
  - `loadSession()` - Load session with validation and external context support
  - `validateSession()` - Validate session structure
- Session state management functions:
  - `updateSessionStatus()` - Update status with automatic timestamp handling
  - `updateSessionCheckpoint()` - Update execution checkpoint
  - `updateSessionSandbox()` - Update sandbox variables and output
  - `addSessionTrace()` - Append trace entries
  - `updateSessionCost()` - Accumulate cost with call breakdown
  - `completeSession()` - Mark session complete with result
  - `failSession()` - Mark session failed with error details
- `SessionManager` class for multi-session handling:
  - `create()`, `save()`, `load()` - Basic CRUD operations
  - `exists()`, `delete()` - File management
  - `list()` - List all sessions with sorting
  - `find()` - Filter sessions by status, model, tags
  - `getResumable()` - Get sessions that can be resumed
  - `cleanup()` - Delete old completed sessions by age
- Utility functions:
  - `canResumeSession()` - Check if session is resumable
  - `getSessionProgress()` - Get progress percentage and stats
  - `exportSession()` / `importSession()` - Portable JSON format
  - `createSessionId()` - Deterministic ID from query and date
- Large context externalization (saves to separate .context.txt file)
- 65 new unit tests for session persistence

#### OpenAI Responses API Integration (Phase 9.5)
- New `src/clients/openai-responses.ts` module for OpenAI's Responses API
- Supports built-in tools: web search, file search, code interpreter
- `OpenAIResponsesClient` class with:
  - `create()` - Create response with tools enabled
  - `createStream()` - Streaming responses with real-time events
  - `webSearch()` - Convenience method for web search queries
  - `fileSearch()` - Search files in vector stores
  - `continue()` - Continue conversations using previous_response_id
- Comprehensive type definitions:
  - `ResponsesModel` - Supported models (GPT-5, GPT-4.1, GPT-4o series)
  - `WebSearchTool`, `FileSearchTool`, `CodeInterpreterTool`, `FunctionTool`
  - `UrlCitation`, `FileCitation` - Citation annotation types
  - `ResponsesResult` - Complete response with output, citations, usage
  - `ResponsesStreamEvent` - Streaming event types
- Citation handling utilities:
  - `extractCitationUrls()` - Extract unique URLs from citations
  - `extractCitationFileIds()` - Extract unique file IDs
  - `formatCitationsAsFootnotes()` - Format as markdown footnotes
- Tool helper functions:
  - `webSearchTool()` - Create web search configuration
  - `fileSearchTool()` - Create file search configuration
  - `supportsResponsesAPI()` - Check if model supports Responses API
- 33 new unit tests for Responses API

#### Practical Examples (Phase 10)
- 7 comprehensive examples demonstrating real-world RLM applications:
  - `code-analysis.ts` - Security vulnerability detection, code smells, refactoring suggestions
    - Multi-language support (TypeScript, Python, Go)
    - Recursive codebase scanning with configurable ignore patterns
    - Generates markdown reports with categorized findings
  - `pdf-processing.ts` - PDF document processing and analysis
    - Q&A mode for answering questions about PDF content
    - Data extraction mode for tables and structured data
    - Summarization mode for executive summaries
    - Sample document included for demo without pdf-parse
  - `data-extraction.ts` - Structured data extraction from unstructured text
    - JSON schema-based extraction with configurable schemas
    - CSV output generation for tabular data
    - Entity extraction (people, organizations, dates, currencies, etc.)
    - Sample documents: invoices, job postings, meeting notes
  - `comparative-analysis.ts` - Multi-document comparison and analysis
    - Similarity and difference identification
    - Conflict detection across sources
    - Comparison matrix generation
    - Sample datasets: cloud providers, products
  - `research-assistant.ts` - Research synthesis with citations
    - Multi-source information synthesis
    - Citation tracking and bibliography generation
    - Follow-up question support
    - Confidence-rated findings
  - `log-analysis.ts` - Log file analysis and incident investigation
    - Support for Apache, nginx, and application log formats
    - Error pattern detection with severity classification
    - Anomaly detection (spikes, drops, unusual patterns)
    - Timeline reconstruction and root cause analysis
  - `contract-review.ts` - Contract analysis and risk assessment
    - Key clause identification with risk levels
    - Obligation and deadline extraction
    - Risky term flagging with mitigation suggestions
    - Sample contracts: SaaS, NDA, Employment
- All examples include:
  - Command-line argument parsing
  - Sample data for immediate testing
  - Structured JSON output parsing
  - Markdown report generation
  - Execution statistics (tokens, cost, time)

#### Comprehensive Test Suite (Phase 11)
- 7 new test files with 175 new tests (670 total):
  - `google-client.test.ts` (32 tests) - Google Gemini client testing
    - Basic completion and streaming
    - System message handling and multi-turn conversation
    - Token usage tracking
    - Error handling and rate limits
    - Mock API responses
  - `pricing.test.ts` (36 tests) - Model pricing validation
    - All 40+ models have pricing defined
    - Cost calculation accuracy
    - Edge cases (zero tokens, large counts)
    - Unknown model handling
  - `stress.test.ts` (22 tests) - Large context stress testing
    - 10K, 50K, 100K token context handling
    - Context chunking efficiency benchmarks
    - Memory usage monitoring
    - Concurrent operations
    - Edge cases (empty, whitespace, special characters)
  - `streaming.test.ts` (17 tests) - Streaming functionality
    - RLM streaming events (start, code, code_output, final, done)
    - Stream cancellation
    - Error recovery
    - Event ordering verification
    - Multiple concurrent streams
  - `rate-limit.test.ts` (26 tests) - Rate limiting
    - Token bucket exhaustion
    - Request rate limiting
    - Concurrent request handling
    - Provider-specific limits (OpenAI, Anthropic)
    - Token usage recording
    - withRateLimit wrapper
  - `batch-concurrent.test.ts` (20 tests) - Batch processing
    - Basic batch processing
    - Concurrent execution
    - Mixed success/failure handling
    - Progress callback accuracy
    - Retry logic with rate limiting
  - `e2e.test.ts` (22 tests) - End-to-end integration
    - Full RLM workflow with mocks
    - Multi-iteration execution
    - Recursive sub-queries
    - FINAL and FINAL_VAR handling
    - Error recovery scenarios
    - Timeout handling
    - Cost tracking accuracy
    - Streaming integration

#### Claude Code Plugin / MCP Server (Phase 12)
- New `mcp-server/` package - Model Context Protocol server for Claude Code integration
- MCP Server core (`src/server.ts`):
  - Full JSON-RPC 2.0 protocol implementation
  - Tool and resource management
  - Notification support
  - Health check (ping/pong)
- Codebase Indexer (`src/indexer/`):
  - File discovery with gitignore support
  - Symbol extraction for 14 programming languages
  - Chunk-based indexing with configurable size/overlap
  - Embedding integration interface
  - Incremental re-indexing on file changes
  - JSON-based index persistence
- Semantic Code Search (`src/search/`):
  - Natural language queries over codebase
  - Keyword and semantic (embedding-based) matching
  - Symbol search with camelCase matching
  - Configurable filters (language, path, chunk type)
  - Result ranking by relevance
- MCP Tools implemented:
  - `index_codebase` - Index the codebase for search
  - `get_index_status` - Get current index status
  - `search_code` - Natural language code search
  - `explain_code` - Explain files, functions, or code ranges
  - `find_usages` - Find all usages of a symbol
  - `analyze_dependencies` - Analyze imports/exports, detect circular deps
- Additional tool definitions:
  - `summarize_module` - Summarize entire modules
  - `find_security_issues` - Detect security vulnerabilities
  - `suggest_refactoring` - Suggest code improvements
  - `get_context` - Get relevant context for a file
  - `answer_question` - Answer questions about codebase
  - `generate_tests` - Generate unit tests
- Real-time Features (`src/watcher/`):
  - File system watcher with debouncing
  - Automatic index updates on file changes
  - Integration with indexer for incremental updates
- Language Support:
  - TypeScript, JavaScript, Python, Go, Rust
  - Java, Kotlin, C, C++, C#, Ruby, PHP, Swift
  - Language-specific symbol extraction patterns
  - Comment detection and documentation extraction
- Claude Code Integration:
  - `claude-code.json` manifest with commands and keybindings
  - Command palette integration (Index, Search, Explain, Find Usages, Analyze)
  - Keyboard shortcuts (Cmd/Ctrl+Shift+F for search, etc.)
- Test Suite:
  - `server.test.ts` - MCP server protocol tests
  - `indexer.test.ts` - Codebase indexing tests
  - `search.test.ts` - Search engine tests
  - `language.test.ts` - Language detection and symbol extraction tests

### Planned
- Performance benchmarks
- Additional examples for new models
- CLI `--image` flag for multimodal queries
- CLI `--chunk-strategy` flag for chunking options
- CLI `--session` flag for session resume
- Integration of embeddings with RLM context processing
- Session integration with RLMExecutor for automatic checkpointing
