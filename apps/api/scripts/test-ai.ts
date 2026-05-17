// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * AI Model & Skills Test Script
 *
 * Tests:
 * 1. LLM chat endpoint with Cerebras model
 * 2. Skills listing
 * 3. RAG query with skills context
 *
 * Usage:
 *   pnpm --filter @arkon/api test:ai
 *
 * Or with credentials:
 *   npx tsx scripts/test-ai.ts --email admin@example.com --password yourpassword
 */

import { config } from 'dotenv';
config();

const API_BASE = process.env.API_URL || 'http://localhost:3001';

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

// Authenticate and get JWT token
async function authenticate(email: string, password: string): Promise<string> {
  console.log(`\nAuthenticating as ${email}...`);

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
  if (data.token) return data.token;

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const tokenMatch = setCookie.match(/token=([^;]+)/);
    if (tokenMatch) return tokenMatch[1];
  }

  throw new Error('No token in response');
}

// Test LLM providers
async function testProviders(token: string): Promise<void> {
  console.log('\n--- Testing LLM Providers ---');

  const response = await fetch(`${API_BASE}/api/llm/providers`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`,
    },
  });

  if (!response.ok) {
    console.log('  FAILED:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  console.log('  Available providers:');
  for (const provider of data.data) {
    const status = provider.available ? '✓' : '✗';
    const defaultMark = provider.isDefault ? ' (default)' : '';
    console.log(`    ${status} ${provider.name}${defaultMark}`);
  }
}

// Test LLM chat
async function testChat(token: string, provider?: string): Promise<void> {
  console.log(`\n--- Testing LLM Chat${provider ? ` (${provider})` : ''} ---`);

  const body: Record<string, unknown> = {
    messages: [
      { role: 'user', content: 'Hello! Please respond with a brief greeting.' }
    ],
    maxTokens: 100,
  };

  if (provider) {
    body.provider = provider;
  }

  const startTime = Date.now();
  const response = await fetch(`${API_BASE}/api/llm/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`,
    },
    body: JSON.stringify(body),
  });

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const error = await response.json().catch(() => response.text());
    console.log('  FAILED:', response.status);
    console.log('  Error:', JSON.stringify(error, null, 2));
    return;
  }

  const data = await response.json();
  console.log('  SUCCESS!');
  console.log(`  Provider: ${data.data.provider}`);
  console.log(`  Model: ${data.data.model}`);
  console.log(`  Latency: ${latencyMs}ms`);
  console.log(`  Usage: ${data.data.usage.inputTokens} in / ${data.data.usage.outputTokens} out`);
  console.log(`  Response: "${data.data.content.slice(0, 100)}${data.data.content.length > 100 ? '...' : ''}"`);
}

// Test skills listing
async function testSkills(token: string): Promise<void> {
  console.log('\n--- Testing Skills ---');

  const response = await fetch(`${API_BASE}/api/skills?limit=5`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`,
    },
  });

  if (!response.ok) {
    console.log('  FAILED:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  console.log(`  Total skills: ${data.meta.total}`);
  console.log('  Sample skills:');
  for (const skill of data.data.slice(0, 5)) {
    const status = skill.enabled ? '✓' : '✗';
    console.log(`    ${status} ${skill.name} (v${skill.version})`);
  }
}

// Test RAG query
async function testRAG(token: string): Promise<void> {
  console.log('\n--- Testing RAG Query ---');

  const response = await fetch(`${API_BASE}/api/rag/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`,
    },
    body: JSON.stringify({
      query: 'How do I run security code review?',
      topK: 3,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => response.text());
    console.log('  FAILED:', response.status);
    console.log('  Error:', typeof error === 'string' ? error : JSON.stringify(error, null, 2));
    return;
  }

  const data = await response.json();
  console.log('  SUCCESS!');
  console.log(`  Answer: "${data.data.answer?.slice(0, 200)}..."`);
  console.log(`  Sources: ${data.data.sources?.length || 0}`);
}

// Test Model Registry
async function testModels(token: string): Promise<void> {
  console.log('\n--- Testing Model Registry ---');

  const response = await fetch(`${API_BASE}/api/models`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Cookie': `token=${token}`,
    },
  });

  if (!response.ok) {
    console.log('  FAILED:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  console.log(`  Total models: ${data.meta.total}`);
  console.log('  Configured models:');
  for (const model of data.data) {
    const status = model.enabled ? '✓' : '✗';
    console.log(`    ${status} ${model.displayName} (${model.providerTemplateId || 'custom'})`);
  }
}

// Main
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Arkon AI Test Suite');
  console.log('='.repeat(60));
  console.log(`API: ${API_BASE}`);

  const args = parseArgs();
  const email = args.email || process.env.ADMIN_EMAIL || 'admin@arkon.local';
  const password = args.password || process.env.ADMIN_PASSWORD || 'admin123';

  let token: string;
  try {
    token = await authenticate(email, password);
    console.log('  Authentication: SUCCESS');
  } catch (err) {
    console.error('  Authentication: FAILED');
    console.error('  ', (err as Error).message);
    console.log('\nUsage:');
    console.log('  npx tsx scripts/test-ai.ts --email YOUR_EMAIL --password YOUR_PASSWORD');
    process.exit(1);
  }

  // Run tests
  await testProviders(token);
  await testModels(token);
  await testSkills(token);

  // Test chat with default provider
  await testChat(token);

  // Test chat with Cerebras specifically
  await testChat(token, 'cerebras');

  // Test RAG
  await testRAG(token);

  console.log('\n' + '='.repeat(60));
  console.log('Test suite complete!');
  console.log('='.repeat(60));
}

main().catch(console.error);
