/**
 * Needle-in-a-Haystack Example
 *
 * Demonstrates RLM's ability to find specific information hidden within
 * a large document. This is a classic benchmark for long-context models.
 *
 * Run with: npx tsx examples/needle-haystack.ts
 */

import { RLM } from '../src/index.js';

// Configuration
const HAYSTACK_SIZE = 100000; // Characters of filler text
const NEEDLE_POSITION = 0.5; // Where to place the needle (0-1)

/**
 * Generate a large haystack document with a hidden needle.
 */
function generateHaystack(size: number, needlePosition: number): {
  document: string;
  needle: string;
  actualPosition: number;
} {
  const needle = 'SECRET-CODE-X7Y9Z3';
  const needleSentence = `The secret access code for the vault is: ${needle}. Memorize it carefully.`;

  // Generate filler paragraphs about random topics
  const topics = [
    'The quarterly financial report shows steady growth across all departments. Revenue increased by 12% compared to the previous quarter, driven primarily by expansion in the APAC region.',
    'Our new product line has received positive feedback from early adopters. Customer satisfaction scores have improved by 8 points since the last survey.',
    'The engineering team completed the infrastructure migration ahead of schedule. System uptime has improved to 99.97% over the past month.',
    'Marketing initiatives have generated a 25% increase in qualified leads. The new digital campaign targeting enterprise customers shows promising results.',
    'Human resources reports that employee retention has improved significantly. The new benefits package has been well-received across all departments.',
    'The supply chain optimization project has reduced delivery times by 15%. Inventory management efficiency has also improved substantially.',
    'Research and development is on track with the next-generation product. Initial prototypes have passed all preliminary testing phases.',
    'Customer support metrics show a 20% reduction in average resolution time. The new ticketing system has streamlined our support processes.',
    'The sustainability initiative has exceeded its first-year targets. Carbon emissions have been reduced by 30% through various green programs.',
    'International expansion continues with new offices in three countries. Local teams are being established to support regional operations.',
  ];

  // Build the haystack
  const paragraphs: string[] = [];
  let currentLength = 0;
  let needleInserted = false;
  const insertPosition = Math.floor(size * needlePosition);

  while (currentLength < size) {
    // Check if we should insert the needle
    if (!needleInserted && currentLength >= insertPosition) {
      paragraphs.push(needleSentence);
      needleInserted = true;
      currentLength += needleSentence.length;
      continue;
    }

    // Add a filler paragraph
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const paragraph = `Section ${paragraphs.length + 1}: ${topic}`;
    paragraphs.push(paragraph);
    currentLength += paragraph.length + 2; // +2 for newlines
  }

  // Ensure needle is inserted if we haven't yet
  if (!needleInserted) {
    const insertIndex = Math.floor(paragraphs.length * needlePosition);
    paragraphs.splice(insertIndex, 0, needleSentence);
  }

  const document = paragraphs.join('\n\n');
  const actualPosition = document.indexOf(needle) / document.length;

  return { document, needle, actualPosition };
}

async function main() {
  console.log('=== Needle-in-a-Haystack Test ===\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  // Generate the haystack
  console.log(`Generating haystack of ~${HAYSTACK_SIZE.toLocaleString()} characters...`);
  const { document, needle, actualPosition } = generateHaystack(HAYSTACK_SIZE, NEEDLE_POSITION);

  console.log(`Document size: ${document.length.toLocaleString()} characters`);
  console.log(`Needle hidden at position: ${(actualPosition * 100).toFixed(1)}% through the document`);
  console.log(`Needle value: ${needle}\n`);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: true,
    maxIterations: 10,
  });

  // Query to find the needle
  const query = 'Find the secret access code mentioned in this document. Return only the code itself.';

  console.log(`Query: "${query}"\n`);
  console.log('--- RLM Processing ---\n');

  try {
    const startTime = Date.now();

    // Use streaming to show progress
    const stream = rlm.stream(query, document);
    let finalResponse = '';

    for await (const event of stream) {
      switch (event.type) {
        case 'start':
          console.log('[START] Beginning search...');
          break;
        case 'code':
          console.log(`[CODE] Iteration ${event.data.iteration}: Executing search code`);
          break;
        case 'code_output':
          if (event.data.output) {
            const preview = event.data.output.slice(0, 150);
            console.log(`[OUTPUT] ${preview}${event.data.output.length > 150 ? '...' : ''}`);
          }
          break;
        case 'final':
          finalResponse = event.data.response;
          console.log(`\n[FINAL] ${finalResponse}`);
          break;
        case 'done':
          const elapsed = Date.now() - startTime;
          console.log(`\n--- Results ---`);
          console.log(`Time: ${elapsed}ms`);
          console.log(`Tokens: ${event.data.usage.totalTokens.toLocaleString()}`);
          console.log(`Cost: $${event.data.usage.estimatedCost.toFixed(4)}`);
          console.log(`API Calls: ${event.data.usage.totalCalls}`);
          break;
      }
    }

    // Verify result
    console.log(`\n--- Verification ---`);
    const found = finalResponse.includes(needle);
    console.log(`Expected: ${needle}`);
    console.log(`Found in response: ${found ? 'YES ✓' : 'NO ✗'}`);

    if (!found) {
      console.log(`\nNote: The model may have found the code but formatted it differently.`);
      console.log(`Check if the response contains the code pattern.`);
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
