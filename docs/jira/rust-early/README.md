# Rust Early Track

This folder contains **alternative JIRA tickets** for teams that want to introduce Rust in Week 2 instead of Week 7.

## Overview

| Track | Rust Introduced | Trade-off |
|-------|-----------------|-----------|
| **Original** | Week 7 (Day 45) | Faster initial velocity, simpler debugging |
| **Rust Early** | Week 2 (Day 3) | Performance from day 1, avoid rewrites |

## When to Use This Track

Choose Rust Early if:
- Team has Rust experience
- Performance is a day-1 requirement
- Need deterministic replay for compliance
- Expecting > 50 concurrent users at launch

## Files in This Folder

| File | Replaces | Key Changes |
|------|----------|-------------|
| `jira_day01_rust.md` | `../jira_day01.md` | +Cargo workspace, +common crate |
| `jira_day03_rust.md` | `../jira_day03.md` | +Rust hashing (SHA256/BLAKE3) |
| `jira_day04_rust.md` | `../jira_day04.md` | +Rust vectors, MMR, batch ops |
| `jira_day05_rust.md` | `../jira_day05.md` | +NAPI bindings, engine wrapper |
| `jira_day08_rust.md` | `../jira_day08.md` | Sync uses Rust verification |
| `jira_day45_go_only.md` | `../jira_day45.md` | Go only (Rust already exists) |

## Architecture Difference

### Original Track (Week 7)
```
Weeks 1-6: TypeScript only
Week 7:    Add Go + Rust

Node.js API → PostgreSQL → pgvector
```

### Rust Early Track (Week 2)
```
Week 1:   TypeScript + Rust core crate
Week 2+:  All ops use Rust via NAPI

Node.js API → Rust Engine (NAPI) → PostgreSQL
```

## Rust Crate Structure

```
packages/engine-core/
├── Cargo.toml (workspace)
├── crates/
│   ├── common/      # Week 1: Envelope<T>, hashing
│   ├── vectors/     # Week 2: Similarity, MMR, batch
│   ├── tools/       # Week 6: Parallel execution
│   └── napi/        # Week 2: Node.js bindings
└── target/
```

## How to Switch Tracks

1. **Before starting:** Choose track, communicate to team
2. **During development:** Use tickets from this folder instead of parent
3. **Week 7:** Day 45 becomes Go-only (Rust already done)

## Points Comparison

| Week | Original | Rust Early | Difference |
|------|----------|------------|------------|
| 1 | 42 | 45 (+3) | Cargo setup |
| 2 | 36 | 38 (+2) | NAPI integration |
| 3-5 | 100 | 100 (same) | No change |
| 6 | 58 | 55 (-3) | Rust already exists |
| 7 | 48 | 43 (-5) | Go only |
| **Total** | **284** | **281** | -3 points |

The total is similar because Rust work is redistributed, not added.

## CI/CD Changes

With Rust Early, CI needs:

```yaml
# Additional workflow: .github/workflows/rust.yml
jobs:
  rust-check:
    runs-on: ubuntu-latest
    steps:
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo fmt --check
      - run: cargo clippy -- -D warnings
      - run: cargo test

  napi-build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - run: npm run build:napi
      - uses: actions/upload-artifact@v4
```

## Team Requirements

Rust Early track requires:
- At least **1 developer** comfortable with Rust
- CI/CD that can build **native modules**
- Understanding of **FFI/NAPI debugging**

## Questions?

See `ALTERNATIVE_RUST_EARLY.md` in the parent folder for detailed architecture comparison and decision framework.
