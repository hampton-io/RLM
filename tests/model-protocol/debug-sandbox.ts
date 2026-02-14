/**
 * Debug sandbox FINAL() capture
 */
import { createSandbox } from '../../src/sandbox/index.js';

async function test() {
  const sandbox = await createSandbox('vm', { context: '' });
  
  // Execute code similar to what gpt-5.2 generates
  const code = `
const result = 2 + 2;
print('Computed:', result);
FINAL(String(result));
`;
  
  console.log('Executing code:');
  console.log(code);
  console.log('---');
  
  const output = await sandbox.execute(code);
  console.log('Sandbox output:', output);
  console.log('__FINAL_ANSWER__:', sandbox.getVariable('__FINAL_ANSWER__'));
  console.log('All variables:', JSON.stringify(sandbox.getAllVariables?.() ?? 'N/A'));
}

test().catch(console.error);
