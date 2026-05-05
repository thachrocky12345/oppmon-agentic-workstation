# TAG-03-RUST: MCP Servers + Bundle Storage + Rust Hashing

## Description

**Suggested Points:** 10 (High — MCP server registry, bundle storage with multiple backends, SHA256/BLAKE3 verification in Rust for supply chain security)

**Track:** Rust Early

## Objective

Implement MCP (Model Context Protocol) server registry with bundle storage abstraction, using Rust for cryptographic hashing to ensure consistent, high-performance verification across all components.

## Requirements

### Rust Hash Module

```rust
// packages/engine-core/crates/common/Cargo.toml
[dependencies]
sha2 = "0.10"
blake3 = "1.5"
hex = "0.4"

// packages/engine-core/crates/common/src/hash.rs
use sha2::{Sha256, Digest};

/// Compute SHA256 hash and return as lowercase hex string
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Compute BLAKE3 hash (faster, modern) and return as lowercase hex string
pub fn blake3_hex(data: &[u8]) -> String {
    hex::encode(blake3::hash(data).as_bytes())
}

/// Verify SHA256 hash matches expected value
pub fn verify_sha256(data: &[u8], expected: &str) -> bool {
    sha256_hex(data).eq_ignore_ascii_case(expected)
}

/// Verify BLAKE3 hash matches expected value
pub fn verify_blake3(data: &[u8], expected: &str) -> bool {
    blake3_hex(data).eq_ignore_ascii_case(expected)
}

/// Hash a file by reading in chunks (memory efficient)
pub fn sha256_file(path: &std::path::Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_openssl() {
        // echo -n "hello" | openssl sha256
        let expected = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert_eq!(sha256_hex(b"hello"), expected);
    }

    #[test]
    fn blake3_deterministic() {
        let hash1 = blake3_hex(b"test data");
        let hash2 = blake3_hex(b"test data");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn verify_rejects_tampered() {
        let data = b"original content";
        let hash = sha256_hex(data);
        let tampered = b"modified content";
        assert!(!verify_sha256(tampered, &hash));
    }

    #[test]
    fn verify_case_insensitive() {
        let hash_lower = sha256_hex(b"test");
        let hash_upper = hash_lower.to_uppercase();
        assert!(verify_sha256(b"test", &hash_upper));
    }
}
```

### NAPI Bindings for Hash Functions

```rust
// packages/engine-core/crates/napi/Cargo.toml
[package]
name = "engine-napi"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib"]

[dependencies]
common = { path = "../common" }
napi = { version = "2", features = ["napi4"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"

// packages/engine-core/crates/napi/src/lib.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn sha256_hex(data: Buffer) -> String {
    common::hash::sha256_hex(&data)
}

#[napi]
pub fn blake3_hex(data: Buffer) -> String {
    common::hash::blake3_hex(&data)
}

#[napi]
pub fn verify_sha256(data: Buffer, expected: String) -> bool {
    common::hash::verify_sha256(&data, &expected)
}

#[napi]
pub fn verify_blake3(data: Buffer, expected: String) -> bool {
    common::hash::verify_blake3(&data, &expected)
}

#[napi]
pub fn sha256_file(path: String) -> napi::Result<String> {
    common::hash::sha256_file(std::path::Path::new(&path))
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
```

### MCP Server Registry (TypeScript)

```typescript
// packages/database/prisma/schema.prisma additions
model McpServer {
  id          String   @id @default(cuid())
  name        String
  version     String
  description String?
  tenantId    String
  teamId      String?
  scope       Scope    @default(TENANT)

  // Bundle info
  bundleUrl   String?           // S3/Azure URL
  bundleSha256 String?          // Verified with Rust
  bundleSize  Int?

  // Metadata
  tools       Json?             // Tool definitions
  capabilities Json?

  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, name, version])
}

enum Scope {
  TENANT    // Available to all teams
  TEAM      // Only specific team
}
```

### Storage Abstraction

```typescript
// apps/api/src/storage/storage.interface.ts
export interface StorageBackend {
  upload(key: string, data: Buffer, metadata?: Record<string, string>): Promise<UploadResult>
  download(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  getSignedUrl(key: string, expiresIn: number): Promise<string>
}

export interface UploadResult {
  key: string
  url: string
  size: number
  sha256: string  // Computed by Rust
}

// apps/api/src/storage/local.storage.ts
import { sha256Hex } from '@tag/engine-napi'

export class LocalStorage implements StorageBackend {
  constructor(private basePath: string) {}

  async upload(key: string, data: Buffer): Promise<UploadResult> {
    const filePath = path.join(this.basePath, key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, data)

    // Use Rust for hashing
    const sha256 = sha256Hex(data)

    return {
      key,
      url: `file://${filePath}`,
      size: data.length,
      sha256,
    }
  }

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.basePath, key)
    return fs.readFile(filePath)
  }
}

// apps/api/src/storage/s3.storage.ts
import { sha256Hex } from '@tag/engine-napi'

export class S3Storage implements StorageBackend {
  constructor(private client: S3Client, private bucket: string) {}

  async upload(key: string, data: Buffer): Promise<UploadResult> {
    // Compute hash with Rust before upload
    const sha256 = sha256Hex(data)

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      Metadata: { 'x-sha256': sha256 },
    }))

    return {
      key,
      url: `s3://${this.bucket}/${key}`,
      size: data.length,
      sha256,
    }
  }
}
```

### Bundle Upload Endpoint

```typescript
// apps/api/src/mcp/mcp.controller.ts
import { verifySha256 } from '@tag/engine-napi'

@Controller('api/mcp-servers')
export class McpServerController {
  @Post(':id/bundle')
  @UseInterceptors(FileInterceptor('bundle'))
  async uploadBundle(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('expectedSha256') expectedSha256: string,
    @Req() req: AuthenticatedRequest,
  ) {
    // Verify hash with Rust
    if (expectedSha256 && !verifySha256(file.buffer, expectedSha256)) {
      throw new BadRequestException(
        `SHA256 mismatch. Expected: ${expectedSha256}, Got: ${sha256Hex(file.buffer)}`
      )
    }

    const result = await this.storage.upload(
      `bundles/${id}/${file.originalname}`,
      file.buffer,
    )

    await this.mcpService.updateBundle(id, {
      bundleUrl: result.url,
      bundleSha256: result.sha256,
      bundleSize: result.size,
    })

    // Audit log
    await this.auditService.log({
      action: 'mcp.bundle.upload',
      resourceType: 'McpServer',
      resourceId: id,
      tenantId: req.user.tenantId,
      after: { sha256: result.sha256, size: result.size },
    })

    return result
  }
}
```

## Implementation Notes

- **Backend:** MCP CRUD endpoints, storage abstraction
- **Rust:** Hash functions in common crate, NAPI bindings
- **Frontend:** MCP management UI (deferred)
- **CLI:** MCP sync commands (Day 9)
- **Database:** McpServer model with bundle metadata

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `crates/common/src/hash.rs` | `sha256 matches openssl` | Byte-for-byte identical |
| `crates/common/src/hash.rs` | `blake3 deterministic` | Same input = same output |
| `crates/common/src/hash.rs` | `verify rejects tampered` | Returns false |
| `crates/common/src/hash.rs` | `verify case insensitive` | Accepts upper/lower |
| `crates/common/src/hash.rs` | `sha256_file chunks correctly` | Large file hashes correctly |
| `crates/napi/src/lib.rs` | `napi sha256 matches rust` | Identical output |
| `apps/api/src/storage/__tests__/local.test.ts` | `upload computes sha256` | Hash present |
| `apps/api/src/mcp/__tests__/upload.test.ts` | `rejects mismatched hash` | 400 response |

### Test Coverage Requirements

- 100% coverage on Rust hash functions
- All storage backends tested
- NAPI bindings roundtrip verified

## Integration Tests

### Required Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `bundle upload` | MCP server created | 1. Upload bundle 2. Check storage | SHA256 stored |
| `hash verification` | Bundle exists | 1. Download 2. Verify | Hash matches |
| `tampered bundle rejected` | Wrong hash provided | 1. Upload with bad hash | 400 error |
| `NAPI from TypeScript` | NAPI built | 1. Import 2. Call sha256Hex | Hash returned |

### End-to-End Flows

- Create MCP server → Upload bundle (Rust hashes) → Download → Verify (Rust)

## Acceptance Criteria

1. Rust hash module with SHA256 and BLAKE3
2. NAPI bindings callable from TypeScript
3. Storage abstraction with local and S3 backends
4. MCP server CRUD with bundle metadata
5. Upload endpoint verifies hash with Rust
6. Audit logging for bundle operations
7. RBAC enforced on MCP operations
8. Large file hashing works (streaming)

## Review Checklist

- [ ] Are hash functions tested against known values?
- [ ] Does NAPI build for all target platforms?
- [ ] Is storage abstraction properly injected (DI)?
- [ ] Are audit logs created for all mutations?
- [ ] Is the bundle URL not publicly accessible?
- [ ] Does verification use constant-time comparison?

## Dependencies

- Depends on: Day 1 (Rust workspace), Day 2 (RBAC)
- Blocks: Day 5 (CLI NAPI), Day 8 (sync with verification)

## Risk Factors

- **NAPI build complexity** — Mitigation: CI builds for all platforms, prebuild binaries
- **Large file memory** — Mitigation: Streaming hash with sha256_file
- **S3 eventual consistency** — Mitigation: Verify after upload, retry
