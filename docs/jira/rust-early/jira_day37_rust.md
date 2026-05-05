# TAG-37-RUST: Tool System with Rust Parallel Execution

## Description

**Suggested Points:** 10 (High — tool registration, augmentation, and parallel execution using existing Rust engine; reduced from 13 because vectors crate already exists)

**Track:** Rust Early

## Objective

Implement the tool system architecture using the existing Rust engine for parallel execution. Since the Rust vectors and common crates already exist from Week 2, this ticket focuses on adding the tools crate and integrating it with the tool registration system.

## Requirements

### Rust Tools Crate (New)

```rust
// packages/engine-core/crates/tools/Cargo.toml
[package]
name = "tools"
version.workspace = true
edition.workspace = true

[dependencies]
common = { path = "../common" }
rayon = "1.8"
serde.workspace = true
tokio.workspace = true
tracing.workspace = true

// packages/engine-core/crates/tools/src/lib.rs
pub mod executor;
pub mod registry;
pub mod sandbox;

pub use executor::{ToolExecutor, ToolResult};
pub use registry::ToolRegistry;
```

### Parallel Tool Executor

```rust
// packages/engine-core/crates/tools/src/executor.rs
use rayon::prelude::*;
use std::time::{Duration, Instant};
use common::Envelope;

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct ToolResult {
    pub id: String,
    pub name: String,
    pub status: ToolStatus,
    pub output: String,
    pub duration_ms: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ToolStatus {
    Success,
    Error,
    Timeout,
}

pub struct ToolExecutor {
    max_workers: usize,
    timeout: Duration,
    registry: Arc<ToolRegistry>,
}

impl ToolExecutor {
    pub fn new(max_workers: usize, timeout_secs: u64) -> Self {
        Self {
            max_workers,
            timeout: Duration::from_secs(timeout_secs),
            registry: Arc::new(ToolRegistry::new()),
        }
    }

    pub fn execute_batch(&self, calls: Vec<ToolCall>) -> Vec<ToolResult> {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(self.max_workers.min(calls.len()))
            .build()
            .expect("Failed to create thread pool");

        pool.install(|| {
            calls
                .par_iter()
                .map(|call| self.execute_single(call))
                .collect()
        })
    }

    fn execute_single(&self, call: &ToolCall) -> ToolResult {
        let start = Instant::now();

        let result = match self.registry.get(&call.name) {
            Some(handler) => {
                match handler.execute(&call.arguments, self.timeout) {
                    Ok(output) => ToolResult {
                        id: call.id.clone(),
                        name: call.name.clone(),
                        status: ToolStatus::Success,
                        output,
                        duration_ms: start.elapsed().as_millis() as u32,
                    },
                    Err(e) if e.is_timeout() => ToolResult {
                        id: call.id.clone(),
                        name: call.name.clone(),
                        status: ToolStatus::Timeout,
                        output: format!("Tool timed out after {:?}", self.timeout),
                        duration_ms: start.elapsed().as_millis() as u32,
                    },
                    Err(e) => ToolResult {
                        id: call.id.clone(),
                        name: call.name.clone(),
                        status: ToolStatus::Error,
                        output: format!("Error: {}", e),
                        duration_ms: start.elapsed().as_millis() as u32,
                    },
                }
            }
            None => ToolResult {
                id: call.id.clone(),
                name: call.name.clone(),
                status: ToolStatus::Error,
                output: format!("Unknown tool: {}", call.name),
                duration_ms: start.elapsed().as_millis() as u32,
            },
        };

        tracing::info!(
            tool = %call.name,
            status = ?result.status,
            duration_ms = result.duration_ms,
            "Tool execution complete"
        );

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parallel_execution_faster_than_sequential() {
        let executor = ToolExecutor::new(8, 30);

        // Create 8 "slow" tool calls
        let calls: Vec<_> = (0..8)
            .map(|i| ToolCall {
                id: format!("call-{}", i),
                name: "slow_tool".into(),
                arguments: serde_json::json!({"sleep_ms": 100}),
            })
            .collect();

        let start = Instant::now();
        let results = executor.execute_batch(calls);
        let duration = start.elapsed();

        assert_eq!(results.len(), 8);
        // Parallel should take ~100ms, not 800ms
        assert!(duration.as_millis() < 300);
    }

    #[test]
    fn error_isolation() {
        let executor = ToolExecutor::new(4, 30);

        let calls = vec![
            ToolCall { id: "1".into(), name: "good_tool".into(), arguments: json!({}) },
            ToolCall { id: "2".into(), name: "bad_tool".into(), arguments: json!({}) },
            ToolCall { id: "3".into(), name: "good_tool".into(), arguments: json!({}) },
        ];

        let results = executor.execute_batch(calls);

        // One failure shouldn't affect others
        assert_eq!(results[0].status, ToolStatus::Success);
        assert_eq!(results[1].status, ToolStatus::Error);
        assert_eq!(results[2].status, ToolStatus::Success);
    }
}
```

### NAPI Bindings for Tools

```rust
// packages/engine-core/crates/napi/src/lib.rs additions

#[napi(object)]
pub struct JsToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String, // JSON string
}

#[napi(object)]
pub struct JsToolResult {
    pub id: String,
    pub name: String,
    pub status: String, // "success" | "error" | "timeout"
    pub output: String,
    pub duration_ms: u32,
}

#[napi]
pub fn execute_tools_parallel(
    calls: Vec<JsToolCall>,
    max_workers: u32,
    timeout_secs: u32,
) -> Vec<JsToolResult> {
    let executor = tools::ToolExecutor::new(
        max_workers as usize,
        timeout_secs as u64,
    );

    let rust_calls: Vec<tools::ToolCall> = calls
        .into_iter()
        .map(|c| tools::ToolCall {
            id: c.id,
            name: c.name,
            arguments: serde_json::from_str(&c.arguments).unwrap_or_default(),
        })
        .collect();

    executor
        .execute_batch(rust_calls)
        .into_iter()
        .map(|r| JsToolResult {
            id: r.id,
            name: r.name,
            status: match r.status {
                tools::ToolStatus::Success => "success".into(),
                tools::ToolStatus::Error => "error".into(),
                tools::ToolStatus::Timeout => "timeout".into(),
            },
            output: r.output,
            duration_ms: r.duration_ms,
        })
        .collect()
}
```

### TypeScript Tool Registration

```typescript
// packages/agent-tools/src/toolbox.ts
import { executeToolsParallel, JsToolCall, JsToolResult } from '@tag/engine-napi'

interface ToolDefinition {
  name: string
  description: string
  parameters: JSONSchema
  handler: (args: unknown) => Promise<string>
}

export class Toolbox {
  private tools: Map<string, ToolDefinition> = new Map()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  async executeParallel(
    calls: ToolCall[],
    options: { maxWorkers?: number; timeoutSecs?: number } = {},
  ): Promise<ToolResult[]> {
    const { maxWorkers = 8, timeoutSecs = 30 } = options

    // Convert to NAPI format
    const jsCalls: JsToolCall[] = calls.map(c => ({
      id: c.id,
      name: c.function.name,
      arguments: c.function.arguments,
    }))

    // Execute in Rust
    const results = executeToolsParallel(jsCalls, maxWorkers, timeoutSecs)

    return results.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status as 'success' | 'error' | 'timeout',
      output: r.output,
      durationMs: r.duration_ms,
    }))
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }
}
```

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `crates/tools/src/executor.rs` | `parallel faster than sequential` | < 1/4 time |
| `crates/tools/src/executor.rs` | `error isolation` | Others succeed |
| `crates/tools/src/executor.rs` | `respects max workers` | Limited concurrency |
| `crates/tools/src/executor.rs` | `timeout handling` | Returns timeout status |
| `crates/napi/src/lib.rs` | `napi calls rust executor` | Results returned |
| `packages/agent-tools/src/__tests__/toolbox.test.ts` | `registers tools` | Tools available |

## Acceptance Criteria

1. Rust tools crate with parallel executor
2. NAPI bindings for TypeScript
3. 8-worker parallel execution
4. Error isolation (one failure doesn't affect others)
5. Timeout handling per tool
6. Tracing integration for observability
7. TypeScript Toolbox wrapper

## Dependencies

- Depends on: Day 4 (Rust crate structure exists)
- Blocks: Day 38 (Oracle loop uses tools)

## Points Reduction Note

This ticket is **10 points instead of 13** because:
- Rust workspace already exists (Day 1)
- NAPI build pipeline already works (Day 3)
- Common types (Envelope) already defined
- Only need to add tools crate, not build from scratch
