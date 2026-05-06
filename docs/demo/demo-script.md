# Arkon Demo Script

**Target Duration:** 10-15 minutes
**Audience:** Investors, partners, technical decision makers

---

## Pre-Demo Checklist

- [ ] API server running (`pnpm dev:api`)
- [ ] Frontend running (`pnpm dev:web`)
- [ ] Database seeded with sample data
- [ ] Test user account created
- [ ] CLI installed and authenticated
- [ ] Screen resolution: 1920x1080 or higher
- [ ] Browser zoom: 100%
- [ ] Incognito/private window ready

---

## Demo Flow

### Introduction (1 minute)

**Talking Points:**
> "Arkon is an AI Gateway platform that provides observability, security, and management for AI agent deployments. Think of it as the control plane for your AI agents."

> "Today I'll show you how teams can manage skills, track usage, and maintain visibility across their AI infrastructure."

---

### 1. Landing Page (1 minute)

**URL:** `http://localhost:3002`

**Actions:**
1. Show the landing page hero section
2. Point out the key features (Dashboard, Security, Cost Tracking, Workflows)
3. Click "Get Started" to go to registration

**Talking Points:**
> "The platform is designed for teams using AI agents in production. You can see our core capabilities: real-time monitoring, security with ThreatGuard, cost tracking, and workflow automation."

---

### 2. User Registration (1 minute)

**URL:** `http://localhost:3002/register`

**Actions:**
1. Fill in demo user details:
   - Name: "Demo User"
   - Email: "demo@example.com"
   - Password: (any valid password)
2. Click "Create account"
3. Show redirect to admin dashboard

**Talking Points:**
> "New users can sign up in seconds. We automatically create a tenant for them and give them admin access to their organization."

---

### 3. Admin Dashboard Overview (2 minutes)

**URL:** `http://localhost:3002/admin`

**Actions:**
1. Show the admin dashboard with all sections
2. Point out Teams, Skills, MCP Servers, Usage, Audit
3. Show the Quick Start guide

**Talking Points:**
> "This is the admin dashboard. From here, you can manage your entire AI infrastructure. Let me show you the key sections."

> "The Quick Start guide helps new users understand the setup flow: create a team, add skills, then monitor usage."

---

### 4. Teams Management (2 minutes)

**URL:** `http://localhost:3002/admin/teams`

**Actions:**
1. Show existing teams (or create one)
2. Click into a team to show members
3. Demonstrate role-based access (Owner, Admin, Member)

**Talking Points:**
> "Teams are the organizational unit in Arkon. Each team can have members with different roles. Owners have full control, Admins can manage team resources, and Members can view and use resources."

> "This maps to how engineering teams actually work - you probably have platform engineers who manage the AI infrastructure, and developers who consume it."

---

### 5. Skills Registry (2 minutes)

**URL:** `http://localhost:3002/admin/skills`

**Actions:**
1. Show the skills list
2. Click "Create Skill" to show the modal
3. Walk through the form fields
4. Show a skill detail page

**Talking Points:**
> "Skills are reusable prompts and workflows that your team can share. Think of them as templates for common AI operations."

> "Each skill has a name, description, scope, and content. The scope determines who can access it - tenant-wide or just a specific team."

> "Skills can be synced to Claude Code using our CLI, so developers can use them directly in their IDE."

---

### 6. Usage Analytics (2 minutes)

**URL:** `http://localhost:3002/admin/usage`

**Actions:**
1. Show the usage dashboard
2. Toggle between time periods (24h, 7d, 30d)
3. Point out the privacy notice

**Talking Points:**
> "This is our privacy-first usage analytics. Notice we don't track individual users - all data is aggregated at the tenant level."

> "You can see how skills and tools are being used across your organization without compromising user privacy. This is important for enterprises that have strict data policies."

> "The data is bucketed into 15-minute intervals, so you can see trends over time without identifying specific user actions."

---

### 7. CLI Demo (2 minutes)

**Actions:**
1. Open terminal
2. Show `tag --help`
3. Run `tag status`
4. Run `tag doctor`

**Commands:**
```bash
# Show CLI help
tag --help

# Check auth status
tag status

# Run diagnostics
tag doctor
```

**Talking Points:**
> "The CLI is how developers interact with Arkon from their terminal. It integrates with Claude Code to sync skills and collect usage data."

> "The `tag doctor` command is our self-service troubleshooting tool. It checks authentication, network connectivity, Claude Code integration, and sync state."

> "If something is wrong, it tells you exactly what to do to fix it."

---

### 8. Closing (1 minute)

**Talking Points:**
> "To summarize: Arkon gives you visibility and control over your AI agent infrastructure. You can manage skills, track usage, and maintain security - all with a privacy-first approach."

> "We're currently in private beta. If you're interested in managing AI agents at scale, I'd love to discuss how Arkon can help your team."

---

## Backup Plans

### If demo fails - use screenshots
- Screenshots saved in `docs/demo/screenshots/`
- Walk through the flow with static images

### If network is slow
- Use locally cached data
- Skip live API calls, show pre-recorded terminal output

### If questions interrupt the flow
- Note the question, promise to address after demo
- Or address briefly if directly relevant to current section

---

## Anticipated Questions

### Security
> "How do you handle security?"
>
> "We have cross-tenant isolation at the database level, RBAC on all endpoints, and JWT-based authentication. For usage analytics, we intentionally don't store user IDs - privacy by design."

### Pricing
> "What's the pricing model?"
>
> "We're still finalizing pricing. We'll likely have a free tier for small teams and usage-based pricing for larger organizations."

### Integration
> "How does this integrate with existing tools?"
>
> "We have a CLI that works with any terminal, and we integrate directly with Claude Code. We're also building MCP server support for broader tool compatibility."

### On-premise
> "Can this run on-premise?"
>
> "The platform is containerized and can be deployed anywhere. We'll have self-hosted options for enterprise customers with strict compliance requirements."

---

## Post-Demo

1. Collect feedback
2. Note any friction points
3. Update demo script if needed
4. Schedule follow-up call
