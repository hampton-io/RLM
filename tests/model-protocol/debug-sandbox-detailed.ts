/**
 * Debug executor sandbox variable access
 */
import { RLMExecutor } from '../../src/executor.js';

async function main() {
  const executor = new RLMExecutor({
    model: 'gpt-5.2',
    maxIterations: 1,
    verbose: true,
  });

  console.log('Debugging sandbox variable access...\n');
  
  let sandbox: any;
  let sandboxOutput: any;
  
  // Monkey patch to capture sandbox details
  const originalCreateSandbox = (executor as any).createSandboxWithCallbacks.bind(executor);
  (executor as any).createSandboxWithCallbacks = async function(context: string, depth: number) {
    sandbox = await originalCreateSandbox(context, depth);
    
    // Monkey patch sandbox.execute to capture details
    const originalExecute = sandbox.execute.bind(sandbox);
    sandbox.execute = function(code: string) {
      console.log('\n--- CODE BEING EXECUTED ---');
      console.log(code);
      console.log('--- END CODE ---\n');
      
      return originalExecute(code).then((result: any) => {
        sandboxOutput = result;
        console.log('Sandbox execution result:');
        console.log(JSON.stringify(result, null, 2));
        console.log('');
        return result;
      });
    };
    
    return sandbox;
  };
  
  const result = await executor.execute('What is 2+2?', '');
  
  console.log('\n--- EXECUTOR RESULT ---');
  console.log('Answer:', JSON.stringify(result.answer));
  
  console.log('\n--- SANDBOX DETAILS ---');
  console.log('Sandbox output variables:', JSON.stringify(sandboxOutput?.variables ?? {}, null, 2));
  console.log('Sandbox getVariable("__FINAL_ANSWER__"):', sandbox?.getVariable('__FINAL_ANSWER__'));
  console.log('Sandbox getVariable("__FINAL_VAR_NAME__"):', sandbox?.getVariable('__FINAL_VAR_NAME__'));
}

main().catch(console.error);