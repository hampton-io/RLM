/**
 * Debug script to trace code execution and FINAL handling
 */
import { RLMExecutor } from '../../src/executor.js';

async function main() {
  const executor = new RLMExecutor({
    model: 'gpt-5.2',
    maxIterations: 1,
    verbose: true,
  });

  console.log('Testing gpt-5.2 execution flow...\n');
  
  for (let i = 0; i < 3; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Attempt ${i + 1} ===`);
    console.log('='.repeat(60));
    
    const result = await executor.execute('What is 2+2?', '');
    
    console.log('\n--- FINAL RESULT ---');
    console.log('Answer:', JSON.stringify(result.answer));
    console.log('Iterations:', result.iterations);
    console.log('');
  }
}

main().catch(console.error);
