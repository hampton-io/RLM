#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RLM } from './rlm.js';
import { hasValidCredentials, getConfigSummary, resolveConfig } from './config.js';
import type { SupportedModel } from './types.js';

/**
 * CLI for testing RLM.
 *
 * Usage:
 *   npx tsx src/cli.ts "Your query" --context file.txt
 *   npx tsx src/cli.ts "Your query" --context "inline context"
 *   echo "context" | npx tsx src/cli.ts "Your query" --stdin
 */

interface CLIOptions {
  query: string;
  context?: string;
  contextFile?: string;
  stdin?: boolean;
  model?: SupportedModel;
  verbose?: boolean;
  stream?: boolean;
  maxIterations?: number;
  maxCost?: number;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    query: '',
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--context' || arg === '-c') {
      options.context = args[++i];
    } else if (arg === '--file' || arg === '-f') {
      options.contextFile = args[++i];
    } else if (arg === '--stdin') {
      options.stdin = true;
    } else if (arg === '--model' || arg === '-m') {
      options.model = args[++i] as SupportedModel;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--stream' || arg === '-s') {
      options.stream = true;
    } else if (arg === '--max-iterations') {
      options.maxIterations = parseInt(args[++i], 10);
    } else if (arg === '--max-cost') {
      options.maxCost = parseFloat(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-') && !options.query) {
      options.query = arg;
    }

    i++;
  }

  return options;
}

function printHelp(): void {
  console.log(`
RLM - Recursive Language Models CLI

Usage:
  npx tsx src/cli.ts <query> [options]

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
  -h, --help                Show this help message

Examples:
  # Simple query with inline context
  npx tsx src/cli.ts "What is the main topic?" -c "This is about AI..."

  # Query with file context
  npx tsx src/cli.ts "Summarize this document" -f document.txt

  # Pipe context from another command
  cat large_file.txt | npx tsx src/cli.ts "Find all email addresses" --stdin

  # Use Claude with streaming
  npx tsx src/cli.ts "Analyze this" -f data.txt -m claude-3-5-sonnet-latest --stream

Supported Models:
  OpenAI:     gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
  Anthropic:  claude-3-5-sonnet-latest, claude-3-5-haiku-latest, claude-3-opus-latest
`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.query) {
    console.error('Error: Query is required');
    printHelp();
    process.exit(1);
  }

  // Check credentials
  const creds = hasValidCredentials();
  if (!creds.openai && !creds.anthropic) {
    console.error('Error: No API keys found.');
    console.error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.');
    process.exit(1);
  }

  // Get context
  let context = '';

  if (options.stdin) {
    console.log('Reading context from stdin...');
    context = await readStdin();
  } else if (options.contextFile) {
    const filePath = resolve(options.contextFile);
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    context = readFileSync(filePath, 'utf8');
    console.log(`Loaded context from ${filePath} (${context.length.toLocaleString()} chars)`);
  } else if (options.context) {
    context = options.context;
  }

  // Create RLM instance
  const model = options.model ?? 'gpt-4o-mini';

  try {
    const config = resolveConfig({
      model,
      verbose: options.verbose,
      maxIterations: options.maxIterations,
    });

    if (options.verbose) {
      console.log('\n--- Configuration ---');
      console.log(getConfigSummary(config));
      console.log('---\n');
    }

    const rlm = new RLM({
      model: config.model,
      verbose: config.verbose,
      maxIterations: config.maxIterations,
      temperature: config.temperature,
    });

    console.log(`\nQuery: ${options.query}`);
    console.log(`Context: ${context.length.toLocaleString()} characters`);
    console.log(`Model: ${model}`);
    console.log('\n--- Processing ---\n');

    if (options.stream) {
      // Streaming mode
      const stream = rlm.stream(options.query, context);
      let result;

      for await (const event of stream) {
        switch (event.type) {
          case 'start':
            console.log('[START] Processing started');
            break;
          case 'thinking':
            if (options.verbose) {
              console.log(`[THINK] ${event.data.content.slice(0, 100)}...`);
            }
            break;
          case 'code':
            console.log(`[CODE] Iteration ${event.data.iteration}`);
            if (options.verbose) {
              console.log(event.data.code);
            }
            break;
          case 'code_output':
            console.log(`[OUTPUT] ${event.data.output.slice(0, 200)}${event.data.output.length > 200 ? '...' : ''}`);
            if (event.data.error) {
              console.log(`[ERROR] ${event.data.error}`);
            }
            break;
          case 'final':
            console.log(`\n[FINAL] Method: ${event.data.method}`);
            break;
          case 'error':
            console.error(`[ERROR] ${event.data.message}`);
            break;
          case 'done':
            result = {
              usage: event.data.usage,
              executionTime: event.data.executionTime,
            };
            break;
        }
      }

      if (result) {
        console.log('\n--- Result ---\n');
        console.log('(See FINAL output above)');
        console.log(`\nTokens: ${result.usage.totalTokens.toLocaleString()}`);
        console.log(`Calls: ${result.usage.totalCalls}`);
        console.log(`Cost: $${result.usage.estimatedCost.toFixed(4)}`);
        console.log(`Time: ${result.executionTime}ms`);
      }
    } else {
      // Non-streaming mode
      const result = await rlm.completion(options.query, context);

      console.log('\n--- Result ---\n');
      console.log(result.response);
      console.log(`\n--- Stats ---`);
      console.log(`Tokens: ${result.usage.totalTokens.toLocaleString()}`);
      console.log(`Calls: ${result.usage.totalCalls}`);
      console.log(`Cost: $${result.usage.estimatedCost.toFixed(4)}`);
      console.log(`Time: ${result.executionTime}ms`);

      if (options.verbose) {
        console.log(`\n--- Trace (${result.trace.length} entries) ---`);
        for (const entry of result.trace) {
          console.log(`  [${entry.data.type}] depth=${entry.depth}`);
        }
      }
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
