# Admin Import/Export Operations

**Last Updated:** 2026-05-05

Procedures for importing and exporting data via admin panel.

## Export Procedures

### Exporting Data via Admin UI

1. Navigate to Admin → Data Management
2. Select data type to export
3. Apply filters (date range, status, etc.)
4. Click "Export" button
5. Choose format (CSV, JSON)
6. Download file

### Exporting via CLI

```bash
# Export agents
pnpm admin:export --type agents --format csv --output agents.csv

# Export with filters
pnpm admin:export --type events \
  --from 2026-01-01 \
  --to 2026-05-01 \
  --format json \
  --output events.json

# Export all data for a tenant
pnpm admin:export --tenant abc123 --all --output tenant-backup/
```

### Large Dataset Export

For datasets > 100k records:

```bash
# Stream export (doesn't load all in memory)
pnpm admin:export:stream --type events \
  --output events.jsonl \
  --format jsonl

# Paginated export
pnpm admin:export:paginated --type users \
  --page-size 10000 \
  --output users/
```

## Import Procedures

### Importing Data via Admin UI

1. Navigate to Admin → Data Management → Import
2. Select data type
3. Upload file (CSV or JSON)
4. Preview import (first 10 rows)
5. Validate data
6. Confirm import

### Import via CLI

```bash
# Import from CSV
pnpm admin:import --type agents --file agents.csv

# Dry run (validate only)
pnpm admin:import --type users --file users.json --dry-run

# Import with options
pnpm admin:import --type events \
  --file events.json \
  --on-conflict skip \  # or: update, error
  --batch-size 1000
```

### Import Validation

Before importing:

```bash
# Validate file format
pnpm admin:validate --type agents --file agents.csv

# Check for duplicates
pnpm admin:validate --type users --file users.json --check-duplicates
```

## Data Formats

### CSV Format

```csv
id,name,description,tenantId,createdAt
abc123,Agent One,Description here,tenant1,2026-01-01T00:00:00Z
```

Requirements:
- UTF-8 encoding
- Header row required
- Dates in ISO 8601 format
- Empty values as empty strings (not NULL)

### JSON Format

```json
[
  {
    "id": "abc123",
    "name": "Agent One",
    "description": "Description here",
    "tenantId": "tenant1",
    "createdAt": "2026-01-01T00:00:00Z"
  }
]
```

### JSONL Format (for streaming)

```jsonl
{"id":"abc123","name":"Agent One"}
{"id":"def456","name":"Agent Two"}
```

## Tenant Data Operations

### Export Tenant Data

```bash
# Full tenant export
pnpm admin:tenant:export --tenant abc123 --output tenant-abc123/

# This exports:
# - tenant-abc123/agents.json
# - tenant-abc123/events.json
# - tenant-abc123/workflows.json
# - tenant-abc123/skills.json
# - tenant-abc123/settings.json
```

### Import Tenant Data

```bash
# Import to new tenant
pnpm admin:tenant:import --tenant new123 --input tenant-abc123/

# Import to existing (merge)
pnpm admin:tenant:import --tenant abc123 --input backup/ --merge
```

## Backup Operations

### Create Backup

```bash
# Full system backup
pnpm admin:backup --output backup-$(date +%Y%m%d).zip

# Tenant-specific backup
pnpm admin:backup --tenant abc123 --output tenant-backup.zip
```

### Restore Backup

```bash
# Restore (WARNING: overwrites existing data)
pnpm admin:restore --input backup-20260505.zip

# Restore to specific tenant
pnpm admin:restore --input backup.zip --tenant new123
```

## Safety Checklist

### Before Import

- [ ] Backup existing data
- [ ] Validate import file format
- [ ] Run dry-run import
- [ ] Check for duplicates
- [ ] Verify tenant isolation
- [ ] Test on staging first

### Before Export

- [ ] Verify you have access rights
- [ ] Check data contains no PII (if sharing)
- [ ] Use secure transfer for sensitive data
- [ ] Document what was exported and why

### After Import

- [ ] Verify record counts
- [ ] Spot-check imported data
- [ ] Test affected features
- [ ] Update audit log

---

## Troubleshooting

### Import Fails with Validation Error

```bash
# Get detailed error report
pnpm admin:import --file data.csv --verbose 2>&1 | tee import-errors.log

# Fix and retry
pnpm admin:import --file fixed-data.csv
```

### Export Times Out

```bash
# Use streaming export
pnpm admin:export:stream --type events --output events.jsonl

# Or paginate
pnpm admin:export:paginated --type events --page-size 5000 --output events/
```

### Duplicate Key Errors

```bash
# Skip duplicates
pnpm admin:import --file data.json --on-conflict skip

# Update duplicates
pnpm admin:import --file data.json --on-conflict update
```
