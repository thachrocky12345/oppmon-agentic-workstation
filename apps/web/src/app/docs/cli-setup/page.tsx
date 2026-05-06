'use client'

import { CodeSnippet, TutorialSection, StepList } from '@/components/tutorial'

export default function CLISetupPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">CLI Setup Guide</h1>
        <p className="text-gray-400">
          Complete guide for setting up the OppMon CLI (<code className="text-green-400">tag</code> command)
          for AI Gateway management and Claude Code integration.
        </p>
      </div>

      {/* Prerequisites */}
      <TutorialSection
        id="prerequisites"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Prerequisites"
      >
        <ul className="space-y-2 text-gray-400">
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">Node.js 20+</strong> installed
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">pnpm</strong> package manager
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">PostgreSQL</strong> running (via Docker or local)
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">OppMon API</strong> running on <code className="text-green-400">http://localhost:3001</code>
          </li>
        </ul>
      </TutorialSection>

      {/* Step 1: Build CLI */}
      <TutorialSection
        id="step-1"
        icon={<span className="text-lg font-bold text-green-400">1</span>}
        iconBg="bg-green-500/20"
        title="Build the CLI"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Build the CLI package from source:</p>
          <CodeSnippet
            code={`cd C:\\Users\\thach\\Documents\\workstation\\oppmon-workstation
pnpm --filter @oppmon/cli build`}
            language="bash"
          />
          <p className="text-gray-500 text-sm">
            This compiles TypeScript source files in <code>packages/cli/src/</code> and outputs JavaScript to <code>packages/cli/dist/</code>
          </p>
        </div>
      </TutorialSection>

      {/* Step 2: Verify Installation */}
      <TutorialSection
        id="step-2"
        icon={<span className="text-lg font-bold text-green-400">2</span>}
        iconBg="bg-green-500/20"
        title="Verify Installation"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Test that the CLI runs correctly:</p>
          <CodeSnippet
            code={`cd packages/cli
node dist/index.js --help`}
            language="bash"
          />
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <p className="text-sm text-gray-400 mb-2">Expected output:</p>
            <pre className="text-xs text-gray-500 font-mono">{`Usage: tag [options] [command]

OppMon CLI - AI Gateway management tool

Options:
  -v, --version   Output the current version
  -h, --help      Display help for command

Commands:
  login           Authenticate with the OppMon Gateway
  logout          Log out and clear stored credentials
  status          Show current authentication state
  sync            Sync skills and MCP configurations
  hooks           Manage Claude Code event capture hooks
  events          Manage event collection and buffering
  doctor          Diagnose and fix common issues`}</pre>
          </div>
        </div>
      </TutorialSection>

      {/* Step 3: Start Services */}
      <TutorialSection
        id="step-3"
        icon={<span className="text-lg font-bold text-green-400">3</span>}
        iconBg="bg-green-500/20"
        title="Start Required Services"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Ensure the OppMon API is running:</p>
          <CodeSnippet
            code={`# From project root
pnpm dev:api`}
            language="bash"
          />
          <p className="text-gray-400 mt-4">Verify the API is healthy:</p>
          <CodeSnippet
            code="curl http://localhost:3001/api/health"
            language="bash"
          />
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <p className="text-sm text-gray-400 mb-2">Expected output:</p>
            <pre className="text-xs text-gray-500 font-mono">{`{"status":"healthy","timestamp":"...","version":"1.0.0","checks":{"database":"ok"}}`}</pre>
          </div>
        </div>
      </TutorialSection>

      {/* Step 4: Get Token */}
      <TutorialSection
        id="step-4"
        icon={<span className="text-lg font-bold text-green-400">4</span>}
        iconBg="bg-green-500/20"
        title="Get Authentication Token"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Login to get a JWT token for CLI authentication:</p>
          <CodeSnippet
            code={`curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\\"email\\":\\"admin@oppmon.dev\\",\\"password\\":\\"admin123\\"}"`}
            language="bash"
          />
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <p className="text-yellow-400 font-medium">Important</p>
            <p className="text-gray-400 text-sm mt-1">
              Save the <code className="text-green-400">token</code> value from the response — you&apos;ll need it in the next step.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Step 5: Authenticate */}
      <TutorialSection
        id="step-5"
        icon={<span className="text-lg font-bold text-green-400">5</span>}
        iconBg="bg-green-500/20"
        title="Authenticate the CLI"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Use headless mode to authenticate with the token:</p>
          <CodeSnippet
            code={`cd packages/cli

# Set environment variables (replace YOUR_TOKEN)
set TAG_API_URL=http://localhost:3001
set TAG_TOKEN=YOUR_TOKEN

# Authenticate
node dist/index.js login --headless`}
            language="bash"
          />
          <p className="text-gray-400 mt-4">Verify authentication:</p>
          <CodeSnippet
            code={`set TAG_API_URL=http://localhost:3001
node dist/index.js status`}
            language="bash"
          />
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <p className="text-sm text-gray-400 mb-2">Expected output:</p>
            <pre className="text-xs text-gray-500 font-mono">{`Status

  Authenticated: Yes
  User:          admin@oppmon.dev (Admin User)
  Role:          TENANT_ADMIN
  Tenant:        Default Tenant
  Token Expires: in 364 days
  API Endpoint:  http://localhost:3001`}</pre>
          </div>
        </div>
      </TutorialSection>

      {/* Step 6: Install Hooks */}
      <TutorialSection
        id="step-6"
        icon={<span className="text-lg font-bold text-green-400">6</span>}
        iconBg="bg-green-500/20"
        title="Install Claude Code Hooks"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Install event capture hooks for Claude Code:</p>
          <CodeSnippet
            code={`set TAG_API_URL=http://localhost:3001
node dist/index.js hooks install`}
            language="bash"
          />
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <p className="text-sm text-gray-400 mb-2">What this does:</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Creates/updates <code>~/.claude/hooks.json</code></li>
              <li>• Adds hooks for <code>postSkillInvoke</code> and <code>postToolCall</code> events</li>
              <li>• Events are captured when you use skills or MCP tools in Claude Code</li>
            </ul>
          </div>
        </div>
      </TutorialSection>

      {/* Step 7: Enable Events */}
      <TutorialSection
        id="step-7"
        icon={<span className="text-lg font-bold text-green-400">7</span>}
        iconBg="bg-green-500/20"
        title="Enable Event Collection"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Enable the event collection system:</p>
          <CodeSnippet
            code={`set TAG_API_URL=http://localhost:3001
node dist/index.js events enable`}
            language="bash"
          />
          <p className="text-gray-500 text-sm">
            Events will be buffered locally and flushed every 30 seconds to the server.
          </p>
        </div>
      </TutorialSection>

      {/* Step 8: Verify Setup */}
      <TutorialSection
        id="step-8"
        icon={<span className="text-lg font-bold text-green-400">8</span>}
        iconBg="bg-green-500/20"
        title="Verify Setup"
      >
        <div className="space-y-4">
          <p className="text-gray-400">Run diagnostics to verify everything is configured correctly:</p>
          <CodeSnippet
            code={`set TAG_API_URL=http://localhost:3001
node dist/index.js doctor`}
            language="bash"
          />
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <p className="text-sm text-gray-400 mb-2">Expected output (all green):</p>
            <pre className="text-xs text-green-400 font-mono">{`OppMon CLI Diagnostics

✓ Installation
   CLI configured correctly

✓ Authentication
   Token valid, expires in 364 days

✓ Network
   API reachable (67ms)

✓ Claude Code
   Claude Code configured with hooks

✓ Sync State
   Skills synced

Summary: 5 passed, 0 warnings, 0 errors`}</pre>
          </div>
        </div>
      </TutorialSection>

      {/* Step 9: Test Integration */}
      <TutorialSection
        id="step-9"
        icon={<span className="text-lg font-bold text-green-400">9</span>}
        iconBg="bg-green-500/20"
        title="Test the Integration"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Check Event Status</h4>
            <CodeSnippet
              code={`set TAG_API_URL=http://localhost:3001
node dist/index.js events status`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Use Claude Code</h4>
            <p className="text-gray-400 text-sm mb-3">
              When you use Claude Code and invoke skills (e.g., <code className="text-green-400">/commit</code>) or
              MCP tools, events will be captured automatically.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Flush Events Manually</h4>
            <CodeSnippet
              code={`set TAG_API_URL=http://localhost:3001
node dist/index.js events flush`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">View Usage Dashboard</h4>
            <p className="text-gray-400 text-sm">
              Open the admin dashboard to see captured events:
            </p>
            <div className="flex gap-4 mt-2">
              <a href="/admin/usage" className="text-green-400 hover:underline text-sm">
                → Usage Dashboard
              </a>
              <a href="/admin/llm-usage" className="text-green-400 hover:underline text-sm">
                → LLM Usage Dashboard
              </a>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* Command Reference */}
      <TutorialSection
        id="command-reference"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Command Reference"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-400 font-medium">Task</th>
                <th className="text-left py-2 text-gray-400 font-medium">Command</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-white/5">
                <td className="py-2">Check status</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js status</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Run diagnostics</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js doctor</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Pull skills</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js sync skills pull</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Push skills</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js sync skills push</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Install hooks</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js hooks install</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Enable events</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js events enable</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Flush events</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js events flush</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Ingest docs</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js rag ingest &lt;file&gt;</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2">Search RAG</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js rag search &quot;query&quot;</td>
              </tr>
              <tr>
                <td className="py-2">Logout</td>
                <td className="py-2 font-mono text-green-400">node dist/index.js logout</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TutorialSection>
    </div>
  )
}
