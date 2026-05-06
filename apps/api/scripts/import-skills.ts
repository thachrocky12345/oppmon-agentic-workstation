/**
 * Import Skills from .claude/skills Directory
 *
 * This script reads all SKILL.md files from the .claude/skills directory
 * and imports them into the database via the skills API.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx scripts/import-skills.ts
 *
 * Or with authentication:
 *   npx tsx scripts/import-skills.ts --email admin@example.com --password yourpassword
 */

import { readdir, readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const API_BASE = process.env.API_URL || 'http://localhost:3001';
const SKILLS_DIR = resolve(__dirname, '../../../.claude/skills');

// Parse command line arguments
function parseArgs(): { email?: string; password?: string } {
  const args = process.argv.slice(2);
  const result: { email?: string; password?: string } = {};

  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--email') result.email = args[i + 1];
    if (args[i] === '--password') result.password = args[i + 1];
  }

  return result;
}

// Parse YAML frontmatter from markdown
function parseFrontmatter(content: string): { name: string; description?: string; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

  if (!frontmatterMatch) {
    // No frontmatter, use first heading as name
    const headingMatch = content.match(/^#\s+(.+)$/m);
    return {
      name: headingMatch ? headingMatch[1] : 'Untitled Skill',
      body: content,
    };
  }

  const frontmatter = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length);

  // Parse YAML manually (simple key: value pairs)
  const lines = frontmatter.split('\n');
  let name = '';
  let description = '';

  for (const line of lines) {
    const match = line.match(/^(\w+[-\w]*):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'name') name = value.trim();
      if (key === 'description') description = value.trim();
    }
  }

  return { name: name || 'Untitled', description: description || undefined, body };
}

// Authenticate and get JWT token
async function authenticate(email: string, password: string): Promise<string> {
  console.log(`Authenticating as ${email}...`);

  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Authentication failed: ${error}`);
  }

  const data = await response.json();

  // Token might be in response body or cookie
  if (data.token) return data.token;

  // Check for Set-Cookie header
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const tokenMatch = setCookie.match(/token=([^;]+)/);
    if (tokenMatch) return tokenMatch[1];
  }

  throw new Error('No token in response');
}

// Create a skill via API
async function createSkill(
  token: string,
  skill: { name: string; description?: string; content: string }
): Promise<{ id: string; name: string } | null> {
  const response = await fetch(`${API_BASE}/api/skills`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`,
    },
    body: JSON.stringify({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      scope: 'TENANT', // All imported skills are tenant-wide
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    console.error(`  Failed to create skill "${skill.name}": ${error.error?.message || error.message || 'Unknown error'}`);
    return null;
  }

  const data = await response.json();
  return data.data;
}

// Main import function
async function importSkills() {
  console.log('='.repeat(60));
  console.log('Skills Import Tool');
  console.log('='.repeat(60));
  console.log(`Skills directory: ${SKILLS_DIR}`);
  console.log(`API base: ${API_BASE}`);
  console.log();

  // Get auth credentials
  const args = parseArgs();
  const email = args.email || process.env.ADMIN_EMAIL || 'admin@arkon.local';
  const password = args.password || process.env.ADMIN_PASSWORD || 'admin123';

  // Authenticate
  let token: string;
  try {
    token = await authenticate(email, password);
    console.log('Authentication successful!');
    console.log();
  } catch (err) {
    console.error('Authentication failed:', (err as Error).message);
    console.log();
    console.log('Usage:');
    console.log('  npx tsx scripts/import-skills.ts --email admin@example.com --password yourpassword');
    console.log();
    console.log('Or set environment variables:');
    console.log('  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npx tsx scripts/import-skills.ts');
    process.exit(1);
  }

  // Find all skill directories
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter(e => e.isDirectory());

  console.log(`Found ${skillDirs.length} skill directories`);
  console.log();

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const dir of skillDirs) {
    const skillPath = join(SKILLS_DIR, dir.name, 'SKILL.md');

    try {
      const content = await readFile(skillPath, 'utf-8');
      const { name, description, body } = parseFrontmatter(content);

      // Use directory name as skill name if not specified
      const skillName = name || dir.name;

      console.log(`Importing: ${skillName}`);

      const result = await createSkill(token, {
        name: skillName,
        description,
        content,
      });

      if (result) {
        console.log(`  Created: ${result.id}`);
        imported++;
      } else {
        failed++;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`Skipping: ${dir.name} (no SKILL.md)`);
        skipped++;
      } else {
        console.error(`Error processing ${dir.name}:`, (err as Error).message);
        failed++;
      }
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Import Summary');
  console.log('='.repeat(60));
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Total:    ${skillDirs.length}`);
}

// Run
importSkills().catch(console.error);
