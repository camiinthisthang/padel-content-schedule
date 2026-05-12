#!/usr/bin/env node
/**
 * Build step for the static deploy.
 *
 * Copies everything in /public to /dist, then replaces the
 * __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ placeholders in dist/index.html with
 * real values so the deployed site can talk to Supabase. The source files in
 * /public are never modified, so the repo always keeps the placeholders.
 *
 * Values are read from (in priority order):
 *   1. process.env  — how Vercel passes the env vars you set in the project
 *      dashboard (Settings → Environment Variables).
 *   2. a local `.env` file in this folder — handy for running `node build.js`
 *      yourself.
 *
 * If neither provides values, the placeholders are blanked out and the app runs
 * in localStorage-only mode — nothing breaks, it just won't sync.
 */
const fs = require('fs');
const path = require('path');

// 1. Load .env (local dev only). On Vercel the env vars are already in process.env.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();

// 2. public -> dist
const srcDir = path.join(__dirname, 'public');
const outDir = path.join(__dirname, 'dist');
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(srcDir, outDir, { recursive: true });

// 3. inject credentials into dist/index.html
const htmlPath = path.join(outDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html
  .split('__SUPABASE_URL__').join(SUPABASE_URL)
  .split('__SUPABASE_ANON_KEY__').join(SUPABASE_ANON_KEY);
fs.writeFileSync(htmlPath, html);

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  console.log('✓ Built dist/ with Supabase credentials (' + SUPABASE_URL + ') — cloud sync enabled');
} else {
  console.log('⚠ Built dist/ — SUPABASE_URL / SUPABASE_ANON_KEY not set, running in localStorage-only mode');
}
