#!/usr/bin/env tsx
// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Onboarding Timer Script
 *
 * Measures time taken for each step of the onboarding flow.
 * Target: Complete onboarding in under 5 minutes.
 *
 * Usage:
 *   tsx apps/api/scripts/onboarding-timer.ts
 *
 * Environment:
 *   API_URL - API base URL (default: http://localhost:3001)
 *
 * Note: Some steps are manual and require user interaction.
 */

import * as readline from 'readline';

const API_URL = process.env.API_URL || 'http://localhost:3001';

interface OnboardingStep {
  name: string;
  targetSeconds: number;
  description: string;
  automated: boolean;
  command?: string;
}

interface StepResult {
  step: string;
  targetSeconds: number;
  actualSeconds: number;
  passed: boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    name: 'Signup/Login',
    targetSeconds: 30,
    description: 'Register or login via web UI',
    automated: false,
  },
  {
    name: 'Install CLI',
    targetSeconds: 60,
    description: 'npm install -g @arkon/cli (or pnpm add -g)',
    automated: false,
  },
  {
    name: 'CLI Login',
    targetSeconds: 30,
    description: 'Run: tag login',
    automated: false,
  },
  {
    name: 'Project Init',
    targetSeconds: 60,
    description: 'Run: tag init --yes',
    automated: false,
  },
  {
    name: 'First Sync',
    targetSeconds: 60,
    description: 'Run: tag sync skills pull',
    automated: false,
  },
  {
    name: 'Claude Code Use',
    targetSeconds: 60,
    description: 'Open Claude Code and use a skill',
    automated: false,
  },
];

const TOTAL_TARGET_SECONDS = 300; // 5 minutes

async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function waitForCompletion(step: OnboardingStep): Promise<number> {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📋 Step: ${step.name}`);
  console.log(`   ${step.description}`);
  console.log(`   Target: ${step.targetSeconds}s`);
  console.log('');

  const startTime = Date.now();

  await prompt(`   Press Enter when "${step.name}" is complete...`);

  const elapsedSeconds = (Date.now() - startTime) / 1000;
  return elapsedSeconds;
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(0)}s`;
}

function printReport(results: StepResult[]): void {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 ONBOARDING TIMING REPORT');
  console.log('═'.repeat(60) + '\n');

  const totalActual = results.reduce((sum, r) => sum + r.actualSeconds, 0);
  const totalTarget = results.reduce((sum, r) => sum + r.targetSeconds, 0);

  console.log(`${'Step'.padEnd(20)} ${'Target'.padEnd(10)} ${'Actual'.padEnd(10)} Status`);
  console.log('─'.repeat(55));

  for (const result of results) {
    const status = result.passed ? '✅' : '⚠️';
    const targetStr = `${result.targetSeconds}s`.padEnd(10);
    const actualStr = formatTime(result.actualSeconds).padEnd(10);
    console.log(`${result.step.padEnd(20)} ${targetStr} ${actualStr} ${status}`);
  }

  console.log('─'.repeat(55));
  console.log(`${'TOTAL'.padEnd(20)} ${formatTime(totalTarget).padEnd(10)} ${formatTime(totalActual).padEnd(10)} ${totalActual <= TOTAL_TARGET_SECONDS ? '✅' : '⚠️'}`);
  console.log('');

  // Friction points analysis
  const slowSteps = results.filter(r => !r.passed);
  if (slowSteps.length > 0) {
    console.log('⚠️  FRICTION POINTS (steps exceeding target):');
    for (const step of slowSteps) {
      const overage = step.actualSeconds - step.targetSeconds;
      console.log(`   - ${step.step}: +${formatTime(overage)} over target`);
    }
    console.log('');
  }

  // Overall assessment
  if (totalActual <= TOTAL_TARGET_SECONDS) {
    console.log('✅ RESULT: Onboarding completed within 5-minute target!');
    console.log(`   Total time: ${formatTime(totalActual)}`);
  } else {
    const overage = totalActual - TOTAL_TARGET_SECONDS;
    console.log('⚠️  RESULT: Onboarding exceeded 5-minute target');
    console.log(`   Total time: ${formatTime(totalActual)} (${formatTime(overage)} over)`);
    console.log('');
    console.log('   Recommendations:');
    for (const step of slowSteps) {
      console.log(`   - Optimize "${step.step}" step`);
    }
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}

async function checkApiAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 ARKON ONBOARDING TIMER');
  console.log('═'.repeat(60));
  console.log(`\nAPI: ${API_URL}`);
  console.log(`Target: Complete all steps in under 5 minutes (${TOTAL_TARGET_SECONDS}s)\n`);

  // Check API availability
  const apiAvailable = await checkApiAvailability();
  if (!apiAvailable) {
    console.log('⚠️  Warning: API not reachable. Some steps may fail.\n');
  } else {
    console.log('✅ API is reachable\n');
  }

  console.log('This script will measure time for each onboarding step.');
  console.log('Press Enter after completing each step to record the time.\n');

  await prompt('Press Enter to begin timing...');

  const results: StepResult[] = [];
  const overallStart = Date.now();

  for (const step of ONBOARDING_STEPS) {
    const actualSeconds = await waitForCompletion(step);
    const passed = actualSeconds <= step.targetSeconds;

    results.push({
      step: step.name,
      targetSeconds: step.targetSeconds,
      actualSeconds,
      passed,
    });

    const status = passed ? '✅' : '⚠️';
    console.log(`   ${status} Completed in ${formatTime(actualSeconds)} (target: ${step.targetSeconds}s)`);
  }

  const overallSeconds = (Date.now() - overallStart) / 1000;
  console.log(`\n⏱️  Overall elapsed time: ${formatTime(overallSeconds)}`);

  printReport(results);

  // Exit code based on success
  const totalActual = results.reduce((sum, r) => sum + r.actualSeconds, 0);
  process.exit(totalActual <= TOTAL_TARGET_SECONDS ? 0 : 1);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
