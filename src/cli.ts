#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RLM } from './rlm.js';
import { hasValidCredentials, getConfigSummary, resolveConfig } from './config.js';
import {
  estimateTotalCost,
  formatCostEstimate,
  compareCosts,
  createImageContent,
} from './utils/index.js';
import { render, getTemplateHelp, parseTemplateVars, listTemplateIds } from './templates/index.js';
import { SessionManager, createSession, completeSession, failSession } from './session.js';
import { metricsCollector } from './metrics/index.js';
import type { SupportedModel, ImageContent } from './types.js';
import type { ChunkStrategy } from './embeddings/types.js';

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
  estimate?: boolean;
  compareModels?: boolean;
  dryRun?: boolean;
  template?: string;
  templateVars?: string;
  listTemplates?: boolean;
  chunkStrategy?: ChunkStrategy;
  imagePath?: string;
  session?: string;
  metrics?: boolean;
  metricsPort?: number;
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
    } else if (arg === '--estimate' || arg === '-e') {
      options.estimate = true;
    } else if (arg === '--compare') {
      options.compareModels = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--template' || arg === '-t') {
      options.template = args[++i];
    } else if (arg === '--template-vars' || arg === '--vars') {
      options.templateVars = args[++i];
    } else if (arg === '--list-templates') {
      options.listTemplates = true;
    } else if (arg === '--chunk-strategy') {
      const strategy = args[++i];
      if (!['fixed', 'semantic', 'sentence', 'paragraph'].includes(strategy)) {
        console.error(
          `Error: Invalid chunk strategy "${strategy}". Must be: fixed, semantic, sentence, paragraph`
        );
        process.exit(1);
      }
      options.chunkStrategy = strategy as ChunkStrategy;
    } else if (arg === '--image' || arg === '-i') {
      options.imagePath = resolve(args[++i]);
    } else if (arg === '--session') {
      options.session = args[++i];
    } else if (arg === '--metrics') {
      options.metrics = true;
    } else if (arg === '--metrics-port') {
      options.metricsPort = parseInt(args[++i], 10);
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
  -m, --model <model>       Model to use (default: gpt-5.2)
  -v, --verbose             Enable verbose output
  -s, --stream              Stream output events
  --max-iterations <n>      Maximum iterations (default: 20)
  --max-cost <n>            Maximum cost in USD
  -e, --estimate            Estimate tokens and cost without running
  --compare                 Compare costs across multiple models
  --dry-run                 Full dry run showing config, functions, prompts
  -t, --template <id>       Use a built-in prompt template
  --template-vars <vars>    Variables for template (key=value,key2=value2)
  --list-templates          List all available templates
  --chunk-strategy <type>   Chunking strategy: fixed, semantic, sentence, paragraph
  -i, --image <path>        Path to image file for multimodal queries
  --session <id>            Session ID to resume, or "new" to create one
  --metrics                 Enable metrics collection
  --metrics-port <port>     Port for metrics API server (default: 3001)
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

  # Estimate cost before running
  npx tsx src/cli.ts "Analyze this" -f large.txt --estimate

  # Compare costs across models
  npx tsx src/cli.ts "Summarize" -f document.txt --compare

  # Full dry run with configuration details
  npx tsx src/cli.ts "Analyze code" -f code.ts --dry-run

  # Use a template
  npx tsx src/cli.ts "" -f document.txt --template summarize

  # Use a template with variables
  npx tsx src/cli.ts "" -f data.txt --template extract --template-vars "fields=Name,Email"

  # List available templates
  npx tsx src/cli.ts --list-templates

  # Use semantic chunking for large context
  npx tsx src/cli.ts "Summarize" -f large.txt --chunk-strategy semantic

  # Analyze an image with multimodal query
  npx tsx src/cli.ts "Describe this image" --image photo.png -m claude-sonnet-4-5

  # Create a new session
  npx tsx src/cli.ts "Start analysis" -f data.txt --session new

  # Resume an existing session
  npx tsx src/cli.ts --session abc123

Supported Models:
  OpenAI:     gpt-5, gpt-5-mini, gpt-4.1, gpt-4o, gpt-4o-mini, o3, o3-mini, o1
  Anthropic:  claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5
  Google:     gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
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

  // Handle --list-templates (no query required)
  if (options.listTemplates) {
    console.log(getTemplateHelp());
    return;
  }

  if (!options.query && !options.template) {
    console.error('Error: Query is required (or use --template)');
    printHelp();
    process.exit(1);
  }

  // Get context (before credential check so --estimate works without API keys)
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

  // Load image if specified
  let image: ImageContent | undefined;
  if (options.imagePath) {
    if (!existsSync(options.imagePath)) {
      console.error(`Error: Image file not found: ${options.imagePath}`);
      process.exit(1);
    }
    try {
      image = await createImageContent(options.imagePath);
      console.log(`Loaded image from ${options.imagePath}`);
    } catch (error) {
      console.error(`Error loading image: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }

  // Apply template if specified
  let query = options.query;
  if (options.template) {
    const templateIds = listTemplateIds();
    if (!templateIds.includes(options.template)) {
      console.error(`Error: Unknown template "${options.template}"`);
      console.error(`Available templates: ${templateIds.join(', ')}`);
      process.exit(1);
    }

    const templateVars = options.templateVars ? parseTemplateVars(options.templateVars) : {};
    try {
      query = render(options.template, templateVars);
      console.log(`Using template: ${options.template}`);
      if (Object.keys(templateVars).length > 0) {
        console.log(`Template variables: ${JSON.stringify(templateVars)}`);
      }
    } catch (error) {
      console.error(`Error rendering template: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }

  // Get model
  const model = options.model ?? 'gpt-5.2';

  // Handle dry run mode (no API call required)
  if (options.dryRun) {
    const dryRunResult = RLM.dryRun(query, context, {
      model,
      maxIterations: options.maxIterations,
      verbose: options.verbose,
    });
    console.log(RLM.formatDryRun(dryRunResult));
    return;
  }

  // Handle estimate mode (no API call required)
  if (options.estimate || options.compareModels) {
    console.log(`\nQuery: ${query}`);
    console.log(`Context: ${context.length.toLocaleString()} characters`);

    if (options.compareModels) {
      // Compare costs across popular models
      const modelsToCompare: SupportedModel[] = [
        'gpt-4o-mini',
        'gpt-4o',
        'gpt-5-mini',
        'gpt-5',
        'gpt-4.1-mini',
        'gpt-4.1',
        'o3-mini',
        'claude-haiku-4-5',
        'claude-sonnet-4-5',
        'claude-opus-4-5',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
      ];

      console.log('\n--- Cost Comparison ---\n');

      const ranked = compareCosts(query, context, modelsToCompare, {
        estimatedIterations: options.maxIterations ?? 3,
      });

      console.log('Rank | Model                      | Tokens      | Est. Cost');
      console.log('-----|----------------------------|-------------|----------');

      for (const estimate of ranked) {
        const modelPadded = estimate.model.padEnd(26);
        const tokensPadded = estimate.tokens.totalTokens.toLocaleString().padStart(11);
        const cost = `$${estimate.cost.toFixed(4)}`;
        console.log(`  ${estimate.rank}  | ${modelPadded} | ${tokensPadded} | ${cost}`);
      }

      console.log('\nNote: Estimates assume ~3 iterations. Actual costs may vary.');
    } else {
      // Single model estimate
      const estimate = estimateTotalCost(query, context, model, {
        estimatedIterations: options.maxIterations ?? 3,
      });

      console.log(`\n--- Cost Estimate for ${model} ---\n`);
      console.log(formatCostEstimate(estimate));
      console.log('\nNote: This is an estimate. Actual costs may vary based on model output.');
    }

    return;
  }

  // Check credentials (only needed for actual execution, not estimate mode)
  const creds = hasValidCredentials();
  if (!creds.openai && !creds.anthropic && !creds.google) {
    console.error('Error: No API keys found.');
    console.error('Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY environment variable.');
    process.exit(1);
  }

  // Handle session management
  const sessionManager = new SessionManager();
  let sessionId: string | undefined;

  if (options.session) {
    if (options.session === 'new') {
      // Create a new session ID
      sessionId = randomUUID();
      console.log(`Created new session: ${sessionId}`);
    } else {
      // Try to resume existing session
      sessionId = options.session;
      const sessionExists = await sessionManager.exists(sessionId);
      if (sessionExists) {
        try {
          const session = await sessionManager.load(sessionId);
          // Restore query and context from session if not provided
          if (!options.query && !options.template) {
            query = session.query;
            console.log(`Resumed session: ${sessionId}`);
            console.log(`Original query: ${query}`);
          }
          if (!context && session.context) {
            context = session.context;
            console.log(`Restored context: ${context.length.toLocaleString()} characters`);
          }
          // Use the same model as the original session if not specified
          if (!options.model) {
            options.model = session.config.model;
          }
        } catch (error) {
          console.error(`Error loading session: ${error instanceof Error ? error.message : error}`);
          process.exit(1);
        }
      } else {
        console.log(`Session not found: ${sessionId}, creating new session`);
      }
    }
  }

  // Configure metrics if enabled
  if (options.metrics) {
    const storagePath = process.env.RLM_METRICS_FILE || `${process.env.HOME}/.rlm/metrics.json`;
    metricsCollector.configure({
      enabled: true,
      apiKey: process.env.RLM_METRICS_API_KEY,
      redactQueries: process.env.RLM_REDACT_QUERIES === 'true',
      maxHistory: parseInt(process.env.RLM_MAX_HISTORY || '10000', 10),
      storagePath,
    });
    console.log(`Metrics collection enabled (storing to ${storagePath})`);
  }

  // Create RLM instance (requires API key)
  try {
    const config = resolveConfig({
      model,
      verbose: options.verbose,
      maxIterations: options.maxIterations,
      maxCost: options.maxCost,
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
      maxDepth: config.maxDepth,
      sandboxTimeout: config.sandboxTimeout,
      temperature: config.temperature,
      maxCost: config.maxCost,
      maxTokens: config.maxTokens,
      image,
    });

    console.log(`\nQuery: ${query}`);
    console.log(`Context: ${context.length.toLocaleString()} characters`);
    if (image) {
      console.log(`Image: ${options.imagePath} (${image.source.mediaType})`);
    }
    console.log(`Model: ${model}`);
    console.log('\n--- Processing ---\n');

    if (options.stream) {
      // Streaming mode
      const stream = rlm.stream(query, context);
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
            console.log(
              `[OUTPUT] ${event.data.output.slice(0, 200)}${event.data.output.length > 200 ? '...' : ''}`
            );
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
      const result = await rlm.completion(query, context);

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

      // Save session on completion
      if (sessionId) {
        const session = createSession(query, context, config, { id: sessionId });
        const completedSession = completeSession(session, result.response, result.executionTime);
        await sessionManager.save(completedSession);
        console.log(`\nSession saved: ${sessionId}`);
      }
    }
  } catch (error) {
    // Save failed session if session tracking is enabled
    if (sessionId) {
      try {
        const session = createSession(
          query,
          context,
          { model, maxIterations: options.maxIterations },
          { id: sessionId }
        );
        const failedSession = failSession(
          session,
          error instanceof Error ? error : new Error(String(error))
        );
        await sessionManager.save(failedSession);
        console.error(`Session saved (failed): ${sessionId}`);
      } catch {
        // Ignore session save errors
      }
    }
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
