# TAG-01-RUST: Repo + DB + Auth Shell + Rust Workspace

## Description

**Suggested Points:** 8 (High — monorepo setup with both npm and Cargo workspaces, PostgreSQL with pgvector, OAuth/JWT auth, Rust core crate foundation)

**Track:** Rust Early

## Objective

Bootstrap the Team AI Gateway monorepo with dual workspace configuration (npm + Cargo), PostgreSQL database with pgvector extension, OAuth 2.0 authentication with JWT tokens, and foundational Rust crates for the high-performance engine.

## Requirements

### Monorepo Structure

```
team-ai-gateway/
├── package.json              # npm workspace root
├── pnpm-workspace.yaml
├── turbo.json
│
├── packages/
│   ├── engine-core/          # Rust workspace root
│   │   ├── Cargo.toml        # Workspace manifest
│   │   ├── crates/
│   │   │   ├── common/       # Shared types, Envelope<T>
│   │   │   │   ├── Cargo.toml
│   │   │   │   └── src/
│   │   │   │       ├── lib.rs
│   │   │   │       ├── envelope.rs
│   │   │   │       ├── error.rs
│   │   │   │       └── hash.rs
│   │   │   │
│   │   │   └── napi/         # Node.js bindings (stub)
│   │   │       ├── Cargo.toml
│   │   │       └── src/lib.rs
│   │   │
│   │   └── target/           # Rust build artifacts
│   │
│   ├── database/             # Prisma schema + migrations
│   ├── shared/               # TypeScript shared types
│   └── tsconfig/             # Shared TS configs
│
├── apps/
│   ├── api/                  # NestJS/Express API
│   └── web/                  # React admin frontend
│
├── .github/
│   └── workflows/
│       ├── ci.yml            # TypeScript CI
│       └── rust.yml          # Rust CI
│
└── docker-compose.yml
```

### Cargo Workspace Configuration

```toml
# packages/engine-core/Cargo.toml
[workspace]
members = ["crates/*"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
repository = "https://github.com/team/team-ai-gateway"

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
```

### Common Crate (Foundation)

```rust
// packages/engine-core/crates/common/Cargo.toml
[package]
name = "common"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
thiserror.workspace = true

// packages/engine-core/crates/common/src/lib.rs
pub mod envelope;
pub mod error;
pub mod hash;

pub use envelope::Envelope;
pub use error::EngineError;
```

### Envelope Type (Message Wrapper)

```rust
// packages/engine-core/crates/common/src/envelope.rs
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Generic message wrapper with sequence and timestamps.
/// Used for all inter-process communication.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope<T> {
    /// Monotonic sequence number
    pub seq: u64,
    /// Event timestamp (microseconds since epoch)
    pub ts_event_us: u64,
    /// Receive timestamp (microseconds since epoch)
    pub ts_recv_us: u64,
    /// Payload
    pub payload: T,
}

impl<T> Envelope<T> {
    pub fn new(seq: u64, payload: T) -> Self {
        let now = Self::now_us();
        Self {
            seq,
            ts_event_us: now,
            ts_recv_us: now,
            payload,
        }
    }

    pub fn mark_received(&mut self) {
        self.ts_recv_us = Self::now_us();
    }

    pub fn latency_us(&self) -> u64 {
        self.ts_recv_us.saturating_sub(self.ts_event_us)
    }

    fn now_us() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_envelope_roundtrip() {
        let env = Envelope::new(1, "test payload");
        let json = serde_json::to_string(&env).unwrap();
        let parsed: Envelope<&str> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.seq, 1);
    }

    #[test]
    fn test_latency_calculation() {
        let mut env = Envelope::new(1, ());
        std::thread::sleep(std::time::Duration::from_millis(10));
        env.mark_received();
        assert!(env.latency_us() >= 10_000); // At least 10ms
    }
}
```

### Database Schema (Unchanged from Original)

```prisma
// packages/database/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  teams     Team[]
  users     User[]
}

model Team {
  id        String   @id @default(cuid())
  name      String
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  createdAt DateTime @default(now())
  members   TeamMember[]
  skills    Skill[]
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  role         Role     @default(MEMBER)
  createdAt    DateTime @default(now())
  memberships  TeamMember[]
}

model TeamMember {
  id       String   @id @default(cuid())
  userId   String
  teamId   String
  role     TeamRole @default(MEMBER)
  user     User     @relation(fields: [userId], references: [id])
  team     Team     @relation(fields: [teamId], references: [id])
  joinedAt DateTime @default(now())

  @@unique([userId, teamId])
}

enum Role {
  TENANT_ADMIN
  TEAM_ADMIN
  MEMBER
}

enum TeamRole {
  ADMIN
  MEMBER
}
```

### Rust CI Pipeline

```yaml
# .github/workflows/rust.yml
name: Rust CI

on:
  push:
    paths:
      - 'packages/engine-core/**'
      - '.github/workflows/rust.yml'
  pull_request:
    paths:
      - 'packages/engine-core/**'

env:
  CARGO_TERM_COLOR: always

jobs:
  check:
    name: Check & Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/engine-core
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: packages/engine-core

      - name: Check formatting
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --all-targets -- -D warnings

      - name: Test
        run: cargo test --all

      - name: Doc
        run: cargo doc --no-deps
```

## Implementation Notes

- **Backend:** NestJS API + Prisma (TypeScript), Rust engine crates
- **Frontend:** React + Vite (deferred to later days)
- **CLI:** Deferred to Day 5
- **Database:** PostgreSQL 15+ with pgvector extension
- **Rust:** Cargo workspace with common crate

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/auth/__tests__/jwt.test.ts` | `validates JWT signature` | Rejects tampered token |
| `apps/api/src/auth/__tests__/jwt.test.ts` | `extracts tenant_id from claims` | Correct extraction |
| `apps/api/src/auth/__tests__/jwt.test.ts` | `rejects expired token` | 401 response |
| `crates/common/src/envelope.rs` | `roundtrip serialization` | JSON matches |
| `crates/common/src/envelope.rs` | `latency calculation` | Correct microseconds |
| `crates/common/src/envelope.rs` | `mark_received updates ts` | ts_recv_us changes |

### Test Coverage Requirements

- 100% coverage on Envelope<T> methods
- JWT validation edge cases covered
- Database connection pooling verified

## Integration Tests

### Required Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `OAuth callback` | Mock OAuth provider | 1. Redirect 2. Callback 3. Token | JWT issued |
| `GET /api/me` | Valid JWT | 1. Request with token | User profile returned |
| `Rust crate compiles` | Cargo workspace | 1. `cargo build` | Success |
| `Rust tests pass` | Cargo workspace | 1. `cargo test` | All green |

### End-to-End Flows

- OAuth login → JWT issued → /api/me returns profile
- Rust workspace builds without errors

## Acceptance Criteria

1. Monorepo with pnpm + turbo configured
2. Cargo workspace with common crate
3. PostgreSQL + pgvector running in Docker
4. Prisma schema applied and client generated
5. OAuth 2.0 flow working (Google or GitHub)
6. JWT tokens issued with tenant_id claim
7. /api/me endpoint returning user profile
8. Rust CI pipeline running on PRs
9. Envelope<T> type with tests passing

## Review Checklist

- [ ] Are both npm and Cargo lockfiles committed?
- [ ] Is pgvector extension enabled in migrations?
- [ ] Are JWT secrets in environment variables (not code)?
- [ ] Does Rust CI fail on clippy warnings?
- [ ] Is the Envelope type documented?
- [ ] Are workspace dependencies properly shared?

## Dependencies

- Depends on: None (Day 1)
- Blocks: All subsequent days

## Risk Factors

- **Dual workspace complexity** — Mitigation: Clear documentation, CI validates both
- **NAPI build issues** — Mitigation: Start with stub, full NAPI in Day 5
- **pgvector compatibility** — Mitigation: Pin PostgreSQL and pgvector versions
