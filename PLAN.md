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
- [ ] Create `src/utils/tokens.ts` with token counting utilities
- [ ] Implement `estimateTokens()` for pre-execution cost prediction
- [ ] Add `countTokens()` method to each LLM client
- [ ] Create `estimateCost(query, context, model)` function
- [ ] Add `--estimate` flag to CLI for dry cost estimation
- [ ] Unit tests for token counting accuracy

### 8.2 Dry Run Mode
- [ ] Add `dryRun` option to RLMOptions
- [ ] Implement dry run execution that shows planned operations
- [ ] Display: estimated tokens, cost, iterations needed
- [ ] Add `--dry-run` flag to CLI
- [ ] Show code that would be executed without running it

### 8.3 Model Fallback Chain
- [ ] Create `src/fallback.ts` with fallback chain logic
- [ ] Define `FallbackChainOptions` interface
- [ ] Implement automatic retry with next model on failure
- [ ] Support configurable fallback order per provider
- [ ] Add fallback events to streaming output
- [ ] Example: `fallbackChain: ['gpt-5', 'gpt-4.1', 'gpt-4o']`
- [ ] Unit tests for fallback scenarios

### 8.4 Prompt Templates
- [ ] Create `src/templates/` directory
- [ ] Define `PromptTemplate` interface
- [ ] Implement built-in templates:
  - [ ] `summarize` - Document summarization
  - [ ] `extract` - Data extraction to JSON
  - [ ] `analyze` - Deep analysis with findings
  - [ ] `compare` - Multi-document comparison
  - [ ] `search` - Find specific information
- [ ] Support custom template registration
- [ ] Template variable substitution
- [ ] CLI template selection: `--template summarize`

### 8.5 Custom Sandbox Tools
- [ ] Create `src/sandbox/tools.ts` for tool definitions
- [ ] Define `SandboxTool` interface
- [ ] Allow users to register custom functions
- [ ] Built-in tools to add:
  - [ ] `fetch(url)` - HTTP requests (with security limits)
  - [ ] `parseJSON(text)` - Safe JSON parsing
  - [ ] `parseCSV(text)` - CSV to array
  - [ ] `formatTable(data)` - Pretty table output
  - [ ] `dedupe(array)` - Remove duplicates
  - [ ] `sort(array, key)` - Sort by key
- [ ] Tool validation and sandboxing
- [ ] Documentation for custom tools

---

## Phase 9: Advanced Features (Medium-High Complexity)

### 9.1 Extended Thinking (Claude 4.5)
- [ ] Research Claude extended thinking API
- [ ] Add `extendedThinking` option to RLMOptions
- [ ] Implement thinking budget configuration
- [ ] Stream thinking process in events
- [ ] Add thinking traces to execution log
- [ ] Support thinking for complex multi-step reasoning
- [ ] Tests with extended thinking enabled

### 9.2 Multimodal Support
- [ ] Update `Message` type to support image content
- [ ] Add image handling to OpenAI client (GPT-4o vision)
- [ ] Add image handling to Google client (Gemini vision)
- [ ] Add image handling to Anthropic client (Claude vision)
- [ ] Create `ImageContent` type with base64/URL support
- [ ] Add image utilities:
  - [ ] `loadImage(path)` - Load from file
  - [ ] `resizeImage(image, maxSize)` - Optimize for API
  - [ ] `describeImage(image)` - Get image description
- [ ] CLI support: `--image path/to/image.png`
- [ ] Example: Analyze screenshots, diagrams, charts

### 9.3 Semantic Chunking with Embeddings
- [ ] Add embedding support to clients
- [ ] Implement `semanticChunk(text, options)` function
- [ ] Create `src/embeddings/` module
- [ ] Support embedding models:
  - [ ] OpenAI `text-embedding-3-small/large`
  - [ ] Google `text-embedding-004`
  - [ ] Voyage AI (optional)
- [ ] Implement similarity-based chunk retrieval
- [ ] Add `chunkStrategy: 'fixed' | 'semantic'` option
- [ ] Benchmark semantic vs fixed chunking

### 9.4 Session Persistence
- [ ] Create `src/session.ts` for session management
- [ ] Define `RLMSession` interface with:
  - [ ] Session ID
  - [ ] Execution state
  - [ ] Sandbox variables
  - [ ] Conversation history
  - [ ] Cost accumulator
- [ ] Implement `saveSession(session, path)`
- [ ] Implement `loadSession(path)`
- [ ] Support session resume after interruption
- [ ] Session export to JSON
- [ ] CLI: `--session <id>` to resume

### 9.5 OpenAI Responses API Integration
- [ ] Research OpenAI Responses API (web search, file search)
- [ ] Add `useResponsesAPI` option
- [ ] Implement web search tool integration
- [ ] Implement file search tool integration
- [ ] Handle response citations
- [ ] Stream web search results
- [ ] Example: Research assistant with live web data

---

## Phase 10: Practical Examples

### 10.1 Code Analysis Example
- [ ] Create `examples/code-analysis.ts`
- [ ] Features:
  - [ ] Load entire codebase into context
  - [ ] Find security vulnerabilities
  - [ ] Identify code smells and patterns
  - [ ] Generate documentation
  - [ ] Suggest refactoring opportunities
- [ ] Support multiple languages (TS, Python, Go)
- [ ] Output: Markdown report with findings

### 10.2 PDF Processing Example
- [ ] Create `examples/pdf-processing.ts`
- [ ] Add `pdf-parse` dependency
- [ ] Features:
  - [ ] Extract text from PDF
  - [ ] Answer questions about PDF content
  - [ ] Extract tables and structured data
  - [ ] Summarize long PDFs
- [ ] Handle multi-page documents

### 10.3 Data Extraction Example
- [ ] Create `examples/data-extraction.ts`
- [ ] Features:
  - [ ] Extract structured data from unstructured text
  - [ ] Output to JSON schema
  - [ ] Output to CSV
  - [ ] Handle tables and lists
  - [ ] Entity extraction (names, dates, amounts)
- [ ] Template-based extraction

### 10.4 Comparative Analysis Example
- [ ] Create `examples/comparative-analysis.ts`
- [ ] Features:
  - [ ] Load multiple documents
  - [ ] Compare and contrast content
  - [ ] Identify similarities and differences
  - [ ] Generate comparison matrix
  - [ ] Highlight conflicting information
- [ ] Output: Structured comparison report

### 10.5 Research Assistant Example
- [ ] Create `examples/research-assistant.ts`
- [ ] Features:
  - [ ] Multi-source synthesis
  - [ ] Citation tracking
  - [ ] Fact verification
  - [ ] Generate bibliography
  - [ ] Answer with source references
- [ ] Output: Research report with citations

### 10.6 Log Analysis Example
- [ ] Create `examples/log-analysis.ts`
- [ ] Features:
  - [ ] Parse various log formats
  - [ ] Find error patterns
  - [ ] Detect anomalies
  - [ ] Timeline reconstruction
  - [ ] Root cause analysis
- [ ] Support: Apache, nginx, application logs

### 10.7 Contract Review Example
- [ ] Create `examples/contract-review.ts`
- [ ] Features:
  - [ ] Identify key clauses
  - [ ] Flag risky terms
  - [ ] Extract obligations and deadlines
  - [ ] Compare against standard terms
  - [ ] Generate clause summary
- [ ] Output: Risk assessment report

---

## Phase 11: Comprehensive Test Suite

### 11.1 Google Client Tests
- [ ] Create `tests/google-client.test.ts`
- [ ] Test cases:
  - [ ] Basic completion
  - [ ] Streaming completion
  - [ ] System message handling
  - [ ] Multi-turn conversation
  - [ ] Token usage tracking
  - [ ] Error handling
  - [ ] Rate limit handling
- [ ] Mock Google API responses

### 11.2 Model Pricing Tests
- [ ] Create `tests/pricing.test.ts`
- [ ] Test cases:
  - [ ] Verify all 40+ models have pricing
  - [ ] Cost calculation accuracy
  - [ ] Edge cases (zero tokens, large counts)
  - [ ] Unknown model handling
- [ ] Cross-reference with official pricing

### 11.3 Fallback Chain Tests
- [ ] Create `tests/fallback.test.ts`
- [ ] Test cases:
  - [ ] Primary model success (no fallback)
  - [ ] Primary fails, secondary succeeds
  - [ ] Multiple fallbacks
  - [ ] All models fail
  - [ ] Specific error types trigger fallback
  - [ ] Fallback event emission

### 11.4 Large Context Stress Tests
- [ ] Create `tests/stress.test.ts`
- [ ] Test cases:
  - [ ] 50K token context
  - [ ] 100K token context
  - [ ] 500K token context (chunked)
  - [ ] Memory usage monitoring
  - [ ] Execution time benchmarks
- [ ] Performance regression detection

### 11.5 Streaming Tests
- [ ] Create `tests/streaming.test.ts`
- [ ] Test cases:
  - [ ] OpenAI streaming
  - [ ] Anthropic streaming
  - [ ] Google streaming
  - [ ] Stream cancellation
  - [ ] Stream error recovery
  - [ ] Event ordering verification
  - [ ] Final result accuracy

### 11.6 Rate Limit Tests
- [ ] Create `tests/rate-limit.test.ts`
- [ ] Test cases:
  - [ ] Token bucket exhaustion
  - [ ] Request rate limiting
  - [ ] Backoff behavior
  - [ ] Concurrent request handling
  - [ ] Provider-specific limits
  - [ ] Rate limit recovery

### 11.7 Concurrent Batch Tests
- [ ] Create `tests/batch-concurrent.test.ts`
- [ ] Test cases:
  - [ ] 10 concurrent requests
  - [ ] 50 concurrent requests
  - [ ] Mixed success/failure
  - [ ] Progress callback accuracy
  - [ ] Resource cleanup
  - [ ] Memory leak detection

### 11.8 End-to-End Integration Tests
- [ ] Create `tests/e2e.test.ts`
- [ ] Test cases:
  - [ ] Full RLM workflow with mocks
  - [ ] Multi-iteration execution
  - [ ] Recursive sub-queries
  - [ ] FINAL and FINAL_VAR handling
  - [ ] Error recovery scenarios
  - [ ] Timeout handling
  - [ ] Cost tracking accuracy

---

## Phase 12: Claude Code Plugin / MCP Server

### 12.1 MCP Server Foundation
- [ ] Create `mcp-server/` directory structure
- [ ] Implement MCP (Model Context Protocol) server
- [ ] Define server configuration schema
- [ ] Add server startup and shutdown handling
- [ ] Implement health check endpoint
- [ ] Create installation script for Claude Code

### 12.2 Codebase Indexing
- [ ] Create `mcp-server/indexer.ts` for codebase indexing
- [ ] Implement file discovery (respect .gitignore)
- [ ] Support common languages:
  - [ ] TypeScript/JavaScript
  - [ ] Python
  - [ ] Go
  - [ ] Rust
  - [ ] Java/Kotlin
  - [ ] C/C++
- [ ] Generate embeddings for code chunks
- [ ] Store index in local SQLite/JSON database
- [ ] Incremental re-indexing on file changes
- [ ] Index metadata: functions, classes, imports, exports

### 12.3 Semantic Code Search
- [ ] Implement `search_code` MCP tool
- [ ] Natural language queries over codebase
- [ ] Find similar code patterns
- [ ] Search by function/class name
- [ ] Search by functionality description
- [ ] Return relevant code snippets with context
- [ ] Rank results by relevance

### 12.4 Code Understanding Tools
- [ ] Implement `explain_code` MCP tool
  - [ ] Explain file/function/class
  - [ ] Generate documentation
  - [ ] Identify patterns and anti-patterns
- [ ] Implement `find_usages` MCP tool
  - [ ] Find all usages of a symbol
  - [ ] Track call chains
  - [ ] Dependency analysis
- [ ] Implement `summarize_module` MCP tool
  - [ ] Summarize entire module/package
  - [ ] Generate architecture overview
  - [ ] List public API

### 12.5 Code Analysis Tools
- [ ] Implement `analyze_dependencies` MCP tool
  - [ ] Dependency graph generation
  - [ ] Circular dependency detection
  - [ ] Unused dependency detection
- [ ] Implement `find_security_issues` MCP tool
  - [ ] Common vulnerability patterns
  - [ ] Hardcoded secrets detection
  - [ ] Input validation gaps
- [ ] Implement `suggest_refactoring` MCP tool
  - [ ] Code duplication detection
  - [ ] Complexity analysis
  - [ ] Refactoring suggestions

### 12.6 Context-Aware Assistance
- [ ] Implement `get_context` MCP tool
  - [ ] Get relevant context for current file
  - [ ] Related files and imports
  - [ ] Test files and documentation
- [ ] Implement `answer_question` MCP tool
  - [ ] Answer questions about the codebase
  - [ ] Use RLM to process large contexts
  - [ ] Cite relevant source files
- [ ] Implement `generate_tests` MCP tool
  - [ ] Generate unit tests for functions
  - [ ] Understand existing test patterns
  - [ ] Mock dependencies appropriately

### 12.7 Real-time Features
- [ ] File watcher for live index updates
- [ ] Incremental embedding updates
- [ ] Cache frequently accessed results
- [ ] Background indexing queue
- [ ] Progress reporting during indexing

### 12.8 Configuration & Customization
- [ ] Project-specific configuration file (`.rlm-config.json`)
- [ ] Ignore patterns for indexing
- [ ] Custom embedding models
- [ ] Chunk size configuration
- [ ] Language-specific parsers
- [ ] Custom tool definitions

### 12.9 Claude Code Integration
- [ ] Create Claude Code extension manifest
- [ ] Register MCP server with Claude Code
- [ ] Add keyboard shortcuts
- [ ] Status bar integration
- [ ] Command palette commands:
  - [ ] `RLM: Index Codebase`
  - [ ] `RLM: Search Code`
  - [ ] `RLM: Explain Selection`
  - [ ] `RLM: Find Usages`
  - [ ] `RLM: Analyze File`

### 12.10 Documentation & Distribution
- [ ] README for MCP server
- [ ] Installation guide for Claude Code
- [ ] Configuration reference
- [ ] API documentation for tools
- [ ] Example workflows
- [ ] Publish to npm as `@rlm/claude-code-plugin`

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
