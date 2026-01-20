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
