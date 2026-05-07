#!/usr/bin/env node
/**
 * create-oppmon — bootstraps a new OppMon AI Gateway workstation.
 *
 * Usage:
 *   npx create-oppmon [target-dir] [--branch <ref>] [--no-install] [--no-docker]
 *
 * What it does:
 *   1. git clone --depth 1 the OppMon monorepo into <target-dir>
 *   2. detach .git so the user owns the new project's history
 *   3. copy .env.example -> .env for root + apps/api + apps/web
 *   4. (optional) run pnpm install
 *   5. (optional) start the dev database via docker compose
 *   6. print next steps
 *
 * Stays Node-builtin only so `npx create-oppmon` has zero install cost.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const REPO_URL = 'https://github.com/thachrocky12345/oppmon-agentic-workstation.git';
const DEFAULT_TARGET = 'oppmon-app';
// `dev` is the canonical working branch; `main` is currently behind. Switch
// to undefined (= main) once dev is merged forward.
const DEFAULT_BRANCH = 'dev';

// ---------- tiny ANSI helpers (no chalk dep — keeps install fast) ----------
const ansi = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

function log(msg) { console.log(msg); }
function step(msg) { console.log(`\n${ansi.cyan('▸')} ${msg}`); }
function ok(msg) { console.log(`  ${ansi.green('✔')} ${msg}`); }
function warn(msg) { console.log(`  ${ansi.yellow('!')} ${msg}`); }
function fail(msg) {
  console.error(`\n${ansi.red('✖')} ${msg}`);
  process.exit(1);
}

// ---------- arg parsing (no commander dep) ----------
function parseArgs(argv) {
  const args = { target: undefined, branch: DEFAULT_BRANCH, install: true, docker: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--no-install') args.install = false;
    else if (a === '--no-docker') args.docker = false;
    else if (a === '--branch') args.branch = argv[++i];
    else if (a.startsWith('--branch=')) args.branch = a.slice('--branch='.length);
    else if (!a.startsWith('-') && !args.target) args.target = a;
    else fail(`Unknown argument: ${a}`);
  }
  return args;
}

function printHelp() {
  log(`
${ansi.bold('create-oppmon')} — bootstrap a new OppMon AI Gateway workstation

${ansi.bold('Usage:')}
  npx create-oppmon [target-dir] [options]

${ansi.bold('Arguments:')}
  target-dir          Directory to create (default: ${DEFAULT_TARGET})

${ansi.bold('Options:')}
  --branch <ref>      Clone a specific branch/tag (default: dev)
  --no-install        Skip pnpm install
  --no-docker         Skip starting the dev database
  -h, --help          Show this help

${ansi.bold('Examples:')}
  npx create-oppmon
  npx create-oppmon my-gateway
  npx create-oppmon my-gateway --branch dev
  npx create-oppmon my-gateway --no-install --no-docker
`);
}

// ---------- preflight ----------
function which(cmd) {
  try {
    const out = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.status === 0 ? out.stdout.toString().trim().split('\n')[0] : null;
  } catch { return null; }
}

function preflight() {
  const git = which('git');
  if (!git) fail('git is required. Install git and try again: https://git-scm.com/downloads');
  const node = process.version;
  const major = parseInt(node.replace(/^v/, '').split('.')[0], 10);
  if (major < 18) fail(`Node 18+ required, you're on ${node}.`);
  return { git };
}

// ---------- main steps ----------
function ensureEmpty(targetAbs) {
  if (existsSync(targetAbs)) {
    const stat = statSync(targetAbs);
    if (!stat.isDirectory()) fail(`${targetAbs} exists and is not a directory.`);
    if (readdirSync(targetAbs).length > 0) {
      fail(`${targetAbs} is not empty. Pick a different target directory.`);
    }
  } else {
    mkdirSync(targetAbs, { recursive: true });
  }
}

function clone(targetAbs, branch) {
  step(`Cloning ${REPO_URL} → ${targetAbs}${branch ? ` (branch: ${branch})` : ''}`);
  const args = ['clone', '--depth', '1'];
  if (branch) args.push('--branch', branch);
  args.push(REPO_URL, targetAbs);
  const result = spawnSync('git', args, { stdio: 'inherit' });
  if (result.status !== 0) fail('git clone failed.');
  // Detach .git so the user owns history from scratch.
  rmSync(path.join(targetAbs, '.git'), { recursive: true, force: true });
  ok('Source cloned and history detached.');
}

function copyIfMissing(srcAbs, destAbs) {
  if (!existsSync(srcAbs)) return false;
  if (existsSync(destAbs)) {
    warn(`${path.relative(process.cwd(), destAbs)} already exists — left untouched.`);
    return false;
  }
  copyFileSync(srcAbs, destAbs);
  return true;
}

function setupEnvFiles(targetAbs) {
  step('Copying .env.example → .env');
  const pairs = [
    ['.env.example', '.env'],
    ['apps/api/.env.example', 'apps/api/.env'],
    ['apps/web/.env.example', 'apps/web/.env'],
  ];
  let copied = 0;
  for (const [src, dest] of pairs) {
    const srcAbs = path.join(targetAbs, src);
    const destAbs = path.join(targetAbs, dest);
    if (copyIfMissing(srcAbs, destAbs)) {
      ok(`${dest}`);
      copied++;
    }
  }
  if (copied === 0) warn('No .env files were copied (templates missing or destinations existed).');
}

function detectPackageManager() {
  // Prefer pnpm (the workspace requires it). Fall back to npm with a warning
  // — the user will need pnpm to run dev scripts but install can succeed.
  return which('pnpm') ? 'pnpm' : (which('npm') ? 'npm' : null);
}

function installDeps(targetAbs) {
  step('Installing dependencies');
  const pm = detectPackageManager();
  if (!pm) {
    warn('Neither pnpm nor npm found on PATH. Skipping install.');
    return;
  }
  if (pm === 'npm') {
    warn('pnpm not found; using npm. The workspace may not resolve correctly — install pnpm with `npm i -g pnpm` and re-run install.');
  }
  const result = spawnSync(pm, ['install'], { cwd: targetAbs, stdio: 'inherit' });
  if (result.status !== 0) {
    warn(`${pm} install exited with ${result.status}. You can re-run it manually.`);
    return;
  }
  ok(`${pm} install complete.`);
}

function startDocker(targetAbs) {
  step('Starting dev database (postgres)');
  const docker = which('docker');
  if (!docker) {
    warn('docker not found on PATH. Skipping. Install Docker Desktop, then run `docker compose up -d db`.');
    return;
  }
  // `docker compose` (v2 plugin) is preferred over `docker-compose`.
  const result = spawnSync('docker', ['compose', 'up', '-d', 'db'], { cwd: targetAbs, stdio: 'inherit' });
  if (result.status !== 0) {
    warn('docker compose failed. Check Docker Desktop is running, then `docker compose up -d db`.');
    return;
  }
  ok('Postgres + pgvector is up.');
}

async function maybePromptForKeys(targetAbs) {
  step('Optional: paste your API keys (press Enter to skip any of them)');
  const rl = readline.createInterface({ input, output });
  try {
    const anthropic = (await rl.question('  ANTHROPIC_API_KEY: ')).trim();
    const openai = (await rl.question('  OPENAI_API_KEY:    ')).trim();
    if (!anthropic && !openai) {
      warn('No keys entered. Edit apps/api/.env later to add them.');
      return;
    }
    const envPath = path.join(targetAbs, 'apps/api/.env');
    if (!existsSync(envPath)) {
      warn(`${envPath} not found — keys not written.`);
      return;
    }
    const fs = await import('node:fs');
    let content = fs.readFileSync(envPath, 'utf8');
    if (anthropic) content = upsertEnv(content, 'ANTHROPIC_API_KEY', anthropic);
    if (openai) content = upsertEnv(content, 'OPENAI_API_KEY', openai);
    fs.writeFileSync(envPath, content);
    ok('Keys written to apps/api/.env');
  } finally {
    rl.close();
  }
}

function upsertEnv(content, key, value) {
  // Replace existing line or append. Quote value if it contains spaces.
  const needsQuotes = /\s/.test(value);
  const lineValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
  const line = `${key}=${lineValue}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, line) : content.trimEnd() + `\n${line}\n`;
}

function nextSteps(target, didDocker) {
  log(`\n${ansi.green(ansi.bold('✓ Done!'))} Project created at ${ansi.cyan(target)}\n`);
  log(`${ansi.bold('Next steps:')}`);
  log(`  cd ${target}`);
  if (!didDocker) log('  docker compose up -d db          # start postgres');
  log('  pnpm db:push                     # push schema to the dev DB');
  log('  pnpm db:seed                     # seed sample data');
  log('  pnpm dev                         # run api + web in dev mode');
  log('');
  log(`${ansi.dim('  Docs: https://github.com/thachrocky12345/oppmon-agentic-workstation#readme')}`);
}

// ---------- entry ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  preflight();

  const target = args.target || DEFAULT_TARGET;
  const targetAbs = path.resolve(process.cwd(), target);

  log(`\n${ansi.bold('create-oppmon')} → ${ansi.cyan(target)}`);
  ensureEmpty(targetAbs);
  clone(targetAbs, args.branch);
  setupEnvFiles(targetAbs);
  if (process.stdin.isTTY) await maybePromptForKeys(targetAbs);
  if (args.install) installDeps(targetAbs);
  if (args.docker) startDocker(targetAbs);
  nextSteps(target, args.docker);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
