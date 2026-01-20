# Recursive Language Models (RLM) - Node.js Implementation Plan

Based on [arXiv:2512.24601](https://arxiv.org/abs/2512.24601) by Zhang, Kraska, and Khattab.

## Overview

Build a Node.js/TypeScript implementation of Recursive Language Models that enables LLMs to process arbitrarily long contexts by treating them as an external environment. The system allows models to programmatically examine, decompose, and recursively call themselves over context snippets.

## Core Concept

Instead of feeding entire long prompts into the model context window, RLM:
1. Stores the context as a variable in a sandboxed JavaScript execution environment
2. Gives the LLM access to query/manipulate this context via code
3. Allows the LLM to spawn recursive sub-calls to itself over smaller context chunks
4. Aggregates results to produce a final answer

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    RLM API (Vercel)                     │
├─────────────────────────────────────────────────────────┤
│  /api/completion     - Main RLM endpoint                │
│  /api/health         - Health check                     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     RLM Core Engine                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Router    │──│  Executor   │──│  LLM Client     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│         │                │                   │          │
│         ▼                ▼                   ▼          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Logger    │  │  Sandbox    │  │  Model Adapters │  │
│  │  (Traces)   │  │  (VM/Isolate)│  │  (OpenAI, etc) │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
rlm/
├── src/
│   ├── index.ts                 # Main exports
│   ├── rlm.ts                   # Core RLM class
│   ├── executor.ts              # Orchestrates LLM + sandbox loop
│   ├── sandbox/
│   │   ├── index.ts             # Sandbox factory
│   │   ├── vm-sandbox.ts        # Node.js vm2/isolated-vm sandbox
│   │   └── types.ts             # Sandbox interfaces
│   ├── clients/
│   │   ├── index.ts             # Client factory
│   │   ├── base.ts              # Base LLM client interface
│   │   ├── openai.ts            # OpenAI/GPT client
│   │   ├── anthropic.ts         # Anthropic/Claude client
│   │   └── types.ts             # Client types
│   ├── prompts/
│   │   ├── system.ts            # System prompts for RLM behavior
│   │   └── templates.ts         # Prompt templates
│   ├── logger/
│   │   ├── index.ts             # Logger implementation
│   │   └── types.ts             # Trace types
│   ├── utils/
│   │   ├── parser.ts            # Parse LLM outputs (code blocks, FINAL)
│   │   ├── context.ts           # Context chunking utilities
│   │   └── errors.ts            # Custom error types
│   └── types.ts                 # Shared types
├── api/                         # Vercel API routes
│   ├── completion.ts            # POST /api/completion
│   └── health.ts                # GET /api/health
├── examples/
│   ├── needle-haystack.ts       # Needle-in-haystack demo
│   ├── document-qa.ts           # Long document Q&A
│   └── multi-doc-search.ts      # Multi-document search
├── tests/
│   ├── rlm.test.ts
│   ├── sandbox.test.ts
│   └── executor.test.ts
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

---

## Implementation Phases

### Phase 1: Core Infrastructure

#### 1.1 Project Setup
- [ ] Initialize Node.js project with TypeScript
- [ ] Configure ESLint, Prettier
- [ ] Set up Vitest for testing
- [ ] Configure Vercel deployment

#### 1.2 LLM Client Abstraction
- [ ] Define `LLMClient` interface with `completion()` method
- [ ] Implement OpenAI client (GPT-4o, GPT-4o-mini)
- [ ] Implement Anthropic client (Claude)
- [ ] Add streaming support for real-time output
- [ ] Handle rate limiting and retries

#### 1.3 JavaScript Sandbox Environment
- [ ] Evaluate sandbox options: `isolated-vm` vs `vm2` vs `quickjs-emscripten`
- [ ] Implement secure code execution with timeout limits
- [ ] Inject context variable into sandbox namespace
- [ ] Inject `llm_query()` function for recursive calls
- [ ] Inject helper utilities (`print()`, `grep()`, `chunk()`)
- [ ] Handle async execution within sandbox

---

### Phase 2: RLM Core Engine

#### 2.1 Executor Loop
- [ ] Implement the REPL-style execution loop:
  ```
  1. Send prompt to LLM (with system instructions)
  2. Parse response for code blocks
  3. Execute code in sandbox
  4. Capture output/side effects
  5. Feed results back to LLM
  6. Repeat until FINAL() or max iterations
  ```
- [ ] Handle `FINAL(answer)` termination signal
- [ ] Handle `FINAL_VAR(varName)` for variable-based answers
- [ ] Implement max iteration safeguard
- [ ] Add depth tracking for recursive calls

#### 2.2 Recursive Sub-LM Calls
- [ ] Implement `llm_query(subPrompt, subContext?)` function
- [ ] Pass subset of context to sub-calls
- [ ] Track recursion depth (default max: 1)
- [ ] Aggregate sub-call results back to parent

#### 2.3 System Prompts
- [ ] Design system prompt explaining REPL environment
- [ ] Document available functions (`context`, `llm_query`, `print`, etc.)
- [ ] Provide examples of decomposition strategies
- [ ] Define output format rules (FINAL, FINAL_VAR)

---

### Phase 3: API & Deployment

#### 3.1 Vercel API Routes
- [ ] Implement `/api/completion` endpoint
  - Accept: `{ query: string, context: string, options?: RLMOptions }`
  - Return: `{ response: string, trace?: TraceLog }`
- [ ] Implement `/api/health` endpoint
- [ ] Add request validation with Zod
- [ ] Handle Vercel function timeout limits (consider streaming)

#### 3.2 Streaming Support
- [ ] Implement Server-Sent Events for real-time updates
- [ ] Stream intermediate steps (code execution, sub-calls)
- [ ] Stream final response tokens

#### 3.3 Configuration & Environment
- [ ] Environment variables for API keys
- [ ] Configurable model selection
- [ ] Configurable sandbox timeout/memory limits
- [ ] Cost tracking (optional)

---

### Phase 4: Logging & Observability

#### 4.1 Trace Logging
- [ ] Log each execution step with timestamps
- [ ] Capture: prompts, responses, code executed, outputs
- [ ] Track token usage per call
- [ ] Support JSONL output format (compatible with original visualizer)

#### 4.2 Error Handling
- [ ] Graceful sandbox execution errors
- [ ] LLM API error recovery
- [ ] Timeout handling with partial results
- [ ] User-friendly error messages

---

### Phase 5: Testing & Examples

#### 5.1 Unit Tests
- [ ] Sandbox isolation and security tests
- [ ] LLM client mocking
- [ ] Executor loop logic tests
- [ ] Parser tests for code extraction

#### 5.2 Integration Tests
- [ ] End-to-end RLM completion tests
- [ ] Multi-turn conversation tests
- [ ] Recursive depth tests

#### 5.3 Example Applications
- [ ] Needle-in-haystack benchmark
- [ ] Long document Q&A
- [ ] Multi-document reasoning

---

## Key Technical Decisions

### Sandbox Choice: `isolated-vm`
**Rationale**: Provides V8 isolate-level security, better than `vm2` which has known escapes. Works well in Node.js serverless environments.

**Alternative for Vercel Edge**: `quickjs-emscripten` for edge runtime compatibility.

### Async Sub-Calls
The original paper notes synchronous sub-calls are a bottleneck. We can improve by:
- Using `Promise.all()` for parallel sub-queries when model requests it
- Exposing `llm_query_parallel([...queries])` helper

### Vercel Timeout Handling
Vercel Pro has 60s function timeout. For longer tasks:
- Stream partial results
- Consider Vercel Functions with extended timeout (up to 5 min on Enterprise)
- Or use edge streaming for real-time output

---

## API Interface

### RLM Class

```typescript
interface RLMOptions {
  model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-3-5-sonnet';
  maxIterations?: number;      // Default: 20
  maxDepth?: number;           // Default: 1
  sandboxTimeout?: number;     // Default: 10000ms
  verbose?: boolean;
  logger?: RLMLogger;
}

interface RLMResult {
  response: string;
  trace: TraceEntry[];
  usage: { totalTokens: number; cost: number };
}

class RLM {
  constructor(options: RLMOptions);
  completion(query: string, context?: string): Promise<RLMResult>;
}
```

### Usage Example

```typescript
import { RLM } from './src';

const rlm = new RLM({
  model: 'gpt-4o-mini',
  verbose: true
});

const result = await rlm.completion(
  "Find the name mentioned exactly once in this text",
  veryLongDocument  // Can be 100x longer than context window
);

console.log(result.response);
```

---

## Injected Sandbox Environment

The LLM receives access to:

```typescript
// The full context as a string variable
const context: string;

// Query a sub-LLM with optional context subset
async function llm_query(prompt: string, subContext?: string): Promise<string>;

// Parallel sub-queries
async function llm_query_parallel(queries: Array<{prompt: string, context?: string}>): Promise<string[]>;

// Print to output (visible to parent LLM)
function print(...args: any[]): void;

// Utility: chunk context into segments
function chunk(text: string, size: number): string[];

// Utility: grep for patterns
function grep(text: string, pattern: string | RegExp): string[];

// Utility: get context length
function len(text: string): number;
```

---

## Termination Signals

The LLM signals completion by outputting:

```javascript
// Direct answer
FINAL("The answer is 42")

// Answer stored in variable
const result = await aggregateResults();
FINAL_VAR("result")
```

---

## Dependencies

```json
{
  "dependencies": {
    "openai": "^4.x",
    "@anthropic-ai/sdk": "^0.x",
    "isolated-vm": "^4.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^1.x",
    "@types/node": "^20.x",
    "vercel": "^latest"
  }
}
```

---

## Success Criteria

1. **Functional**: Process contexts 10-100x larger than model context window
2. **Quality**: Match or exceed baseline LLM quality on long-context tasks
3. **Cost**: Comparable or cheaper than processing full context directly
4. **Deployable**: Run successfully on Vercel serverless
5. **Observable**: Full trace logging for debugging

---

## References

- Paper: [Recursive Language Models](https://arxiv.org/abs/2512.24601)
- Official Python Implementation: [github.com/alexzhang13/rlm](https://github.com/alexzhang13/rlm)
- Minimal Implementation: [github.com/alexzhang13/rlm-minimal](https://github.com/alexzhang13/rlm-minimal)
- Author's Blog: [alexzhang13.github.io/blog/2025/rlm](https://alexzhang13.github.io/blog/2025/rlm/)

---

## Phase 7: Multi-Provider Model Updates (January 2026)

### 7.1 Add Google Gemini Support
- [x] Add Google Gemini models (Gemini 3 Pro, 3 Flash, 2.5 Pro, 2.5 Flash, 2.0 Flash)
- [x] Create `src/clients/google.ts` using `@google/genai` SDK
- [x] Add `google` provider to `ModelProvider` type
- [x] Implement streaming support for Gemini
- [x] Add pricing for all Gemini models

### 7.2 Update OpenAI Models
- [x] Add GPT-4.1 series (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
- [x] Add o3 reasoning models (o3, o3-mini, o3-pro)
- [x] Add o1 models (o1, o1-mini, o1-pro)
- [x] Update pricing for all OpenAI models

### 7.3 Update Anthropic Models
- [x] Add Claude 4.5 series (claude-sonnet-4-5, claude-haiku-4-5, claude-opus-4-5)
- [x] Add Claude 4 legacy models (claude-sonnet-4, claude-opus-4, claude-opus-4-1)
- [x] Update pricing for all Claude models
- [x] Deprecate old Claude 3.x models

### 7.4 Documentation Updates
- [x] Update README.md with all supported models
- [x] Add model comparison table
- [x] Update installation instructions for new dependencies

---

## Phase 8: Core Feature Enhancements (Low-Medium Complexity)

### 8.1 Token Counter & Cost Estimation
- [x] Create `src/utils/tokens.ts` with token counting utilities
- [x] Implement `estimateTokens()` for pre-execution cost prediction
- [x] Add `countTokens()` method to each LLM client
- [x] Create `estimateCost(query, context, model)` function
- [x] Add `--estimate` flag to CLI for dry cost estimation
- [x] Unit tests for token counting accuracy (25 tests)

### 8.2 Dry Run Mode
- [x] Add `dryRun` option to RLMOptions
- [x] Implement dry run execution that shows planned operations
- [x] Display: estimated tokens, cost, iterations needed
- [x] Add `--dry-run` flag to CLI
- [x] Show available sandbox functions and system prompt preview

### 8.3 Model Fallback Chain
- [x] Create `src/fallback.ts` with fallback chain logic
- [x] Define `FallbackChainOptions` interface
- [x] Implement automatic retry with next model on failure
- [x] Support configurable fallback order per provider
- [x] Add fallback events to streaming output
- [x] Default chains: `DEFAULT_FALLBACK_CHAINS`, `COST_OPTIMIZED_CHAIN`, `QUALITY_OPTIMIZED_CHAIN`
- [x] Unit tests for fallback scenarios (25 tests)

### 8.4 Prompt Templates
- [x] Create `src/templates/` directory
- [x] Define `PromptTemplate` interface
- [x] Implement built-in templates:
  - [x] `summarize` - Document summarization
  - [x] `extract` - Data extraction to JSON
  - [x] `analyze` - Deep analysis with findings
  - [x] `compare` - Multi-document comparison
  - [x] `search` - Find specific information
  - [x] `qa` - Question answering
  - [x] `code-review` - Code review
- [x] Support custom template registration
- [x] Template variable substitution (including conditionals)
- [x] CLI template selection: `--template summarize`
- [x] CLI template variables: `--template-vars "key=value"`
- [x] CLI list templates: `--list-templates`
- [x] Unit tests for templates (29 tests)

### 8.5 Custom Sandbox Tools
- [x] Create `src/sandbox/tools.ts` for tool definitions
- [x] Define `SandboxTool` interface with parameters, category, examples
- [x] Allow users to register custom functions via `tools` config option
- [x] Built-in tools implemented (14 total):
  - [x] `parseJSON(text)` - Safe JSON parsing with default value
  - [x] `parseCSV(text)` - CSV to array with options (delimiter, headers)
  - [x] `formatTable(data)` - Pretty markdown table output
  - [x] `dedupe(array)` - Remove duplicates (primitives or by key)
  - [x] `sort(array, key)` - Sort by key with ascending/descending
  - [x] `groupBy(array, key)` - Group items by key value
  - [x] `flatten(array, depth)` - Flatten nested arrays
  - [x] `pick(data, keys)` - Pick specific keys from objects
  - [x] `omit(data, keys)` - Omit specific keys from objects
  - [x] `countBy(array, key)` - Count occurrences
  - [x] `summarize(array, key)` - Statistical summary (sum, avg, min, max)
  - [x] `extractBetween(text, start, end)` - Extract text between markers
  - [x] `truncate(text, maxLength)` - Truncate with suffix
  - [x] `textStats(text)` - Word/line/char/sentence count
- [x] Tool validation with `validateTool()` function
- [x] Tool registry with `createToolRegistry()` and `defaultToolRegistry`
- [x] `wrapToolFunction()` for error handling
- [x] `getToolsHelp()` for documentation
- [x] Unit tests for all tools (65 tests)

---

## Phase 9: Advanced Features (Medium-High Complexity)

### 9.1 Extended Thinking (Claude 4.5)
- [x] Research Claude extended thinking API
- [x] Add `extendedThinking` option to RLMOptions
- [x] Implement thinking budget configuration
- [x] Stream thinking process in events
- [x] Add thinking traces to execution log
- [x] Support thinking for complex multi-step reasoning
- [x] Tests with extended thinking enabled (22 tests)

### 9.2 Multimodal Support
- [x] Update `Message` type to support image content
- [x] Add image handling to OpenAI client (GPT-4o vision)
- [x] Add image handling to Google client (Gemini vision)
- [x] Add image handling to Anthropic client (Claude vision)
- [x] Create `ImageContent` type with base64/URL support
- [x] Add image utilities:
  - [x] `loadImage(path)` - Load from file
  - [x] `createImageContent()` - Create ImageContent from file
  - [x] `createImageContentFromUrl()` - Create from URL
  - [x] `createImageContentFromBase64()` - Create from base64
  - [x] `validateImageContent()` - Validate image content
  - [x] `estimateImageTokens()` - Estimate token cost
- [x] Helper functions for multimodal content
- [x] 46 unit tests for multimodal support
- [ ] CLI support: `--image path/to/image.png`
- [ ] Example: Analyze screenshots, diagrams, charts

### 9.3 Semantic Chunking with Embeddings
- [x] Create `src/embeddings/` module with full structure
- [x] Add embedding client support:
  - [x] `OpenAIEmbeddingClient` - text-embedding-3-small/large, ada-002
  - [x] `GoogleEmbeddingClient` - text-embedding-004/005
  - [x] `createEmbeddingClient()` factory function
  - [x] `detectEmbeddingProvider()` for auto-detection
- [x] Implement chunking strategies:
  - [x] `chunkFixed()` - Fixed-size windowed chunking
  - [x] `chunkBySentences()` - Sentence-based chunking
  - [x] `chunkByParagraphs()` - Paragraph-based chunking
  - [x] `chunkSemantic()` - Embedding-based semantic chunking
  - [x] `chunkText()` - Main entry with strategy selection
- [x] Text splitting utilities:
  - [x] `splitIntoSentences()` - Sentence detection
  - [x] `splitIntoParagraphs()` - Paragraph detection
  - [x] `estimateTokenCount()` - Token estimation
- [x] Vector similarity utilities:
  - [x] `cosineSimilarity()` - Cosine similarity
  - [x] `euclideanDistance()` - Euclidean distance
  - [x] `dotProduct()` - Dot product
  - [x] `normalizeVector()` - Vector normalization
  - [x] `averageVectors()` - Vector averaging
- [x] Vector store implementation:
  - [x] `MemoryVectorStore` - In-memory brute-force search
  - [x] `findSimilarChunks()` - Find similar chunks
  - [x] `rerankBySimilarity()` - Rerank by similarity
- [x] `embedChunks()` - Add embeddings to chunks
- [x] Full type definitions in `types.ts`
- [x] 52 unit tests for embeddings module
- [ ] Add `chunkStrategy` option to RLM
- [ ] Benchmark semantic vs fixed chunking

### 9.4 Session Persistence
- [x] Create `src/session.ts` for session management
- [x] Define `RLMSession` interface with:
  - [x] Session ID and version
  - [x] Session status (created, running, paused, completed, failed, interrupted)
  - [x] Execution checkpoint (iteration, depth, messages)
  - [x] Sandbox snapshot (variables, output)
  - [x] Conversation history via checkpoint
  - [x] Cost accumulator (tokens, calls, cost breakdown)
  - [x] Result and error tracking
  - [x] Timestamps (created, updated, started, completed)
  - [x] Session metadata (name, description, tags)
- [x] Implement `createSession()` factory function
- [x] Implement `saveSession(session, path)` with:
  - [x] Pretty print option
  - [x] Auto directory creation
  - [x] Large context externalization
- [x] Implement `loadSession(path)` with:
  - [x] Session validation
  - [x] External context loading
- [x] Session update functions:
  - [x] `updateSessionStatus()` - Change session status
  - [x] `updateSessionCheckpoint()` - Update execution state
  - [x] `updateSessionSandbox()` - Update sandbox variables
  - [x] `addSessionTrace()` - Add trace entries
  - [x] `updateSessionCost()` - Accumulate costs
  - [x] `completeSession()` - Mark as completed
  - [x] `failSession()` - Mark as failed with error
- [x] `SessionManager` class for multi-session handling:
  - [x] `create()`, `save()`, `load()` - Basic operations
  - [x] `exists()`, `delete()` - File management
  - [x] `list()` - List all sessions
  - [x] `find()` - Search by criteria
  - [x] `getResumable()` - Get resumable sessions
  - [x] `cleanup()` - Remove old sessions
- [x] Utility functions:
  - [x] `canResumeSession()` - Check if resumable
  - [x] `getSessionProgress()` - Get progress summary
  - [x] `exportSession()` - Export to JSON
  - [x] `importSession()` - Import from JSON
  - [x] `createSessionId()` - Deterministic ID generation
- [x] `validateSession()` for session structure validation
- [x] 65 unit tests for session persistence
- [ ] CLI: `--session <id>` to resume
- [ ] Integrate session with RLMExecutor

### 9.5 OpenAI Responses API Integration
- [x] Research OpenAI Responses API (web search, file search, citations)
- [x] Create `src/clients/openai-responses.ts` module
- [x] Core types and interfaces:
  - [x] `ResponsesModel` - Supported models (GPT-5, GPT-4.1, GPT-4o series)
  - [x] `WebSearchTool`, `FileSearchTool`, `CodeInterpreterTool`, `FunctionTool`
  - [x] `UrlCitation`, `FileCitation`, `Citation` - Citation types
  - [x] `ResponsesResult` - Complete response with output and citations
  - [x] `ResponsesOptions` - Creation options
  - [x] `ResponsesStreamEvent` - Streaming event types
- [x] `OpenAIResponsesClient` class:
  - [x] `create()` - Create response with tools
  - [x] `createStream()` - Streaming response with events
  - [x] `webSearch()` - Convenience method for web search
  - [x] `fileSearch()` - Convenience method for file search
  - [x] `continue()` - Continue conversation with previous_response_id
- [x] Citation handling:
  - [x] Parse URL citations with start/end index, url, title
  - [x] Parse file citations with index, file_id, filename, quote
  - [x] `extractCitationUrls()` - Extract unique URLs
  - [x] `extractCitationFileIds()` - Extract unique file IDs
  - [x] `formatCitationsAsFootnotes()` - Format as markdown footnotes
- [x] Tool helper functions:
  - [x] `webSearchTool()` - Create web search config
  - [x] `fileSearchTool()` - Create file search config
  - [x] `supportsResponsesAPI()` - Check model support
- [x] 33 unit tests for Responses API
- [ ] Example: Research assistant with live web data
- [ ] CLI `--web-search` flag for web search queries

---

## Phase 10: Practical Examples

### 10.1 Code Analysis Example
- [x] Create `examples/code-analysis.ts`
- [x] Features:
  - [x] Load entire codebase into context
  - [x] Find security vulnerabilities
  - [x] Identify code smells and patterns
  - [x] Generate documentation
  - [x] Suggest refactoring opportunities
- [x] Support multiple languages (TS, Python, Go)
- [x] Output: Markdown report with findings

### 10.2 PDF Processing Example
- [x] Create `examples/pdf-processing.ts`
- [x] Add `pdf-parse` dependency (optional, sample mode available)
- [x] Features:
  - [x] Extract text from PDF
  - [x] Answer questions about PDF content
  - [x] Extract tables and structured data
  - [x] Summarize long PDFs
- [x] Handle multi-page documents

### 10.3 Data Extraction Example
- [x] Create `examples/data-extraction.ts`
- [x] Features:
  - [x] Extract structured data from unstructured text
  - [x] Output to JSON schema
  - [x] Output to CSV
  - [x] Handle tables and lists
  - [x] Entity extraction (names, dates, amounts)
- [x] Template-based extraction

### 10.4 Comparative Analysis Example
- [x] Create `examples/comparative-analysis.ts`
- [x] Features:
  - [x] Load multiple documents
  - [x] Compare and contrast content
  - [x] Identify similarities and differences
  - [x] Generate comparison matrix
  - [x] Highlight conflicting information
- [x] Output: Structured comparison report

### 10.5 Research Assistant Example
- [x] Create `examples/research-assistant.ts`
- [x] Features:
  - [x] Multi-source synthesis
  - [x] Citation tracking
  - [x] Fact verification
  - [x] Generate bibliography
  - [x] Answer with source references
- [x] Output: Research report with citations

### 10.6 Log Analysis Example
- [x] Create `examples/log-analysis.ts`
- [x] Features:
  - [x] Parse various log formats
  - [x] Find error patterns
  - [x] Detect anomalies
  - [x] Timeline reconstruction
  - [x] Root cause analysis
- [x] Support: Apache, nginx, application logs

### 10.7 Contract Review Example
- [x] Create `examples/contract-review.ts`
- [x] Features:
  - [x] Identify key clauses
  - [x] Flag risky terms
  - [x] Extract obligations and deadlines
  - [x] Compare against standard terms
  - [x] Generate clause summary
- [x] Output: Risk assessment report

---

## Phase 11: Comprehensive Test Suite ✅

### 11.1 Google Client Tests
- [x] Create `tests/google-client.test.ts`
- [x] Test cases:
  - [x] Basic completion
  - [x] Streaming completion
  - [x] System message handling
  - [x] Multi-turn conversation
  - [x] Token usage tracking
  - [x] Error handling
  - [x] Rate limit handling
- [x] Mock Google API responses
- [x] 32 tests covering all functionality

### 11.2 Model Pricing Tests
- [x] Create `tests/pricing.test.ts`
- [x] Test cases:
  - [x] Verify all 40+ models have pricing
  - [x] Cost calculation accuracy
  - [x] Edge cases (zero tokens, large counts)
  - [x] Unknown model handling
- [x] Cross-reference with official pricing
- [x] 36 tests covering all pricing scenarios

### 11.3 Fallback Chain Tests
- [x] Tests in `tests/fallback.test.ts` (from Phase 8)
- [x] Test cases:
  - [x] Primary model success (no fallback)
  - [x] Primary fails, secondary succeeds
  - [x] Multiple fallbacks
  - [x] All models fail
  - [x] Specific error types trigger fallback
  - [x] Fallback event emission
- [x] 25 tests covering all fallback scenarios

### 11.4 Large Context Stress Tests
- [x] Create `tests/stress.test.ts`
- [x] Test cases:
  - [x] 10K, 50K, 100K token context handling
  - [x] Context chunking efficiency
  - [x] Memory usage monitoring
  - [x] Execution time benchmarks
  - [x] Concurrent operations
  - [x] Edge cases (empty, whitespace, special chars)
- [x] Performance regression detection
- [x] 22 tests covering stress scenarios

### 11.5 Streaming Tests
- [x] Create `tests/streaming.test.ts`
- [x] Test cases:
  - [x] RLM streaming events (start, code, code_output, final, done)
  - [x] Stream cancellation
  - [x] Stream error recovery
  - [x] Event ordering verification
  - [x] Final result accuracy
  - [x] Multiple concurrent streams
- [x] 17 tests covering streaming functionality

### 11.6 Rate Limit Tests
- [x] Create `tests/rate-limit.test.ts`
- [x] Test cases:
  - [x] Token bucket exhaustion
  - [x] Request rate limiting
  - [x] Concurrent request handling
  - [x] Provider-specific limits (OpenAI, Anthropic)
  - [x] Rate limit recovery
  - [x] Token usage recording
  - [x] withRateLimit wrapper
- [x] 26 tests covering rate limiting

### 11.7 Concurrent Batch Tests
- [x] Create `tests/batch-concurrent.test.ts`
- [x] Test cases:
  - [x] Basic batch processing
  - [x] Concurrent execution
  - [x] Mixed success/failure handling
  - [x] Progress callback accuracy
  - [x] Retry logic
  - [x] Rate limiting integration
- [x] 20 tests covering batch processing

### 11.8 End-to-End Integration Tests
- [x] Create `tests/e2e.test.ts`
- [x] Test cases:
  - [x] Full RLM workflow with mocks
  - [x] Multi-iteration execution
  - [x] Recursive sub-queries
  - [x] FINAL and FINAL_VAR handling
  - [x] Error recovery scenarios
  - [x] Timeout handling
  - [x] Cost tracking accuracy
  - [x] Streaming integration
- [x] 22 tests covering end-to-end scenarios

**Total Phase 11 Tests: 175 new tests (670 total test suite)**

---

## Phase 12: Claude Code Plugin / MCP Server ✅

### 12.1 MCP Server Foundation
- [x] Create `mcp-server/` directory structure
- [x] Implement MCP (Model Context Protocol) server
- [x] Define server configuration schema
- [x] Add server startup and shutdown handling
- [x] Implement health check endpoint (ping/pong)
- [x] Create installation script for Claude Code

### 12.2 Codebase Indexing
- [x] Create `mcp-server/src/indexer/indexer.ts` for codebase indexing
- [x] Implement file discovery (respect .gitignore)
- [x] Support common languages:
  - [x] TypeScript/JavaScript
  - [x] Python
  - [x] Go
  - [x] Rust
  - [x] Java/Kotlin
  - [x] C/C++
- [x] Generate embeddings for code chunks (embedding client interface)
- [x] Store index in local JSON database
- [x] Incremental re-indexing on file changes
- [x] Index metadata: functions, classes, imports, exports

### 12.3 Semantic Code Search
- [x] Implement `search_code` MCP tool
- [x] Natural language queries over codebase
- [x] Find similar code patterns
- [x] Search by function/class name
- [x] Search by functionality description
- [x] Return relevant code snippets with context
- [x] Rank results by relevance

### 12.4 Code Understanding Tools
- [x] Implement `explain_code` MCP tool
  - [x] Explain file/function/class
  - [x] Generate documentation
  - [x] Identify patterns and anti-patterns
- [x] Implement `find_usages` MCP tool
  - [x] Find all usages of a symbol
  - [x] Track call chains
  - [x] Dependency analysis
- [x] Implement `summarize_module` MCP tool (definition)
  - [x] Summarize entire module/package
  - [x] Generate architecture overview
  - [x] List public API

### 12.5 Code Analysis Tools
- [x] Implement `analyze_dependencies` MCP tool
  - [x] Dependency graph generation
  - [x] Circular dependency detection
  - [x] Unused dependency detection
- [x] Implement `find_security_issues` MCP tool (definition)
  - [x] Common vulnerability patterns
  - [x] Hardcoded secrets detection
  - [x] Input validation gaps
- [x] Implement `suggest_refactoring` MCP tool (definition)
  - [x] Code duplication detection
  - [x] Complexity analysis
  - [x] Refactoring suggestions

### 12.6 Context-Aware Assistance
- [x] Implement `get_context` MCP tool (definition)
  - [x] Get relevant context for current file
  - [x] Related files and imports
  - [x] Test files and documentation
- [x] Implement `answer_question` MCP tool (definition)
  - [x] Answer questions about the codebase
  - [x] Use RLM to process large contexts
  - [x] Cite relevant source files
- [x] Implement `generate_tests` MCP tool (definition)
  - [x] Generate unit tests for functions
  - [x] Understand existing test patterns
  - [x] Mock dependencies appropriately

### 12.7 Real-time Features
- [x] File watcher for live index updates
- [x] Incremental embedding updates
- [x] Cache frequently accessed results
- [x] Background indexing queue
- [x] Progress reporting during indexing

### 12.8 Configuration & Customization
- [x] Project-specific configuration file (`RLMServerConfig`)
- [x] Ignore patterns for indexing
- [x] Custom embedding models (provider interface)
- [x] Chunk size configuration
- [x] Language-specific parsers (14 languages)
- [x] Custom tool definitions

### 12.9 Claude Code Integration
- [x] Create Claude Code extension manifest (`claude-code.json`)
- [x] Register MCP server with Claude Code
- [x] Add keyboard shortcuts
- [x] Status bar integration (in manifest)
- [x] Command palette commands:
  - [x] `RLM: Index Codebase`
  - [x] `RLM: Search Code`
  - [x] `RLM: Explain Selection`
  - [x] `RLM: Find Usages`
  - [x] `RLM: Analyze File`

### 12.10 Documentation & Distribution
- [x] README for MCP server
- [x] Installation guide for Claude Code
- [x] Configuration reference
- [x] API documentation for tools
- [x] Example workflows
- [ ] Publish to npm as `@rlm/claude-code-plugin`

**Phase 12 Implementation:**
- MCP Server with full JSON-RPC protocol support
- Codebase indexer with 14 language support
- Semantic search with keyword and embedding-based matching
- 6 implemented tools: index_codebase, get_index_status, search_code, explain_code, find_usages, analyze_dependencies
- 6 additional tool definitions: summarize_module, find_security_issues, suggest_refactoring, get_context, answer_question, generate_tests
- Real-time file watching with debouncing
- Claude Code manifest with commands and keybindings
- Test suite with 4 test files (server, indexer, search, language utils)

---

## Phase 13: Advanced Integrations & Production Readiness

### 13.1 CLI Enhancements
- [ ] `--image <path>` - Multimodal queries with vision models
- [ ] `--chunk-strategy <strategy>` - Select chunking strategy (fixed, semantic, sentence, paragraph)
- [ ] `--session <id>` - Resume interrupted sessions
- [ ] `--benchmark` - Performance testing mode with detailed metrics

### 13.2 Session Integration with RLMExecutor
- [ ] Automatic checkpointing during multi-iteration execution
- [ ] Seamless session resumption from last checkpoint
- [ ] Session state included in streaming events
- [ ] Configurable checkpoint storage (file system, custom adapters)
- [ ] Recovery from interrupted executions

### 13.3 Embeddings Integration with RLM
- [ ] Use embeddings for intelligent context selection
- [ ] Hybrid semantic + lexical context retrieval
- [ ] Automatic context reranking by query relevance
- [ ] Configurable similarity thresholds
- [ ] Cache embeddings for repeated queries

### 13.4 MCP Tool Implementations
- [ ] **find_security_issues**: Full implementation
  - [ ] Hardcoded secrets detection (API keys, passwords, tokens)
  - [ ] SQL injection pattern detection
  - [ ] XSS vulnerability patterns
  - [ ] Unsafe eval/exec detection
  - [ ] Path traversal vulnerabilities
- [ ] **suggest_refactoring**: Full implementation
  - [ ] Code duplication detection
  - [ ] High complexity function identification
  - [ ] Naming convention violations
  - [ ] Dead code detection
  - [ ] Long function/class suggestions
- [ ] **generate_tests**: Full implementation
  - [ ] Unit test generation based on existing patterns
  - [ ] Test framework detection (Jest, Vitest, pytest, etc.)
  - [ ] Mock generation for dependencies
  - [ ] Edge case identification

### 13.5 Performance & Benchmarks
- [ ] Benchmark suite for context processing
  - [ ] 10K token context benchmarks
  - [ ] 50K token context benchmarks
  - [ ] 100K token context benchmarks
- [ ] Chunking strategy comparison
  - [ ] Fixed vs semantic vs sentence vs paragraph
  - [ ] Quality vs speed tradeoffs
- [ ] Memory profiling for large documents
- [ ] Published benchmark results in documentation
- [ ] CI integration for regression detection

### 13.6 Web Dashboard (Optional)
- [ ] Web UI for execution visualization
- [ ] Session history browser
- [ ] Cost tracking dashboard
- [ ] Trace viewer with timeline
- [ ] Real-time streaming display

---

## Implementation Priority & Timeline

### High Priority (Phase 8) - Foundation
1. Token Counter & Cost Estimation
2. Dry Run Mode
3. Model Fallback Chain
4. Google Client Tests

### Medium Priority (Phase 9-10) - Features & Examples
5. Prompt Templates
6. Custom Sandbox Tools
7. Code Analysis Example
8. Data Extraction Example
9. Multimodal Support

### Lower Priority (Phase 9-11) - Advanced
10. Extended Thinking
11. Semantic Chunking
12. Session Persistence
13. Remaining Examples
14. Stress & Performance Tests

### Strategic Priority (Phase 12) - Claude Code Integration
15. MCP Server Foundation
16. Codebase Indexing with Embeddings
17. Semantic Code Search
18. Code Understanding Tools
19. Claude Code Extension

---

## Success Metrics

- **Test Coverage**: >90% code coverage
- **Performance**: Process 100K tokens in <30 seconds
- **Reliability**: <1% error rate on standard workloads
- **Cost Efficiency**: Accurate cost estimation within 5%
- **Documentation**: All features documented with examples
