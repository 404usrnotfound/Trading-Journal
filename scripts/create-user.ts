import { parseArgs } from 'node:util';
import { bootstrapOwner } from '@journal/server';
import { loadEnvironment, reportToolFailure } from './environment.js';

loadEnvironment();
const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });

async function readPassword(): Promise<string> {
  const supplied = process.env.BOOTSTRAP_PASSWORD;
  delete process.env.BOOTSTRAP_PASSWORD;
  if (supplied) return supplied;
  if (!process.stdin.isTTY)
    throw new Error('Provide BOOTSTRAP_PASSWORD through a secure environment binding.');
  process.stdout.write('Password (12–128 characters; input hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let password = '';
    function finish() {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function onData(chunk: string) {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolve(password);
          return;
        }
        if (character === '\u007f' || character === '\b') password = password.slice(0, -1);
        else if (character >= ' ') password += character;
      }
    }
    process.stdin.on('data', onData);
  });
}

try {
  if (!values.email || !values.name) throw new Error('Use --email and --name.');
  await bootstrapOwner({ email: values.email, name: values.name, password: await readPassword() });
  console.log('Created owner and empty personal workspace. Public signup remains disabled.');
} catch (error) {
  reportToolFailure('Owner bootstrap', error);
}
