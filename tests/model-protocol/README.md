# Model Protocol Compliance Tests

This test suite validates whether different LLM models correctly follow the RLM (REPL Language Model) protocol.

## Dataset

Tests use "War and Peace" by Leo Tolstoy (public domain) as a large text corpus for testing context handling.

### Download Instructions

Download the dataset from Project Gutenberg:

```bash
curl -o tests/model-protocol/war-and-peace.txt https://www.gutenberg.org/cache/epub/2600/pg2600.txt
```

If gutenberg.org is down, use the PGLAF mirror:

```bash
curl -L -o tests/model-protocol/war-and-peace.txt https://gutenberg.pglaf.org/2/6/0/2600/2600-0.txt
```

The file should be ~3.3MB and contain the full text of War and Peace.

## Running Tests

Tests require at least one API key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY`). If you have a `.env` file, export the variables first:

```bash
export $(grep -v '^#' .env | xargs)
```

Run all protocol tests:
```bash
MODEL=gpt-5.2 npx vitest run tests/model-protocol/model-protocol.test.ts
```

Test with a specific model:
```bash
MODEL=claude-3-5-sonnet-latest npx vitest run tests/model-protocol/model-protocol.test.ts
```

## Test Categories

1. **Basic Protocol Compliance**
   - Simple FINAL() usage
   - Context data extraction
   - grep() function usage

2. **Code Execution**
   - JavaScript code block execution
   - Variable persistence with store()/get()

3. **Medium Context Handling**
   - Large text exploration (len, slice)
   - Search functionality in large corpus

4. **Output Format Validation**
   - No JavaScript artifacts in final answers
   - Coherent multi-sentence responses

## Test Results Format

Tests output a summary showing:
- Pass rate per model
- Average execution time
- Token usage
- Specific failure details

## Debug Scripts

Several debug scripts are available to investigate protocol issues:
- `debug-raw-output.ts` - Capture raw LLM responses
- `debug-code.ts` - Show parsed vs raw code
- `debug-execution.ts` - Trace full execution flow
- `debug-sandbox.ts` - Test sandbox FINAL() handling