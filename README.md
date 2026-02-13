# RLM - Recursive Language Models

A Node.js/TypeScript implementation of Recursive Language Models based on the research paper [arXiv:2512.24601](https://arxiv.org/abs/2512.24601) by Zhang, Kraska, and Khattab.

RLM enables LLMs to process **arbitrarily long contexts** by treating them as an external environment that can be programmatically explored via a JavaScript REPL. Instead of feeding entire long documents into the model's context window, RLM allows the model to write code to search, analyze, and recursively query smaller chunks.

## Performance Benchmarks (v0.5.0)

| Model | Speed | Cost/Query | Notes |
|-------|-------|------------|-------|
| **gpt-5.2** | 1.0s | $0.0008 | Fastest overall |
| gpt-5.1 | 2.0s | $0.0009 | Very fast |
| **gemini-2.0-flash** | 2.7s | $0.0005 | Best value (default) |
| gpt-5-mini | 4.0s | $0.0012 | Reasoning model |
| gpt-4.1 | 5.0s | $0.0104 | Reliable |
| claude-haiku-4-5 | 7.0s | $0.0068 | Fast Anthropic |
| claude-opus-4-6 | 18.7s | $0.1137 | Best quality |

See [docs/MODEL-BENCHMARK.md](./docs/MODEL-BENCHMARK.md) for full results across 25+ models.

## Features

- **Unlimited Context Length**: Process documents far larger than any model's context window
- **Multi-Provider Support**: OpenAI (GPT-5.x, GPT-4.x, o3, o4), Anthropic (Claude 4.5/4.6), Google (Gemini 2/2.5/3)
- **Reasoning Model Support**: Automatic handling of gpt-5, o3, o4 models (no temperature parameter)
- **Streaming Support**: Real-time progress updates during execution
- **Secure Sandbox**: Code execution in isolated VM environment with 14 built-in tools
- **Recursive Sub-Queries**: LLM can spawn sub-calls to itself over context chunks
- **Comprehensive Tracing**: Full execution trace with token usage and cost tracking
- **Model Fallback Chains**: Automatic retry with fallback models on failure
- **Prompt Templates**: 7 built-in templates for common tasks
- **Extended Thinking**: Support for Claude 4.5 extended thinking mode
- **Multimodal Support**: Vision capabilities for image analysis
- **Session Persistence**: Save and resume long-running executions
- **Semantic Chunking**: Embedding-based intelligent text chunking
- **Cost Estimation**: Dry run mode for pre-execution cost analysis
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

const rlm = new RLM({ model: 'gemini-2.0-flash' });  // Default model

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

# Estimate cost before running (no API call)
npx tsx src/cli.ts "Analyze" -f large.txt --estimate

# Full dry run with configuration preview
npx tsx src/cli.ts "Analyze" -f large.txt --dry-run

# Compare costs across models
npx tsx src/cli.ts "Analyze" -f data.txt --compare

# Use a built-in template
npx tsx src/cli.ts -f document.txt --template summarize

# Use template with custom variables
npx tsx src/cli.ts -f document.txt --template extract --template-vars "schema={name,email,phone}"

# List available templates
npx tsx src/cli.ts --list-templates

# Use semantic chunking for large documents
npx tsx src/cli.ts "Summarize" -f large.txt --chunk-strategy semantic

# Analyze an image (multimodal)
npx tsx src/cli.ts "Describe this chart" --image chart.png -m claude-sonnet-4-5

# Create a new session for long tasks
npx tsx src/cli.ts "Analyze this codebase" -f code.txt --session new

# Resume an existing session
npx tsx src/cli.ts --session abc123-def456
```

### CLI Options

```
Arguments:
  query                          The question or task to perform

Options:
  -c, --context <text>           Inline context string
  -f, --file <path>              Path to context file
  --stdin                        Read context from stdin
  -m, --model <model>            Model to use (default: gemini-2.0-flash)
  -v, --verbose                  Enable verbose output
  -s, --stream                   Stream output events
  --max-iterations <n>           Maximum iterations (default: 20)
  --max-cost <n>                 Maximum cost in USD
  --estimate                     Estimate cost without running
  --dry-run                      Show full execution plan without running
  --compare                      Compare costs across 12 popular models
  --template <id>                Use a built-in prompt template
  --template-vars <vars>         Template variables (key=value,key2=value2)
  --list-templates               List available templates
  --chunk-strategy <type>        Chunking strategy: fixed, semantic, sentence, paragraph
  -i, --image <path>             Path to image file for multimodal queries
  --session <id>                 Session ID to resume, or "new" to create one
  -h, --help                     Show help message
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

// Core utility functions
function chunk(text: string, size: number): string[];   // Split into chunks
function grep(text: string, pattern: RegExp): string[]; // Find matching lines
function len(text: string): number;                     // Get length

// Data processing tools (14 built-in)
function parseJSON(text: string, defaultValue?: any): any;
function parseCSV(text: string, options?: {delimiter?, headers?}): any[];
function formatTable(data: any[]): string;
function dedupe(array: any[], key?: string): any[];
function sort(array: any[], key?: string, order?: 'asc'|'desc'): any[];
function groupBy(array: any[], key: string): Record<string, any[]>;
function flatten(array: any[], depth?: number): any[];
function pick(data: any, keys: string[]): any;
function omit(data: any, keys: string[]): any;
function countBy(array: any[], key: string): Record<string, number>;
function summarize(array: any[], key: string): {sum, avg, min, max, count};
function extractBetween(text: string, start: string, end: string): string[];
function truncate(text: string, maxLength: number, suffix?: string): string;
function textStats(text: string): {words, lines, chars, sentences};
```

## API Reference

### RLM Class

```typescript
interface RLMOptions {
  model: SupportedModel;        // Required: 'gpt-4o', 'claude-sonnet-4-5', etc.
  maxIterations?: number;       // Default: 20
  maxDepth?: number;            // Default: 1 (for recursive calls)
  sandboxTimeout?: number;      // Default: 30000ms
  temperature?: number;         // Default: 0
  verbose?: boolean;            // Default: false
  extendedThinking?: {          // Claude 4.5+ only
    enabled: boolean;
    budgetTokens?: number;      // Default: 1024
  };
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

  // Dry run - estimate cost without execution (static, no API key needed)
  static dryRun(query: string, context: string, options?: Partial<RLMOptions>): DryRunResult;
  static formatDryRun(result: DryRunResult): string;
}
```

### Streaming Events

```typescript
type RLMStreamEventType =
  | 'start'             // Execution started
  | 'thinking'          // LLM reasoning (before code)
  | 'extended_thinking' // Claude 4.5 extended thinking content
  | 'code'              // Code to be executed
  | 'code_output'       // Output from code execution
  | 'sub_query'         // Starting a recursive sub-query
  | 'sub_response'      // Response from sub-query
  | 'final'             // Final answer produced
  | 'error'             // Error occurred
  | 'done';             // Execution complete

// Example streaming usage
for await (const event of rlm.stream(query, context)) {
  switch (event.type) {
    case 'thinking':
      console.log('Thinking:', event.data.content);
      break;
    case 'extended_thinking':
      console.log('Deep thinking:', event.data.content);
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

| Provider | Models | Type | Notes |
|----------|--------|------|-------|
| **OpenAI** | | | |
| | `gpt-5.2` | Chat | Fastest (1.0s) |
| | `gpt-5.1` | Chat | Very fast (2.0s) |
| | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | Reasoning | Hidden chain-of-thought |
| | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` | Chat | Reliable |
| | `gpt-4o`, `gpt-4o-mini` | Chat | |
| | `o3`, `o3-mini`, `o4-mini` | Reasoning | No temperature support |
| **Anthropic** | | | |
| | `claude-opus-4-6` | Chat | Latest, best quality |
| | `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5` | Chat | Production |
| **Google** | | | |
| | `gemini-2.0-flash` | Chat | **Default** (fastest + cheapest) |
| | `gemini-2.0-flash-lite` | Chat | Cheapest ($0.0004) |
| | `gemini-2.5-flash`, `gemini-2.5-pro` | Chat | Production |
| | `gemini-3-flash-preview`, `gemini-3-pro-preview` | Chat | Preview |

**Note:** Reasoning models (gpt-5, gpt-5-mini, gpt-5-nano, o3, o4) use hidden reasoning tokens and don't support the `temperature` parameter. RLM handles this automatically.

## Advanced Features

### Token Estimation & Dry Run

```typescript
import { RLM, estimateCost, compareCosts } from './src/index.js';

// Quick cost estimate
const estimate = estimateCost(query, context, 'gpt-4o-mini');
console.log(`Estimated cost: $${estimate.total.toFixed(4)}`);

// Compare costs across models
const comparison = compareCosts(query, context);
console.log('Cheapest:', comparison[0].model, '$' + comparison[0].cost.toFixed(4));

// Full dry run without API call
const dryRun = RLM.dryRun(query, context, { model: 'gpt-4o-mini' });
console.log(RLM.formatDryRun(dryRun));
```

### Model Fallback Chains

```typescript
import {
  FallbackChainClient,
  createCostOptimizedChain,
  createQualityOptimizedChain
} from './src/index.js';

// Automatic fallback: tries gpt-4o-mini -> gpt-4o -> claude-sonnet-4-5
const fallbackClient = new FallbackChainClient({
  models: ['gpt-4o-mini', 'gpt-4o', 'claude-sonnet-4-5'],
  onFallback: (event) => console.log(`Falling back to ${event.nextModel}`),
});

// Pre-configured chains
const cheapChain = createCostOptimizedChain();   // Cheapest models first
const qualityChain = createQualityOptimizedChain(); // Best models first
```

### Prompt Templates

```typescript
import { render, listTemplateIds, getTemplateHelp } from './src/index.js';

// List available templates
console.log(listTemplateIds()); // ['summarize', 'extract', 'analyze', 'compare', 'search', 'qa', 'code-review']

// Use a template
const query = render('summarize', {
  format: 'bullet points',
  maxLength: '500 words',
  focus: 'key findings'
});

// Get help for a template
console.log(getTemplateHelp('extract'));
```

**Built-in Templates:**
- `summarize` - Document summarization with customizable format
- `extract` - Structured data extraction to JSON
- `analyze` - Deep analysis with findings and patterns
- `compare` - Multi-item comparison
- `search` - Find specific information
- `qa` - Question answering
- `code-review` - Code review for bugs and security

### Extended Thinking (Claude 4.5)

```typescript
const rlm = new RLM({
  model: 'claude-sonnet-4-5',
  extendedThinking: {
    enabled: true,
    budgetTokens: 2048,  // Token budget for thinking
  },
});

// Thinking content available in streaming
for await (const event of rlm.stream(query, context)) {
  if (event.type === 'extended_thinking') {
    console.log('Claude is thinking:', event.data.content);
  }
}
```

### Multimodal / Vision Support

```typescript
import {
  createImageContent,
  createImageContentFromUrl
} from './src/index.js';

// Load image from file
const imageContent = await createImageContent('./chart.png');

// Or from URL
const urlImage = createImageContentFromUrl('https://example.com/image.jpg', 'image/jpeg');

// Use with multimodal-capable models
const result = await client.completion([
  { role: 'user', content: [
    { type: 'text', text: 'What does this chart show?' },
    imageContent
  ]}
]);
```

### Semantic Chunking with Embeddings

```typescript
import {
  chunkText,
  createEmbeddingClient,
  createMemoryVectorStore,
  findSimilarChunks
} from './src/index.js';

// Semantic chunking based on content similarity
const chunks = await chunkText(longDocument, {
  strategy: 'semantic',
  maxTokens: 500,
  embeddingClient: createEmbeddingClient('text-embedding-3-small'),
});

// Vector similarity search
const store = createMemoryVectorStore();
await store.addChunks(chunks);
const relevant = await store.search('climate change impacts', { topK: 5 });
```

### Session Persistence

```typescript
import {
  SessionManager,
  createSession,
  canResumeSession
} from './src/index.js';

const manager = new SessionManager('./sessions');

// Create and save a session
const session = createSession(query, context, { model: 'gpt-4o-mini' });
await manager.save(session);

// Later: resume the session
const loaded = await manager.load(session.id);
if (canResumeSession(loaded)) {
  // Continue execution from checkpoint
}

// Find resumable sessions
const resumable = await manager.getResumable();
```

### OpenAI Responses API (Web Search)

```typescript
import { OpenAIResponsesClient, webSearchTool } from './src/index.js';

const client = new OpenAIResponsesClient({
  apiKey: process.env.OPENAI_API_KEY,
});

// Web search with citations
const result = await client.webSearch('Latest news on AI regulation');
console.log(result.output);
console.log('Sources:', result.citations.map(c => c.url));
```

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
RLM_MODEL=gemini-2.0-flash     # Default model (fastest + cheapest)
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

### Basic Examples
- **[basic-usage.ts](./examples/basic-usage.ts)** - Simple RLM usage
- **[needle-haystack.ts](./examples/needle-haystack.ts)** - Finding specific information in large text
- **[document-qa.ts](./examples/document-qa.ts)** - Question answering over long documents
- **[multi-document.ts](./examples/multi-document.ts)** - Reasoning across multiple documents

### Practical Examples (Phase 10)
- **[code-analysis.ts](./examples/code-analysis.ts)** - Security vulnerabilities, code smells, refactoring suggestions
- **[pdf-processing.ts](./examples/pdf-processing.ts)** - PDF Q&A, data extraction, summarization
- **[data-extraction.ts](./examples/data-extraction.ts)** - Structured data extraction to JSON/CSV
- **[comparative-analysis.ts](./examples/comparative-analysis.ts)** - Multi-document comparison
- **[research-assistant.ts](./examples/research-assistant.ts)** - Research synthesis with citations
- **[log-analysis.ts](./examples/log-analysis.ts)** - Log parsing, anomaly detection, root cause analysis
- **[contract-review.ts](./examples/contract-review.ts)** - Contract analysis, risk assessment

Run examples with:

```bash
# Basic examples
npm run example:needle
npm run example:docqa
npm run example:multi

# Run practical examples directly
npx tsx examples/code-analysis.ts --sample
npx tsx examples/pdf-processing.ts --sample
npx tsx examples/data-extraction.ts --sample
npx tsx examples/log-analysis.ts --sample
```

## Claude Code Integration (MCP Server)

RLM includes an MCP (Model Context Protocol) server that integrates with Claude Code for semantic code search and analysis directly in your IDE.

### MCP Server Features

- **Semantic Code Search**: Search your codebase using natural language queries
- **Code Explanation**: Get detailed explanations of files, functions, and classes
- **Usage Analysis**: Find all usages of symbols across your project
- **Dependency Analysis**: Analyze imports/exports and detect circular dependencies
- **Real-time Updates**: Automatic index updates when files change
- **14 Language Support**: TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, C/C++, C#, Ruby, PHP, Swift

### Quick Setup

```bash
# Navigate to the mcp-server directory
cd mcp-server

# Install dependencies
npm install

# Build the server
npm run build
```

Add to your Claude Code configuration (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "rlm": {
      "command": "node",
      "args": ["/path/to/rlm/mcp-server/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `index_codebase` | Index the codebase for semantic search |
| `get_index_status` | Get current index status and statistics |
| `search_code` | Search code using natural language queries |
| `explain_code` | Get explanations of code files, functions, or ranges |
| `find_usages` | Find all usages of a symbol |
| `analyze_dependencies` | Analyze imports/exports, detect circular dependencies |
| `find_security_issues` | Scan for security vulnerabilities (secrets, injection, XSS, etc.) |

### Example Workflows

The MCP server includes [comprehensive workflow documentation](./mcp-server/docs/workflows.md) for common tasks:

1. **Onboarding to a New Codebase** - Quickly understand project structure and key components
2. **Refactoring a Module** - Safe refactoring with impact analysis
3. **Code Review** - Thorough review with pattern and dependency checks
4. **Bug Investigation** - Trace errors to root causes
5. **Dependency Audit** - Assess technical debt and dependency health
6. **API Documentation** - Generate docs for public APIs

See the [MCP Server README](./mcp-server/README.md) for full documentation.

## Development

```bash
# Install dependencies
npm install

# Run tests (673 tests)
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
|         |                |                                  |
|         v                v                                  |
|  +-------------+  +-------------+  +---------------------+  |
|  |  Sessions   |  |  Templates  |  |  Embeddings         |  |
|  | (Persist)   |  |  (7 built-in)|  | (Semantic Chunk)   |  |
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
