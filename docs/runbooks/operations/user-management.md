# User Management Operations

**Last Updated:** 2026-05-05

Administrative procedures for user and team management.

## User Operations

### Creating Users

#### Via Admin UI
1. Navigate to Admin → Users
2. Click "Add User"
3. Fill in details:
   - Email (required)
   - Name
   - Role
   - Team assignment
4. Click "Create"
5. User receives invitation email

#### Via CLI
```bash
# Create user
pnpm admin:user:create \
  --email user@example.com \
  --name "John Doe" \
  --role member

# Create admin user
pnpm admin:user:create \
  --email admin@example.com \
  --name "Admin User" \
  --role admin
```

### Updating Users

```bash
# Update role
pnpm admin:user:update --id user123 --role admin

# Update name
pnpm admin:user:update --id user123 --name "New Name"

# Disable user
pnpm admin:user:update --id user123 --status disabled
```

### Deleting Users

```bash
# Soft delete (deactivate)
pnpm admin:user:deactivate --id user123

# Hard delete (remove all data)
pnpm admin:user:delete --id user123 --confirm

# Note: Hard delete removes:
# - User record
# - User's sessions
# - User's personal settings
# - User's audit entries (anonymized)
```

### Password Reset

```bash
# Send password reset email
pnpm admin:user:reset-password --email user@example.com

# Force password reset on next login
pnpm admin:user:update --id user123 --force-password-reset

# Set temporary password (for emergency)
pnpm admin:user:set-password --id user123 --temporary
```

## Team Operations

### Creating Teams

```bash
# Create team
pnpm admin:team:create \
  --name "Engineering" \
  --tenant tenant123

# Create team with initial members
pnpm admin:team:create \
  --name "Data Science" \
  --tenant tenant123 \
  --members user1,user2,user3
```

### Managing Team Membership

```bash
# Add member
pnpm admin:team:add-member --team team123 --user user456 --role member

# Add as admin
pnpm admin:team:add-member --team team123 --user user456 --role admin

# Remove member
pnpm admin:team:remove-member --team team123 --user user456

# List members
pnpm admin:team:members --team team123
```

### Team Roles

| Role | Permissions |
|------|-------------|
| `member` | View team resources, use agents |
| `admin` | Manage team members, settings |
| `owner` | Delete team, transfer ownership |

### Updating Teams

```bash
# Update name
pnpm admin:team:update --id team123 --name "New Name"

# Transfer ownership
pnpm admin:team:transfer-ownership --id team123 --to user456
```

### Deleting Teams

```bash
# Soft delete
pnpm admin:team:archive --id team123

# Hard delete (removes all team data)
pnpm admin:team:delete --id team123 --confirm
```

## Tenant Operations

### Viewing Tenants

```bash
# List all tenants
pnpm admin:tenant:list

# Get tenant details
pnpm admin:tenant:show --id tenant123
```

### Creating Tenants

```bash
# Create tenant
pnpm admin:tenant:create \
  --name "Acme Corp" \
  --plan enterprise

# Create with initial admin
pnpm admin:tenant:create \
  --name "Acme Corp" \
  --admin-email admin@acme.com
```

### Tenant Settings

```bash
# Update settings
pnpm admin:tenant:settings --id tenant123 \
  --max-agents 100 \
  --max-users 50

# Enable feature
pnpm admin:tenant:feature --id tenant123 --enable advanced-analytics

# Disable feature
pnpm admin:tenant:feature --id tenant123 --disable beta-features
```

## Bulk Operations

### Bulk User Import

```bash
# From CSV
pnpm admin:user:bulk-import --file users.csv

# CSV format:
# email,name,role,teamId
# user1@example.com,User One,member,team123
```

### Bulk User Update

```bash
# Update all users in team
pnpm admin:user:bulk-update \
  --filter "teamId=team123" \
  --set "role=member"
```

### Bulk Deactivation

```bash
# Deactivate inactive users
pnpm admin:user:bulk-deactivate \
  --filter "lastLogin<2026-01-01"
```

## Audit Operations

### View User Audit Log

```bash
# User activity
pnpm admin:audit --user user123 --limit 100

# Specific action types
pnpm admin:audit --user user123 --action login,logout
```

### View Admin Actions

```bash
# All admin actions
pnpm admin:audit --admin-only --limit 100

# Specific admin
pnpm admin:audit --actor admin123
```

## Security Operations

### Force Logout

```bash
# Single user
pnpm admin:user:logout --id user123

# All users in tenant
pnpm admin:tenant:logout-all --id tenant123

# All users (emergency)
pnpm admin:logout-all --confirm
```

### Revoke Tokens

```bash
# Revoke all tokens for user
pnpm admin:user:revoke-tokens --id user123

# Revoke specific token
pnpm admin:token:revoke --id token123
```

### Lock Account

```bash
# Lock (prevent login)
pnpm admin:user:lock --id user123 --reason "Security review"

# Unlock
pnpm admin:user:unlock --id user123
```

---

## Quick Reference

### Common Tasks

| Task | Command |
|------|---------|
| Create user | `pnpm admin:user:create --email X --role Y` |
| Reset password | `pnpm admin:user:reset-password --email X` |
| Add to team | `pnpm admin:team:add-member --team X --user Y` |
| Deactivate user | `pnpm admin:user:deactivate --id X` |
| View audit log | `pnpm admin:audit --user X` |

### Roles

| Role | Level | Description |
|------|-------|-------------|
| `member` | User | Standard user |
| `admin` | User | User administrator |
| `team_admin` | Team | Team administrator |
| `tenant_admin` | Tenant | Tenant administrator |
| `super_admin` | System | Platform administrator |
