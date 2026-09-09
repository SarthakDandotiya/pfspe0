#!/usr/bin/env node
/** Performance budgets from TECHNICAL_SPEC §12, enforced in CI. */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGETS = { jsGzipKb: 180, totalGzipKb: 300 };
const ASSETS = 'dist/assets';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(ASSETS).filter((f) => !f.endsWith('.map'));
let jsBytes = 0;
let totalBytes = 0;
for (const file of files) {
  const gz = gzipSync(readFileSync(file)).length;
  totalBytes += gz;
  if (file.endsWith('.js')) jsBytes += gz;
}

const jsKb = jsBytes / 1024;
const totalKb = totalBytes / 1024;
const failures = [];
if (jsKb > BUDGETS.jsGzipKb) failures.push(`JS ${jsKb.toFixed(1)} KB > ${BUDGETS.jsGzipKb} KB`);
if (totalKb > BUDGETS.totalGzipKb) {
  failures.push(`Total ${totalKb.toFixed(1)} KB > ${BUDGETS.totalGzipKb} KB`);
}

console.log(`Bundle (gzipped): JS ${jsKb.toFixed(1)} KB, total ${totalKb.toFixed(1)} KB`);
if (failures.length > 0) {
  console.error('\nBudget exceeded:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
