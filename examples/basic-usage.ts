/**
 * Basic usage example for RLM (Recursive Language Models)
 *
 * This example demonstrates how to use RLM to process a long context
 * and answer questions about it.
 *
 * Run with: npx tsx examples/basic-usage.ts
 */

import { RLM } from '../src/index.js';

// Example: Needle-in-a-haystack task
async function main() {
  // Create a long context with some hidden information
  const context = generateLongContext();

  console.log('Context length:', context.length, 'characters');
  console.log('---');

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: true,
    maxIterations: 10,
  });

  // Ask a question that requires finding specific information
  const query = 'Find the secret code hidden in this document.';

  console.log('Query:', query);
  console.log('---');

  try {
    const result = await rlm.completion(query, context);

    console.log('---');
    console.log('Response:', result.response);
    console.log('---');
    console.log('Stats:');
    console.log('  Total tokens:', result.usage.totalTokens);
    console.log('  Total LLM calls:', result.usage.totalCalls);
    console.log('  Estimated cost: $', result.usage.estimatedCost.toFixed(4));
    console.log('  Execution time:', result.executionTime, 'ms');
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Generate a long context with hidden information.
 */
function generateLongContext(): string {
  const paragraphs: string[] = [];

  // Add many filler paragraphs
  for (let i = 0; i < 100; i++) {
    paragraphs.push(generateFillerParagraph(i));
  }

  // Insert the "needle" somewhere in the middle
  const needlePosition = Math.floor(paragraphs.length / 2);
  paragraphs.splice(
    needlePosition,
    0,
    '\n[IMPORTANT] The secret code is: ALPHA-BRAVO-7749\n'
  );

  return paragraphs.join('\n\n');
}

/**
 * Generate a filler paragraph.
 */
function generateFillerParagraph(index: number): string {
  const topics = [
    'The weather today was particularly pleasant, with clear skies and a gentle breeze.',
    'Technology continues to advance at an unprecedented pace, reshaping industries.',
    'The local community gathered for the annual festival, celebrating cultural traditions.',
    'Scientists have discovered new insights into the behavior of migratory birds.',
    'The economy showed signs of recovery, with employment numbers improving.',
    'Artists from around the world showcased their work at the international exhibition.',
    'Environmental conservation efforts have led to positive outcomes for wildlife.',
    'Education reforms are being implemented to better prepare students for the future.',
    'Healthcare innovations promise to improve treatment outcomes for patients.',
    'Urban planning initiatives aim to create more sustainable and livable cities.',
  ];

  const topic = topics[index % topics.length];
  return `Paragraph ${index + 1}: ${topic} Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`;
}

main().catch(console.error);
