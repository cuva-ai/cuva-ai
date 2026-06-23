#!/usr/bin/env node
/* Reset local SQLite and apply fresh early-stage seed data. */
'use strict';
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'server', 'cuva.db');
for (const f of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

delete require.cache[require.resolve('../server/sqlite-db')];
const { reseed } = require('../server/sqlite-db');
reseed();
console.log('Local database reseeded with early-stage CUVA data.');
