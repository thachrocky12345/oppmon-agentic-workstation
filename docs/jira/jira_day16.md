# TAG-16: Admin UI: Skills + MCP Registry

## Description

**Suggested Points:** 8 (High — toggle propagation logic, bundle upload UI, audit detail views, and version management; builds on Day 15 patterns with additional complexity)

## Objective

Extend the Admin UI with Skills Registry and MCP Server management interfaces, implementing toggle propagation for enabling/disabling resources, bundle upload with progress, and detailed audit views showing version history.

## Requirements

### Skills Registry UI
- `GET /admin/skills` — List all skills with filters
- `GET /admin/skills/:id` — Skill detail with versions
- `POST /admin/skills` — Create skill (form with content editor)
- `PUT /admin/skills/:id` — Edit skill (creates new version)
- `DELETE /admin/skills/:id` — Archive skill
- Toggle: enabled/disabled state per skill
- Scope selector: tenant-wide or team-specific

### MCP Server Registry UI
- `GET /admin/mcp` — List all MCP servers
- `GET /admin/mcp/:id` — Server detail with config
- `POST /admin/mcp` — Create MCP server
- `PUT /admin/mcp/:id` — Edit server configuration
- `DELETE /admin/mcp/:id` — Archive server
- Toggle: enabled/disabled state
- Bundle management (upload, replace, download)

### Toggle Propagation
- Enabled/disabled toggle affects CLI sync
- Disabled skills/MCP servers not synced to clients
- Toggle change logged in audit
- Bulk toggle actions (enable all, disable selected)
- Confirmation for bulk actions

### Bundle Upload UI
- Drag-and-drop file upload
- Progress indicator during upload
- sha256 displayed after upload
- Replace bundle (creates new version)
- Download bundle from detail view

### Audit Detail View
- View all changes to a specific resource
- Timeline view of mutations
- Before/after diff visualization
- Filter by action type
- Export history (optional)

### Version Management
- Skills show version history
- Rollback to previous version (creates new version pointing to old content)
- Version comparison view
- Version notes/changelog

## Implementation Notes
- Backend: Extend API with enable/disable endpoints
- Frontend: React components with drag-drop upload
- CLI: Respects enabled/disabled state during sync
- Database: Add `enabled` boolean to skills and mcp_servers

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/web/src/__tests__/skills-list.test.ts` | `displays skills with status` | Enabled/disabled shown |
| `apps/web/src/__tests__/skills-list.test.ts` | `toggle changes status` | API called, UI updated |
| `apps/web/src/__tests__/skills-list.test.ts` | `bulk toggle works` | Multiple skills toggled |
| `apps/web/src/__tests__/skills-form.test.ts` | `content editor works` | Content saved correctly |
| `apps/web/src/__tests__/skills-form.test.ts` | `edit creates new version` | Version incremented |
| `apps/web/src/__tests__/mcp-list.test.ts` | `displays MCP servers` | Servers rendered |
| `apps/web/src/__tests__/bundle-upload.test.ts` | `drag-drop triggers upload` | File uploaded |
| `apps/web/src/__tests__/bundle-upload.test.ts` | `progress shown during upload` | Progress indicator visible |
| `apps/web/src/__tests__/bundle-upload.test.ts` | `sha256 displayed after upload` | Hash shown in UI |
| `apps/web/src/__tests__/audit-detail.test.ts` | `shows change timeline` | Timeline rendered |
| `apps/web/src/__tests__/audit-detail.test.ts` | `before/after diff visible` | Diff displayed |
| `apps/web/src/__tests__/versions.test.ts` | `version history displayed` | All versions shown |
| `apps/web/src/__tests__/versions.test.ts` | `rollback creates new version` | New version created |

### Test Coverage Requirements
- 100% coverage on toggle propagation logic
- 100% coverage on bundle upload flow
- All version management scenarios tested

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `toggle propagation` | Enabled skill | 1. Disable skill 2. CLI sync | Skill not synced to client |
| `bulk toggle` | 5 enabled skills | 1. Select all 2. Disable | All 5 disabled |
| `bundle upload` | Create MCP | 1. Drag file 2. Wait for upload | Bundle saved, sha256 shown |
| `bundle replace` | MCP with bundle | 1. Upload new bundle | New bundle, version incremented |
| `audit detail timeline` | Skill with mutations | 1. Open audit detail | All changes shown in order |
| `version rollback` | Skill v3 | 1. Rollback to v1 | v4 created with v1 content |
| `version comparison` | Skill with versions | 1. Compare v1 and v2 | Diff displayed |
| `scope change` | Team-scoped skill | 1. Change to tenant scope | Audit logged, scope updated |

### End-to-End Flows
- Create skill → Edit (v2) → Edit (v3) → Rollback to v1 → Verify v4 has v1 content
- Upload bundle → Disable MCP → CLI sync → MCP not synced → Enable → CLI sync → MCP synced
- Bulk disable → Verify audit log shows all changes

## Toggle Propagation Test

```typescript
// packages/cli/src/__tests__/toggle-sync.integration.test.ts

describe('toggle propagation to CLI sync', () => {
  it('disabled skills not synced', async () => {
    // Enable skill
    await adminApi.updateSkill(skillId, { enabled: true })

    // Sync - should get skill
    let result = await runCli(['sync'])
    expect(result.stdout).toContain('skill-1')

    // Disable skill
    await adminApi.updateSkill(skillId, { enabled: false })

    // Sync again - skill should be removed
    result = await runCli(['sync'])
    expect(result.stdout).toContain('Removing skill-1')

    // Verify not on disk
    const skills = await listLocalSkills()
    expect(skills.find(s => s.name === 'skill-1')).toBeUndefined()
  })

  it('re-enabling syncs skill back', async () => {
    // Start disabled
    await adminApi.updateSkill(skillId, { enabled: false })
    await runCli(['sync'])

    // Re-enable
    await adminApi.updateSkill(skillId, { enabled: true })
    const result = await runCli(['sync'])

    expect(result.stdout).toContain('Syncing skill-1')

    const skills = await listLocalSkills()
    expect(skills.find(s => s.name === 'skill-1')).toBeDefined()
  })
})
```

## Bundle Upload Component

```typescript
// apps/web/src/components/BundleUpload.tsx

'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface BundleUploadProps {
  mcpServerId: string
  onUploadComplete: (bundle: { id: string; sha256: string }) => void
}

export function BundleUpload({ mcpServerId, onUploadComplete }: BundleUploadProps) {
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [sha256, setSha256] = useState<string | null>(null)

  const onDrop = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    const file = files[0]
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append('bundle', file)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.onload = () => {
      setUploading(false)
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText)
        setSha256(result.sha256)
        onUploadComplete(result)
      }
    }

    xhr.open('POST', `/api/admin/mcp/${mcpServerId}/bundle`)
    xhr.send(formData)
  }, [mcpServerId, onUploadComplete])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div {...getRootProps()} className="upload-zone">
      <input {...getInputProps()} />
      {uploading ? (
        <div className="progress">
          <div className="bar" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      ) : sha256 ? (
        <div className="success">
          <span>SHA256: {sha256}</span>
        </div>
      ) : isDragActive ? (
        <p>Drop the bundle here...</p>
      ) : (
        <p>Drag and drop a bundle, or click to select</p>
      )}
    </div>
  )
}
```

## Acceptance Criteria
1. Skills Registry UI with full CRUD operations
2. MCP Server Registry UI with full CRUD operations
3. Toggle enabled/disabled propagates to CLI sync
4. Bundle upload with drag-drop and progress indicator
5. sha256 displayed after successful upload
6. Audit detail shows timeline of changes
7. Version history accessible for skills
8. Rollback creates new version with old content

## Review Checklist
- [ ] Does toggling create an audit log entry?
- [ ] Is bundle upload size limited appropriately?
- [ ] Does rollback preserve the version chain (not destructive)?
- [ ] Can team_admin only manage their team's resources?
- [ ] Is the content editor safe from XSS?
- [ ] Are large bundle downloads streaming?

## Dependencies
- Depends on: Day 15 (Admin UI foundation), Day 2 (Skills API), Day 3 (MCP API)
- Blocks: Day 19 (Dashboard shows resource counts)

## Risk Factors
- **Large bundle upload failures** — Mitigation: Resumable uploads, retry logic
- **Content editor security** — Mitigation: Sanitization, CSP headers
- **Version history growth** — Mitigation: Retention policy, archival
- **Toggle race conditions** — Mitigation: Optimistic locking, conflict resolution
