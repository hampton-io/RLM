/**
 * Debug script to capture raw LLM output and understand protocol failures
 */
import { createClient } from '../../src/clients/index.js';
import { getSystemPrompt, createUserPrompt } from '../../src/prompts/index.js';

async function main() {
  const client = createClient('gpt-5.2');
  const messages = [
    { role: 'system' as const, content: getSystemPrompt() },
    { role: 'user' as const, content: createUserPrompt('What is 2+2?', 0) },
  ];

  console.log('Testing gpt-5.2 raw output...\n');
  
  for (let i = 0; i < 5; i++) {
    console.log(`=== Attempt ${i + 1} ===`);
    const result = await client.completion(messages, { temperature: 0 });
    console.log('Raw content:');
    console.log('---');
    console.log(result.content);
    console.log('---');
    console.log(`Tokens: ${result.usage.totalTokens}`);
    console.log('');
  }
}

main().catch(console.error);
