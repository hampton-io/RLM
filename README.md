# RLM - Recursive Language Models

A Node.js/TypeScript implementation of Recursive Language Models based on the research paper [arXiv:2512.24601](https://arxiv.org/abs/2512.24601) by Zhang, Kraska, and Khattab.

RLM enables LLMs to process **arbitrarily long contexts** by treating them as an external environment that can be programmatically explored via a JavaScript REPL. Instead of feeding entire long documents into the model's context window, RLM allows the model to write code to search, analyze, and recursively query smaller chunks.

## Features

- **Unlimited Context Length**: Process documents far larger than any model's context window
- **Multi-Provider Support**: Works with OpenAI (GPT-5, GPT-4o, o3, o1), Anthropic (Claude 4.5), and Google (Gemini 3, 2.5)
- **Streaming Support**: Real-time progress updates during execution
- **Secure Sandbox**: Code execution in isolated VM environment
- **Recursive Sub-Queries**: LLM can spawn sub-calls to itself over context chunks
- **Comprehensive Tracing**: Full execution trace with token usage and cost tracking
- **Retry & Rate Limiting**: Built-in resilience for API calls
- **Vercel Ready**: Deploy as serverless API endpoints

## Installation

```bash
# Clone the repository
git clone https://github.com/hampton-io/RLM.git
cd RLM

# Install dependencies
npm install

# Build
npm run build
```

Or install directly from GitHub:

```bash
npm install github:hampton-io/RLM
```

## Quick Start

```typescript
import { RLM } from './src/index.js';  // or 'rlm' if installed from GitHub

// Set your API key
process.env.OPENAI_API_KEY = 'your-key-here';

const rlm = new RLM({ model: 'gpt-4o-mini' });

const result = await rlm.completion(
  "Find all mentions of 'climate change' in this document",
  veryLongDocument  // Can be 100x longer than context window
);

console.log(result.response);
console.log(`Tokens used: ${result.usage.totalTokens}`);
console.log(`Cost: $${result.usage.estimatedCost.toFixed(4)}`);
```

## CLI Usage

```bash
# Simple query with inline context
npx tsx src/cli.ts "What is the main topic?" -c "This is about AI..."

# Query with file context
npx tsx src/cli.ts "Summarize this document" -f document.txt

# Pipe context from another command
cat large_file.txt | npx tsx src/cli.ts "Find all email addresses" --stdin

# Use Claude 4.5 with streaming
npx tsx src/cli.ts "Analyze this" -f data.txt -m claude-sonnet-4-5 --stream

# Use Gemini 2.5 Flash
npx tsx src/cli.ts "Summarize" -f data.txt -m gemini-2.5-flash
```

### CLI Options

```
Arguments:
  query                     The question or task to perform

Options:
  -c, --context <text>      Inline context string
  -f, --file <path>         Path to context file
  --stdin                   Read context from stdin
  -m, --model <model>       Model to use (default: gpt-4o-mini)
  -v, --verbose             Enable verbose output
  -s, --stream              Stream output events
  --max-iterations <n>      Maximum iterations (default: 20)
  --max-cost <n>            Maximum cost in USD
  -h, --help                Show help message
```

## How It Works

RLM implements a REPL-style execution loop:

1. **Initialize**: Store the context as a variable in a sandboxed JavaScript environment
2. **Query**: Send the task to the LLM with instructions on available tools
3. **Execute**: LLM writes code to explore/analyze the context
4. **Iterate**: Capture output and feed back to LLM for further processing
5. **Recurse**: LLM can spawn sub-queries over smaller context chunks
6. **Finalize**: LLM signals completion with `FINAL("answer")` or `FINAL_VAR("varName")`

### Sandbox Environment

The LLM has access to these functions in the sandbox:

```javascript
// The full context as a string
const context: string;

// Make recursive sub-query with optional context subset
async function llm_query(prompt: string, subContext?: string): Promise<string>;

// Parallel sub-queries for efficiency
async function llm_query_parallel(queries: Array<{prompt: string, context?: string}>): Promise<string[]>;

// Output functions
function print(...args: any[]): void;
console.log(...args: any[]): void;

// Utility functions
function chunk(text: string, size: number): string[];   // Split into chunks
function grep(text: string, pattern: RegExp): string[]; // Find matching lines
function len(text: string): number;                     // Get length
```

## API Reference

### RLM Class

```typescript
interface RLMOptions {
  model: SupportedModel;        // Required: 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-latest', etc.
  maxIterations?: number;       // Default: 20
  maxDepth?: number;            // Default: 1 (for recursive calls)
  sandboxTimeout?: number;      // Default: 30000ms
  temperature?: number;         // Default: 0
  verbose?: boolean;            // Default: false
}

interface RLMResult {
  response: string;             // The final answer
  trace: TraceEntry[];          // Full execution trace
  usage: {
    totalTokens: number;
    totalCalls: number;
    estimatedCost: number;
  };
  executionTime: number;        // Total time in ms
}

class RLM {
  constructor(options: RLMOptions);

  // Standard completion
  completion(query: string, context?: string): Promise<RLMResult>;

  // Streaming completion
  stream(query: string, context?: string): AsyncGenerator<RLMStreamEvent, RLMResult>;
}
```

### Streaming Events

```typescript
type RLMStreamEventType =
  | 'start'        // Execution started
  | 'thinking'     // LLM reasoning (before code)
  | 'code'         // Code to be executed
  | 'code_output'  // Output from code execution
  | 'sub_query'    // Starting a recursive sub-query
  | 'sub_response' // Response from sub-query
  | 'final'        // Final answer produced
  | 'error'        // Error occurred
  | 'done';        // Execution complete

// Example streaming usage
for await (const event of rlm.stream(query, context)) {
  switch (event.type) {
    case 'thinking':
      console.log('Thinking:', event.data.content);
      break;
    case 'code':
      console.log('Executing:', event.data.code);
      break;
    case 'code_output':
      console.log('Output:', event.data.output);
      break;
    case 'final':
      console.log('Answer:', event.data.response);
      break;
  }
}
```

### Supported Models

| Provider | Models | Description |
|----------|--------|-------------|
| **OpenAI** | | |
| | `gpt-5`, `gpt-5-mini`, `gpt-5.1`, `gpt-5.2` | GPT-5 Series - Latest flagship reasoning models |
| | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` | GPT-4.1 Series |
| | `gpt-4o`, `gpt-4o-mini` | GPT-4o Series |
| | `o3`, `o3-mini`, `o3-pro` | o3 Reasoning Models |
| | `o1`, `o1-mini`, `o1-pro` | o1 Reasoning Models |
| | `gpt-4-turbo`, `gpt-3.5-turbo` | Legacy models |
| **Anthropic** | | |
| | `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5` | Claude 4.5 Series - Current flagship |
| | `claude-sonnet-4`, `claude-opus-4`, `claude-opus-4-1` | Claude 4 Series (legacy) |
| | `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, `claude-3-opus-latest` | Claude 3.x (deprecated) |
| **Google** | | |
| | `gemini-3-pro-preview`, `gemini-3-flash-preview` | Gemini 3 Series (preview) |
| | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` | Gemini 2.5 Series (production) |
| | `gemini-2.0-flash`, `gemini-2.0-flash-lite` | Gemini 2.0 Series |

## Advanced Usage

### Custom LLM Client with Retry Logic

```typescript
import { createClient, ResilientClient } from './src/index.js';

// Create a resilient client with retry logic
const baseClient = createClient('gpt-4o-mini', {
  apiKey: process.env.OPENAI_API_KEY,
});

const resilientClient = new ResilientClient(baseClient, {
  maxRetries: 5,
  initialDelay: 1000,
  logRetries: true,
});
```

### Cost Tracking

```typescript
import { RLM, CostTracker, BudgetExceededError } from './src/index.js';

const costTracker = new CostTracker({
  maxBudget: 1.00,  // $1.00 maximum
  maxTokens: 100000,
});

try {
  const result = await rlm.completion(query, context);
  costTracker.addUsage(result.usage);
  console.log(`Total spent: $${costTracker.getTotalCost().toFixed(4)}`);
} catch (error) {
  if (error instanceof BudgetExceededError) {
    console.log('Budget exceeded!');
  }
}
```

### Rate Limiting

```typescript
import { RateLimiter, withRateLimit } from './src/index.js';

const limiter = new RateLimiter({
  requestsPerMinute: 60,
  tokensPerMinute: 90000,
});

const rateLimitedFn = withRateLimit(
  () => rlm.completion(query, context),
  limiter,
  { estimatedTokens: 1000 }
);
```

### Trace Logging

```typescript
import { RLM, createFileReporter } from './src/index.js';

// Create a file reporter for JSONL output
const reporter = createFileReporter('./traces', {
  includeTimestamps: true,
  prettyPrint: false,
});

const result = await rlm.completion(query, context);

// Export trace to file
reporter.exportSession({
  id: 'session-1',
  startTime: Date.now(),
  entries: result.trace,
  totalTokens: result.usage.totalTokens,
  totalCost: result.usage.estimatedCost,
});
```

## Environment Variables

```bash
# Required: At least one API key for your chosen provider
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...             # or GEMINI_API_KEY

# Optional configuration
RLM_MODEL=gpt-4o-mini          # Default model
RLM_MAX_ITERATIONS=20          # Max REPL iterations
RLM_MAX_DEPTH=1                # Max recursion depth
RLM_SANDBOX_TIMEOUT=30000      # Sandbox timeout (ms)
RLM_VERBOSE=false              # Enable verbose logging
```

## Vercel Deployment

The package includes Vercel API routes. Deploy with:

```bash
vercel deploy
```

### API Endpoints

**POST /api/completion**
```json
{
  "query": "Find all dates mentioned",
  "context": "The meeting is on January 15th...",
  "options": {
    "model": "gpt-4o-mini",
    "maxIterations": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "response": "The answer",
  "trace": [...],
  "usage": {
    "totalTokens": 1234,
    "totalCalls": 5,
    "estimatedCost": 0.001
  }
}
```

**GET /api/health**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Examples

See the [examples](./examples) directory for complete examples:

- **[basic-usage.ts](./examples/basic-usage.ts)** - Simple RLM usage
- **[needle-haystack.ts](./examples/needle-haystack.ts)** - Finding specific information in large text
- **[document-qa.ts](./examples/document-qa.ts)** - Question answering over long documents
- **[multi-document.ts](./examples/multi-document.ts)** - Reasoning across multiple documents

Run examples with:

```bash
npm run example:needle
npm run example:docqa
npm run example:multi
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests once
npm run test:run

# Build
npm run build

# Lint
npm run lint

# Format
npm run format
```

## Architecture

```
+-------------------------------------------------------------+
|                    RLM API (Vercel)                         |
+-------------------------------------------------------------+
|  /api/completion     - Main RLM endpoint                    |
|  /api/health         - Health check                         |
+-------------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------------+
|                     RLM Core Engine                         |
+-------------------------------------------------------------+
|  +-------------+  +-------------+  +---------------------+  |
|  |     RLM     |--|  Executor   |--|  LLM Client         |  |
|  +-------------+  +-------------+  +---------------------+  |
|         |                |                   |              |
|         v                v                   v              |
|  +-------------+  +-------------+  +---------------------+  |
|  |   Logger    |  |  Sandbox    |  |  Model Adapters     |  |
|  |  (Traces)   |  |  (VM)       |  | (OpenAI, Anthropic, |  |
|  |             |  |             |  |  Google Gemini)     |  |
|  +-------------+  +-------------+  +---------------------+  |
+-------------------------------------------------------------+
```

## References

- **Paper**: [Recursive Language Models](https://arxiv.org/abs/2512.24601)
- **Authors**: Alexander Zhang, Tim Kraska, Omar Khattab
- **Official Python Implementation**: [github.com/alexzhang13/rlm](https://github.com/alexzhang13/rlm)
- **Minimal Implementation**: [github.com/alexzhang13/rlm-minimal](https://github.com/alexzhang13/rlm-minimal)

## License

MIT
