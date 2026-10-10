import { parseArgs } from 'node:util';
import { bootstrapOwner, recoverOwnerPassword } from '@journal/server';
import { loadEnvironment, reportToolFailure } from './environment.js';

loadEnvironment();
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    'reset-password': { type: 'boolean', default: false },
  },
});

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
  if (!values.email || (!values['reset-password'] && !values.name))
    throw new Error('Use --email and --name, or --email and --reset-password.');
  const password = await readPassword();
  if (values['reset-password']) {
    await recoverOwnerPassword({ email: values.email, password });
    console.log('Password recovered. All prior sessions were revoked.');
  } else {
    await bootstrapOwner({ email: values.email, name: values.name!, password });
    console.log(
      'Owner and personal workspace are ready. Existing credentials are preserved; public signup remains disabled.',
    );
  }
} catch (error) {
  reportToolFailure('Owner bootstrap', error);
}
