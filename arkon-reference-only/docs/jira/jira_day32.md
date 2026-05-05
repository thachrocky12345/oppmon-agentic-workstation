# TAG-32: Admin Custom Views & File Uploads

## Description

**Suggested Points:** 5 (Medium — implementing custom admin views for file uploads, CSV processing, and report generation; patterns from Lumy-Backend's certn_access_fees admin)

## Objective

Implement custom admin views for file upload workflows, CSV report processing, and data import/export functionality, following the patterns established in Lumy-Backend's AccessFeeAdmin with its report upload view.

## Requirements

### Custom Admin Views Framework
- Add custom URLs to admin routes
- File upload with validation (size, type)
- Progress indication for large files
- Error handling with user feedback

### CSV Report Upload (Pattern from Lumy-Backend)
```typescript
// Pattern: certn_access_fees/admin.py upload_report_view

interface UploadConfig {
  maxSize: number  // bytes
  allowedTypes: string[]
  requiredColumns: string[]
  processorFn: (rows: any[]) => Promise<ProcessResult>
}

const reportUploadConfigs: Record<string, UploadConfig> = {
  'certn-report': {
    maxSize: 10 * 1024 * 1024,  // 10MB
    allowedTypes: ['text/csv', 'application/vnd.ms-excel'],
    requiredColumns: ['certn_id', 'email', 'status', 'amount'],
    processorFn: processCertnReport,
  },
  'bulk-skills': {
    maxSize: 5 * 1024 * 1024,  // 5MB
    allowedTypes: ['text/csv'],
    requiredColumns: ['name', 'content', 'team_id'],
    processorFn: processBulkSkills,
  },
}
```

### File Upload Validation
- Size limit enforcement (configurable per upload type)
- MIME type validation
- Column header verification for CSVs
- Malicious content detection

### Report Processing Pipeline
1. Upload file to temporary storage
2. Validate format and headers
3. Parse and transform data
4. Validate each row
5. Batch insert/update with transaction
6. Generate summary report
7. Clean up temporary file

### Export Functionality
- Export selected records to CSV
- Export filtered list to CSV
- Include/exclude column selection
- Large dataset streaming

## Implementation Notes
- Backend: Custom routes in `apps/api/src/admin/views/`
- Frontend: Upload components with drag-drop
- CLI: N/A
- Database: Temporary storage for processing

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/admin/views/__tests__/upload.test.ts` | `rejects oversized file` | 413 error |
| `apps/api/src/admin/views/__tests__/upload.test.ts` | `rejects invalid type` | 415 error |
| `apps/api/src/admin/views/__tests__/upload.test.ts` | `validates CSV headers` | Error on missing column |
| `apps/api/src/admin/views/__tests__/upload.test.ts` | `processes valid CSV` | Records created |
| `apps/api/src/admin/views/__tests__/upload.test.ts` | `rolls back on error` | No partial data |
| `apps/api/src/admin/views/__tests__/export.test.ts` | `exports selected records` | CSV with correct rows |
| `apps/api/src/admin/views/__tests__/export.test.ts` | `streams large datasets` | No memory issues |

### Test Coverage Requirements
- 100% coverage on validation logic
- All error scenarios tested
- Large file handling tested

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `upload valid CSV` | Empty database | 1. Upload CSV 2. Check records | Records created |
| `upload oversized` | None | 1. Upload 15MB file | 413 error |
| `upload wrong type` | None | 1. Upload .exe file | 415 error |
| `upload missing columns` | None | 1. Upload CSV without required col | Error message |
| `partial failure rollback` | None | 1. Upload with invalid row 5 | No records, error |
| `export filtered` | 100 records | 1. Filter 2. Export | Only filtered in CSV |
| `export large dataset` | 100k records | 1. Export all | Streams successfully |

### End-to-End Flows
- Upload CSV → Validate → Process → Summary → Records in database
- Select records → Export → Download CSV → Verify content

## Custom Admin View Implementation

```typescript
// apps/api/src/admin/views/upload-report.ts

import { Router, Request, Response } from 'express'
import multer from 'multer'
import csv from 'csv-parser'
import { Readable } from 'stream'

const router = Router()

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are allowed'))
    }
  },
})

interface ProcessResult {
  total: number
  created: number
  updated: number
  failed: number
  errors: Array<{ row: number; message: string }>
}

router.get('/upload-report', (req: Request, res: Response) => {
  // Render upload form
  res.render('admin/upload-report', {
    title: 'Upload Report',
    acceptedTypes: '.csv',
    maxSize: '10MB',
  })
})

router.post('/upload-report', upload.single('report'), async (req: Request, res: Response) => {
  const adminUser = req.user!

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  const results: ProcessResult = {
    total: 0,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  }

  try {
    // Parse CSV from buffer
    const rows: any[] = []
    const stream = Readable.from(req.file.buffer.toString())

    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject)
    })

    results.total = rows.length

    // Validate required columns
    const requiredColumns = ['certn_id', 'email', 'status', 'amount']
    const headers = Object.keys(rows[0] || {})
    const missing = requiredColumns.filter(col => !headers.includes(col))

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required columns: ${missing.join(', ')}`,
      })
    }

    // Process in transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]

        try {
          const existing = await tx.findFirst('access_fees', {
            where: { certn_id: row.certn_id },
          })

          if (existing) {
            await tx.update('access_fees', existing.id, {
              status: row.status,
              amount: parseFloat(row.amount),
              updated_at: new Date(),
            })
            results.updated++
          } else {
            await tx.insert('access_fees', {
              certn_id: row.certn_id,
              email: row.email,
              status: row.status,
              amount: parseFloat(row.amount),
              tenant_id: req.tenantId,
              created_at: new Date(),
            })
            results.created++
          }
        } catch (error) {
          results.failed++
          results.errors.push({
            row: i + 2, // +2 for header row and 0-index
            message: error.message,
          })
        }
      }

      // Audit log
      await tx.insert('audit_log', {
        tenant_id: req.tenantId,
        resource_type: 'access_fee_import',
        action: 'bulk_import',
        actor_id: adminUser.id,
        before_state: null,
        after_state: results,
        created_at: new Date(),
      })
    })

    // Return results
    res.json({
      success: true,
      message: `Processed ${results.total} rows`,
      results,
    })

  } catch (error) {
    console.error('Report upload failed:', error)
    res.status(500).json({
      error: 'Failed to process report',
      message: error.message,
    })
  }
})

export default router
```

## Export Implementation

```typescript
// apps/api/src/admin/views/export.ts

import { Router, Request, Response } from 'express'
import { stringify } from 'csv-stringify'
import { pipeline } from 'stream/promises'

const router = Router()

router.get('/export/:resource', async (req: Request, res: Response) => {
  const { resource } = req.params
  const { ids, filters, columns } = req.query

  // Validate resource
  const allowedResources = ['skills', 'mcp_servers', 'events', 'audit_log']
  if (!allowedResources.includes(resource)) {
    return res.status(400).json({ error: 'Invalid resource' })
  }

  // Build query
  const query = db.select(resource)
    .where({ tenant_id: req.tenantId })

  // Filter by IDs if provided
  if (ids) {
    const idList = (ids as string).split(',')
    query.whereIn('id', idList)
  }

  // Apply additional filters
  if (filters) {
    const parsed = JSON.parse(filters as string)
    Object.entries(parsed).forEach(([key, value]) => {
      query.where(key, value)
    })
  }

  // Select specific columns if provided
  if (columns) {
    const columnList = (columns as string).split(',')
    query.select(columnList)
  }

  // Set response headers for CSV download
  const filename = `${resource}_export_${Date.now()}.csv`
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  // Stream results to CSV
  const stringifier = stringify({ header: true })

  // Use cursor-based streaming for large datasets
  const cursor = query.stream()

  await pipeline(
    cursor,
    stringifier,
    res
  )
})

export default router
```

## Acceptance Criteria
1. Custom admin URLs registered correctly
2. File upload validates size and type
3. CSV column validation before processing
4. Batch processing with transaction rollback
5. Progress indication for large uploads
6. Export streams without memory issues
7. Audit log captures all import operations
8. Error messages are clear and actionable

## Review Checklist
- [ ] Is file upload size limit enforced at network level too?
- [ ] Are temporary files cleaned up after processing?
- [ ] Does CSV parsing handle different encodings?
- [ ] Is the transaction truly atomic (all or nothing)?
- [ ] Does export handle special characters in CSV?
- [ ] Is there a rate limit on upload endpoints?

## Dependencies
- Depends on: Day 29 (Admin action framework)
- Blocks: Day 33 (Runbooks include import/export procedures)

## Risk Factors
- **Large file memory pressure** — Mitigation: Streaming, chunked processing
- **Malicious file upload** — Mitigation: Strict type checking, virus scanning
- **Long-running imports blocking** — Mitigation: Background job queue
- **Export timeout** — Mitigation: Streaming, pagination limits
