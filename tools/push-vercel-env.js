'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const skip = new Set(['VERCEL_OIDC_TOKEN']);
const envs = ['production', 'preview', 'development'];
const file = path.join(__dirname, '..', '.env.local');

for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m || skip.has(m[1])) continue;
  const name = m[1];
  const val = m[2];
  for (const env of envs) {
    process.stdout.write(`Adding ${name} -> ${env} ... `);
    try {
      execSync(`vercel env add ${name} ${env} --force`, { input: val, stdio: ['pipe', 'pipe', 'inherit'] });
      console.log('ok');
    } catch {
      console.log('failed');
    }
  }
}

execSync('vercel env ls', { stdio: 'inherit' });
