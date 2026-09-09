#!/usr/bin/env node
/**
 * The engine must stay pure: no DOM, no browser globals, no I/O.
 * ESLint covers imports (eslint.config.js); this covers bare global access,
 * which lint cannot see. Together they keep src/engine unit-testable to 100%
 * and eligible for mutation testing. (TECHNICAL_SPEC §9.8)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = 'src/engine';
const FORBIDDEN = [
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'indexedDB',
  'Math.random', // seeded PRNG only — reproducibility depends on it (PRD §26)
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(ENGINE_DIR);
} catch {
  console.log(`No ${ENGINE_DIR} directory yet — nothing to check.`);
  process.exit(0);
}

const violations = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  source.split('\n').forEach((line, index) => {
    // Ignore comments: prose may legitimately mention these names.
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const name of FORBIDDEN) {
      const pattern = new RegExp(`(^|[^.\\w])${name.replace('.', '\\.')}\\b`);
      if (pattern.test(code)) {
        violations.push(`${file}:${index + 1}  uses "${name}"`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Engine purity violations — src/engine must stay framework-free:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log(`Engine purity OK (${files.length} file(s) checked).`);
