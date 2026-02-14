/**
 * Debug what code is actually executing
 */
import { RLMExecutor } from '../../src/executor.js';

async function main() {
  const executor = new RLMExecutor({
    model: 'gpt-5.2',
    maxIterations: 1,
    verbose: true,
  });

  // Monkey patch to capture the actual code being executed
  const originalExecute = executor.execute.bind(executor);
  
  // Store the sandbox reference when it's created
  let sandbox: any;
  let executedCode: string = '';
  
  const originalCreateSandbox = (executor as any).createSandboxWithCallbacks.bind(executor);
  (executor as any).createSandboxWithCallbacks = async function(context: string, depth: number) {
    sandbox = await originalCreateSandbox(context, depth);
    
    // Monkey patch sandbox.execute to capture the code
    const originalExecute = sandbox.execute.bind(sandbox);
    sandbox.execute = function(code: string) {
      executedCode = code;
      console.log('\n--- CODE BEING EXECUTED ---');
      console.log(code);
      console.log('--- END CODE ---\n');
      return originalExecute(code);
    };
    
    return sandbox;
  };
  
  const result = await executor.execute('What is 2+2?', '');
  
  console.log('\n--- FINAL RESULT ---');
  console.log('Answer:', JSON.stringify(result.response));
  console.log('Executed code was:', executedCode);
}

main().catch(console.error);