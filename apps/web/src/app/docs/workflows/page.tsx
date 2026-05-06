'use client'

import { CodeSnippet, TutorialSection } from '@/components/tutorial'

export default function WorkflowsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Coding Workflows</h1>
        <p className="text-gray-400">
          Practical workflows for using OppMon CLI with Claude Code for development tasks.
        </p>
      </div>

      {/* Quick Setup */}
      <TutorialSection
        id="quick-setup"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Quick Setup (One-Time)"
      >
        <CodeSnippet
          code={`# 1. Build CLI
pnpm --filter @oppmon/cli build

# 2. Get token
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\\"email\\":\\"admin@oppmon.dev\\",\\"password\\":\\"admin123\\"}"

# 3. Authenticate (replace YOUR_TOKEN)
cd packages/cli
set TAG_API_URL=http://localhost:3001
set TAG_TOKEN=YOUR_TOKEN
node dist/index.js login --headless

# 4. Install hooks & enable events
node dist/index.js hooks install
node dist/index.js events enable

# 5. Verify
node dist/index.js doctor`}
          language="bash"
          title="Initial Setup"
        />
      </TutorialSection>

      {/* Workflow 1: Starting a Session */}
      <TutorialSection
        id="workflow-1"
        icon={<span className="text-lg font-bold text-blue-400">1</span>}
        iconBg="bg-blue-500/20"
        title="Starting a New Coding Session"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Before You Start</h4>
            <CodeSnippet
              code={`# Check CLI status
cd C:\\Users\\thach\\Documents\\workstation\\oppmon-workstation\\packages\\cli
set TAG_API_URL=http://localhost:3001
node dist/index.js status`}
              language="bash"
            />
            <p className="text-gray-500 text-sm mt-2">Expected: <code className="text-green-400">Authenticated: Yes</code></p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Pull Latest Skills</h4>
            <CodeSnippet
              code="node dist/index.js sync skills pull"
              language="bash"
            />
            <p className="text-gray-500 text-sm mt-2">This downloads any new skills from the server to use locally.</p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Start Coding with Claude Code</h4>
            <p className="text-gray-400 text-sm">
              Open Claude Code in your project directory. All skill and MCP tool usage will be automatically tracked.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Workflow 2: Bug Fixing */}
      <TutorialSection
        id="workflow-2"
        icon={<span className="text-lg font-bold text-red-400">2</span>}
        iconBg="bg-red-500/20"
        title="Bug Fixing"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Step 1: Identify the Bug</h4>
            <p className="text-gray-400 text-sm mb-3">Use Claude Code to investigate:</p>
            <div className="bg-black/30 rounded-lg p-4 border border-white/10">
              <code className="text-gray-300">&gt; Explain the error in apps/api/src/routes/auth.ts:45</code>
            </div>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Step 2: Check Recent Changes</h4>
            <CodeSnippet
              code={`# See what changed recently
git log --oneline -10

# Check current branch status
git status`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Step 3: Fix with Claude Code</h4>
            <div className="bg-black/30 rounded-lg p-4 border border-white/10">
              <code className="text-gray-300">&gt; Fix the authentication bug where tokens expire too quickly</code>
            </div>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Step 4: Test the Fix</h4>
            <CodeSnippet
              code={`# Run tests
pnpm test

# Or specific tests
pnpm --filter @oppmon/api test`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Step 5: Track Your Work</h4>
            <CodeSnippet
              code="node dist/index.js events flush"
              language="bash"
            />
            <p className="text-gray-500 text-sm mt-2">
              View your activity in the Usage Dashboard: <a href="/admin/usage" className="text-green-400 hover:underline">/admin/usage</a>
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Workflow 3: Using AI Models */}
      <TutorialSection
        id="workflow-3"
        icon={<span className="text-lg font-bold text-purple-400">3</span>}
        iconBg="bg-purple-500/20"
        title="Using AI Models for Code Generation"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Check Available Models</h4>
            <p className="text-gray-400 text-sm">
              View configured models in the Admin dashboard: <a href="/admin/models" className="text-green-400 hover:underline">/admin/models</a>
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Test a Model via API</h4>
            <CodeSnippet
              code={`curl -X POST http://localhost:3001/api/llm/chat ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Hello\\"}],\\"provider\\":\\"cerebras\\"}"`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">View LLM Usage</h4>
            <p className="text-gray-400 text-sm">
              All LLM API calls are tracked automatically: <a href="/admin/llm-usage" className="text-green-400 hover:underline">/admin/llm-usage</a>
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Workflow 4: Skill Development */}
      <TutorialSection
        id="workflow-4"
        icon={<span className="text-lg font-bold text-orange-400">4</span>}
        iconBg="bg-orange-500/20"
        title="Skill Development"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Create a New Skill</h4>
            <CodeSnippet
              code={`# Create skill directory
mkdir .claude\\skills\\my-new-skill`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Create SKILL.md</h4>
            <CodeSnippet
              code={`# My New Skill

Description of what this skill does.

## Usage

/my-new-skill [args]

## Steps

1. Step one
2. Step two`}
              language="markdown"
              title=".claude/skills/my-new-skill/SKILL.md"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Push Skill to Server</h4>
            <CodeSnippet
              code="node dist/index.js sync skills push my-new-skill"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">List All Skills</h4>
            <CodeSnippet
              code="node dist/index.js sync skills list"
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* Workflow 5: RAG-Powered Development */}
      <TutorialSection
        id="workflow-5"
        icon={<span className="text-lg font-bold text-cyan-400">5</span>}
        iconBg="bg-cyan-500/20"
        title="RAG-Powered Development"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Ingest Documentation</h4>
            <CodeSnippet
              code={`# Single file
node dist/index.js rag ingest README.md

# Entire directory
node dist/index.js rag ingest-dir ./docs`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Search for Information</h4>
            <CodeSnippet
              code='node dist/index.js rag search "how does authentication work"'
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Query with AI Response</h4>
            <CodeSnippet
              code='node dist/index.js rag query "explain the database schema"'
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* Workflow 6: Debugging */}
      <TutorialSection
        id="workflow-6"
        icon={<span className="text-lg font-bold text-yellow-400">6</span>}
        iconBg="bg-yellow-500/20"
        title="Debugging Issues"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Run Diagnostics</h4>
            <CodeSnippet
              code="node dist/index.js doctor"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Check Network Connectivity</h4>
            <CodeSnippet
              code="node dist/index.js doctor network"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Auto-Fix Issues</h4>
            <CodeSnippet
              code="node dist/index.js doctor --fix"
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* Workflow 7: End of Day */}
      <TutorialSection
        id="workflow-7"
        icon={<span className="text-lg font-bold text-gray-400">7</span>}
        iconBg="bg-gray-500/20"
        title="End of Day"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Flush All Events</h4>
            <CodeSnippet
              code="node dist/index.js events flush"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Check Event Stats</h4>
            <CodeSnippet
              code="node dist/index.js events status"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Review Your Activity</h4>
            <div className="flex gap-4">
              <a href="/admin/usage" className="text-green-400 hover:underline text-sm">
                → Your Activity
              </a>
              <a href="/admin/llm-usage" className="text-green-400 hover:underline text-sm">
                → LLM Usage
              </a>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* Tips */}
      <TutorialSection
        id="tips"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Tips & Best Practices"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-3">1. Use Environment Variables</h4>
            <p className="text-gray-400 text-sm mb-2">Set in your terminal profile:</p>
            <CodeSnippet
              code="set TAG_API_URL=http://localhost:3001"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">2. Create an Alias</h4>
            <p className="text-gray-400 text-sm mb-2">Create <code>tag.cmd</code>:</p>
            <CodeSnippet
              code={`@echo off
set TAG_API_URL=http://localhost:3001
node "%~dp0dist\\index.js" %*`}
              language="batch"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">3. Keep Hooks Updated</h4>
            <p className="text-gray-400 text-sm">After CLI updates, reinstall hooks:</p>
            <CodeSnippet
              code="node dist/index.js hooks install"
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">4. Use RAG for Context</h4>
            <p className="text-gray-400 text-sm">Before complex questions, ingest docs:</p>
            <CodeSnippet
              code="node dist/index.js rag ingest-dir ./docs"
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>
    </div>
  )
}
