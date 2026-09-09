import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/** Repo is served from https://<user>.github.io/pfspe0/ — see TECHNICAL_SPEC §10.2. */
export const BASE_PATH = '/pfspe0/';

/**
 * Injects a strict CSP into the built index.html, hashing any inline <script>
 * so the no-FOUC theme script is allowed without 'unsafe-inline'.
 *
 * Build-only on purpose: Vite's dev server injects its own inline scripts for
 * HMR, and a strict CSP in dev would block them.
 */
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          // Vite emits a stylesheet link, but React/Tailwind may set style attrs.
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          // No backend, no third parties: nothing may be contacted at all.
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
          // NOTE: frame-ancestors is deliberately absent. It is ignored when
          // delivered via <meta> (browsers log an error), and GitHub Pages
          // cannot set HTTP headers. Clickjacking protection is therefore not
          // available on this host; acceptable here because the app has no
          // accounts, no credentials and no state-changing actions an attacker
          // could induce. Revisit if the app is ever served from a host that
          // can set headers.
        ].join('; ');
        return html.replace(
          '</title>',
          `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: { target: 'es2022', sourcemap: true },
});
