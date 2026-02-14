# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RLM (Recursive Language Models) is a Node.js/TypeScript library that enables LLMs to process arbitrarily long contexts by treating them as an external environment accessible via a JavaScript REPL. Based on [arXiv:2512.24601](https://arxiv.org/abs/2512.24601). Supports OpenAI, Anthropic, and Google providers.

## Commands

```bash
# Build
npm run build          # TypeScript compilation (tsc)
npm run dev            # Watch mode

# Test
npm test               # Vitest watch mode
npm run test:run       # Single run (CI)
npx vitest run tests/sandbox.test.ts           # Single test file
npx vitest run tests/sandbox.test.ts -t "name" # Single test by name

# Lint & Format
npm run lint           # ESLint
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier write
npm run format:check   # Prettier check
npm run check          # lint + format:check + test:run

# CLI
npm run rlm            # Run CLI via tsx
```

## Architecture

**ES Modules** (`"type": "module"`). All imports use `.js` extensions. Target: ES2022. Strict TypeScript.

### Core Flow

`RLM` (entry point) → `RLMExecutor` / `RLMStreamingExecutor` → `LLMClient` + `VMSandbox`

1. **`RLM`** (`src/rlm.ts`) - Public API. Creates executor instances, validates config, provides `completion()` and `stream()` methods plus `dryRun()` for cost estimation.
2. **`RLMExecutor`** (`src/executor.ts`) - REPL loop: sends context + query to LLM, parses response for code blocks, executes code in sandbox, feeds output back. Loops until LLM emits `FINAL`/`FINAL_VAR` marker or hits iteration limit.
3. **`RLMStreamingExecutor`** (`src/streaming-executor.ts`) - Same loop as executor but yields `RLMStreamEvent` discriminated union events via async generator.
4. **`VMSandbox`** (`src/sandbox/vm-sandbox.ts`) - Node VM-based code execution with injected context, 14 built-in tools (`parseJSON`, `parseCSV`, `formatTable`, etc.), and LLM query callbacks (`llm_query`, `llm_query_parallel`) for sub-queries.

### LLM Clients (`src/clients/`)

All implement the `LLMClient` interface (`completion`, `streamCompletion`, `countTokens`). Provider auto-detected from model name prefix (`claude-*` → anthropic, `gemini-*` → google, else openai). Factory: `createClient(model, config)`.

- `ResilientClient` - Retry wrapper around any client
- `FallbackChainClient` - Tries models in sequence on failure
- `OpenAIResponsesClient` - OpenAI Responses API with web/file search tools

### Key Supporting Modules

- **`src/utils/parser.ts`** - Parses LLM output for `<THINKING>`, code blocks, and `FINAL`/`FINAL_VAR` markers
- **`src/config.ts`** - Resolves config from options + env vars (`RLM_DEFAULT_MODEL`, `RLM_MAX_ITERATIONS`, etc.)
- **`src/cost-tracker.ts`** - Budget enforcement (`maxCost`, `maxTokens`)
- **`src/batch.ts`** - Parallel batch processing with concurrency control
- **`src/cache.ts`** - Response caching with pluggable backends
- **`src/session.ts`** - Session persistence and resume
- **`src/embeddings/`** - Semantic chunking and vector similarity search

### Other Directories

- **`api/`** - Vercel serverless API routes (completion, streaming, health)
- **`mcp-server/`** - Separate sub-project with its own `package.json` for Claude Code MCP integration
- **`examples/`** - Usage examples (run with `tsx`)

## Code Style

- Prettier: single quotes, trailing commas (es5), 100 char width, 2-space indent
- ESLint: `@typescript-eslint/recommended`, unused vars with `_` prefix allowed, `no-explicit-any` is warn-only
- Files: kebab-case. Classes: PascalCase. Functions: camelCase. Constants: UPPER_SNAKE_CASE
- Custom errors: `RLMError` class with `code` (error code enum) and optional `suggestion` field. Error factories in `src/utils/errors.ts`

## Testing

- Vitest with globals enabled, 30s timeout
- Tests in `tests/` directory, pattern: `tests/**/*.test.ts`
- Mock factory: `createMockClient(responses)` in test helpers
- Model protocol tests (`tests/model-protocol/`) hit real APIs and require `MODEL` env var
- Coverage excludes `src/types.ts`

## Environment

Requires Node >= 20. Needs at least one API key: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`/`GEMINI_API_KEY`. Default model: `gpt-5.2`.
