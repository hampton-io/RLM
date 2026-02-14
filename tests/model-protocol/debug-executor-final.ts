/**
 * Debug script to trace executor FINAL handling
 */
import { RLMExecutor } from '../../src/executor.js';

async function main() {
  const executor = new RLMExecutor({
    model: 'gpt-5.2',
    maxIterations: 1,
    verbose: true,
  });

  console.log('Tracing executor FINAL handling...\n');
  
  // Monkey patch to add debugging
  const originalExecute = executor.execute.bind(executor);
  
  // Store the sandbox reference when it's created
  let sandbox: any;
  const originalCreateSandbox = (executor as any).createSandboxWithCallbacks.bind(executor);
  (executor as any).createSandboxWithCallbacks = async function(context: string, depth: number) {
    sandbox = await originalCreateSandbox(context, depth);
    return sandbox;
  };
  
  const result = await executor.execute('What is 2+2?', '');
  
  console.log('\n--- FINAL RESULT ---');
  console.log('Answer:', JSON.stringify(result.response));
  console.log('Sandbox __FINAL_ANSWER__:', sandbox?.getVariable('__FINAL_ANSWER__'));
  console.log('Sandbox __FINAL_VAR_NAME__:', sandbox?.getVariable('__FINAL_VAR_NAME__'));
  console.log('All sandbox vars:', JSON.stringify((sandbox as any)?.variables ?? {}, null, 2));
}

main().catch(console.error);