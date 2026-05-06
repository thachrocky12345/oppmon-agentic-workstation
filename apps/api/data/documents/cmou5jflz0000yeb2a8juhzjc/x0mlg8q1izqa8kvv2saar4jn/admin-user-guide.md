# Arkon Admin User Guide

**Last Updated:** 2026-05-05

Comprehensive guide for administrators managing the Arkon AI Gateway platform.

## Getting Started

### Accessing Admin Panel

1. Navigate to https://arkon.app/admin
2. Login with admin credentials
3. You'll see the admin dashboard with navigation

### Admin Navigation

| Section | Purpose |
|---------|---------|
| Teams | Team management |
| AI Models | Model configuration |
| LLM Usage | Usage analytics |
| Skills | Skills registry |
| MCP Servers | MCP server management |
| Usage | Platform usage metrics |
| Audit Log | Activity audit trail |

## Team Management

### Creating a Team

1. Go to Admin → Teams
2. Click "Create Team"
3. Enter team name and description
4. Assign initial members
5. Click "Create"

### Managing Team Members

1. Select a team from the list
2. Click "Members" tab
3. Add members: Click "Add Member", search for user, select role
4. Remove members: Click the remove icon next to member
5. Change roles: Click the role dropdown next to member

### Team Roles

| Role | Permissions |
|------|-------------|
| Member | Use team resources, view dashboards |
| Admin | Manage team settings, add/remove members |
| Owner | Full control, delete team, transfer ownership |

## AI Models Configuration

### Adding a Model

1. Go to Admin → AI Models
2. Click "Add Model"
3. Select provider (Anthropic, OpenAI, Cerebras, Ollama)
4. Enter model ID and display name
5. Configure settings:
   - Max tokens
   - Temperature default
   - Rate limits
6. Add API credentials (stored encrypted)
7. Click "Save"

### Model Routing

Configure how requests are routed to models:

1. Select a model
2. Click "Routing Rules"
3. Add rules based on:
   - Team
   - Request type
   - Cost constraints
   - Availability
4. Set fallback models

### Virtual Keys

Create virtual API keys for teams:

1. Go to AI Models → Virtual Keys
2. Click "Create Key"
3. Select team and allowed models
4. Set rate limits and quotas
5. Copy the generated key

## Skills Registry

### Creating a Skill

1. Go to Admin → Skills
2. Click "Create Skill"
3. Fill in details:
   - Name and description
   - Category
   - Implementation (markdown content)
4. Set visibility (public, team, private)
5. Click "Create"

### Managing Skills

- **Edit**: Click skill → Edit → Make changes → Save
- **Archive**: Click skill → Archive
- **Delete**: Click skill → Delete (requires confirmation)

### Skill Categories

| Category | Description |
|----------|-------------|
| Development | Code and dev tasks |
| Analysis | Data analysis |
| Communication | Writing and editing |
| Automation | Workflow automation |
| Custom | Team-specific |

## MCP Servers

### Adding an MCP Server

1. Go to Admin → MCP Servers
2. Click "Add Server"
3. Enter server details:
   - Name and description
   - Endpoint URL
   - Authentication method
4. Configure capabilities
5. Test connection
6. Click "Save"

### Server Status

Monitor server health:
- Green: Healthy
- Yellow: Degraded
- Red: Offline

### Capability Management

1. Select a server
2. Click "Capabilities"
3. Enable/disable specific capabilities
4. Set per-capability rate limits

## Usage Analytics

### Viewing Usage

1. Go to Admin → Usage
2. Select date range
3. View metrics:
   - Total requests
   - Token usage
   - Cost breakdown
   - Top users/teams

### Usage Reports

Generate reports:

1. Click "Generate Report"
2. Select report type:
   - Summary
   - Detailed
   - Billing
3. Select date range and filters
4. Export as CSV or PDF

### Setting Quotas

1. Go to Usage → Quotas
2. Select team
3. Set limits:
   - Daily token limit
   - Monthly cost limit
   - Request rate limit
4. Configure alerts

## Audit Log

### Viewing Audit Log

1. Go to Admin → Audit Log
2. Browse recent activities
3. Filter by:
   - User
   - Action type
   - Date range
   - Resource

### Audit Log Entries

Each entry includes:
- Timestamp
- Actor (who performed action)
- Action (what was done)
- Resource (what was affected)
- Details (additional context)
- IP address

### Exporting Audit Logs

1. Apply desired filters
2. Click "Export"
3. Select format (CSV, JSON)
4. Download file

## Common Tasks

### Reset User Password

1. Go to Admin → Users (if available) or use CLI
2. Find user
3. Click "Reset Password"
4. User receives password reset email

### Disable User Account

1. Find user in team members
2. Click "Disable Account"
3. User can no longer login

### View User Activity

1. Go to Audit Log
2. Filter by user email/ID
3. Review all user actions

### Investigate Issues

1. Get user report with timestamp
2. Go to Audit Log
3. Filter to that time period and user
4. Review actions and any errors

## Best Practices

### Security

- Regularly review admin access
- Use strong passwords and MFA
- Review audit logs weekly
- Rotate API keys quarterly

### Team Management

- Document team purposes
- Set appropriate quotas
- Review member access periodically
- Archive inactive teams

### Model Management

- Test new models in staging first
- Set conservative rate limits initially
- Monitor costs closely
- Have fallback models configured

### Skills

- Version skill content
- Test skills before publishing
- Gather usage feedback
- Archive outdated skills

## Troubleshooting

### User Can't Login

1. Check if account is active
2. Check if password needs reset
3. Check audit log for failed attempts
4. Verify team membership

### Model Not Working

1. Check model status in Models
2. Verify API credentials
3. Check rate limits
4. Review error logs

### High Usage

1. Check Usage dashboard
2. Identify top consumers
3. Review for anomalies
4. Adjust quotas if needed

### Permission Issues

1. Verify user's team membership
2. Check user's role
3. Verify resource permissions
4. Review team settings

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `g t` | Go to Teams |
| `g m` | Go to Models |
| `g s` | Go to Skills |
| `g u` | Go to Usage |
| `g a` | Go to Audit |
| `?` | Show shortcuts |

### CLI Commands

```bash
# Team operations
pnpm admin:team:list
pnpm admin:team:create --name "Team Name"

# User operations
pnpm admin:user:list
pnpm admin:user:reset-password --email user@example.com

# Model operations
pnpm admin:model:list
pnpm admin:model:status

# Usage reports
pnpm admin:usage:report --from 2026-01-01 --to 2026-05-01
```

## Support

For additional help:
- Documentation: https://docs.arkon.app
- Support: support@arkon.app
- Emergency: See [Incident Response](runbooks/incidents/incident-response.md)
