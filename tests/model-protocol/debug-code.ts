/**
 * Debug script to see generated code
 */
import { createClient } from '../../src/clients/index.js';
import { getSystemPrompt, createUserPrompt } from '../../src/prompts/index.js';
import { parseLLMOutput } from '../../src/utils/parser.js';

async function main() {
  const client = createClient('gpt-5.2');
  const messages = [
    { role: 'system' as const, content: getSystemPrompt() },
    { role: 'user' as const, content: createUserPrompt('What is 2+2?', 0) },
  ];

  console.log('Capturing raw output and parsed code...\n');
  
  for (let i = 0; i < 3; i++) {
    console.log(`=== Attempt ${i + 1} ===`);
    const result = await client.completion(messages, { temperature: 0 });
    
    console.log('Raw output:');
    console.log(result.content);
    console.log('');
    
    const parsed = parseLLMOutput(result.content);
    console.log('Parsed code:');
    console.log(parsed.code);
    console.log('');
    
    console.log('Parsed final:');
    console.log(JSON.stringify(parsed.final));
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

main().catch(console.error);
