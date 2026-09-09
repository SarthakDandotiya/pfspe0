#!/usr/bin/env node
/**
 * Verifies the built output before it can be deployed.
 *
 * A wrong Vite base path is the single most common cause of a blank GitHub
 * Pages deploy: every asset 404s and the page renders nothing, while the build
 * itself "succeeds". This catches that, plus a broken CSP hash — which would
 * silently disable the pre-paint theme script in production only.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const BASE_PATH = '/pfspe0/';
const DIST_HTML = 'dist/index.html';
const failures = [];

if (!existsSync(DIST_HTML)) {
  console.error(`Missing ${DIST_HTML} — run "npm run build" first.`);
  process.exit(1);
}
const html = readFileSync(DIST_HTML, 'utf8');

const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((href) => href.startsWith('/'));
if (assetRefs.length === 0) failures.push('No absolute asset references found in dist/index.html.');
for (const href of assetRefs) {
  if (!href.startsWith(BASE_PATH)) {
    failures.push(`Asset "${href}" does not start with the Pages base path "${BASE_PATH}".`);
  }
}

const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!cspMatch) {
  failures.push('No Content-Security-Policy meta tag in the built HTML.');
} else {
  const csp = cspMatch[1];
  // Parse into directives so a check on script-src cannot be satisfied (or
  // tripped) by a value belonging to style-src.
  const directives = new Map(
    csp.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  for (const [name, expected] of [
    ['default-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['connect-src', "'self'"],
  ]) {
    if (!directives.get(name)?.includes(expected)) {
      failures.push(`CSP is missing "${name} ${expected}".`);
    }
  }
  // These are ignored in a meta-delivered CSP and only produce console errors.
  for (const invalid of ['frame-ancestors', 'report-uri', 'sandbox']) {
    if (directives.has(invalid)) {
      failures.push(`CSP directive "${invalid}" is ignored in <meta>; remove it.`);
    }
  }
  const scriptSrc = directives.get('script-src') ?? [];
  if (scriptSrc.includes("'unsafe-inline'") || scriptSrc.includes("'unsafe-eval'")) {
    failures.push("script-src allows unsafe-inline/unsafe-eval — inline scripts must be hashed.");
  }
  // Every inline script must be hashed into the CSP, or it silently stops
  // running in production and the theme flashes.
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, body] of inline) {
    const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
    if (!scriptSrc.includes(hash)) {
      failures.push(`An inline script is not hashed into the CSP (expected ${hash}).`);
    }
  }
  if (inline.length === 0) failures.push('The pre-paint theme script is missing from the build.');
}

if (failures.length > 0) {
  console.error('Build verification failed:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`Build verified: base path ${BASE_PATH}, CSP present, inline scripts hashed.`);
