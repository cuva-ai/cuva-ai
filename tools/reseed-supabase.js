#!/usr/bin/env node
/* Reset Supabase and apply fresh early-stage seed (uses .env.local). */
'use strict';
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

delete require.cache[require.resolve('../server/supabase-db')];
const { reseed } = require('../server/supabase-db');

reseed()
  .then(() => console.log('Supabase reseeded with early-stage CUVA data.'))
  .catch((e) => { console.error(e); process.exit(1); });
