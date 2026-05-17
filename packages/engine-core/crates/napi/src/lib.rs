// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

//! Arkon NAPI - Node.js Bindings (Stub)
//!
//! This crate will provide Node.js bindings for the Arkon engine
//! using napi-rs. Currently a stub implementation.
//!
//! ## Planned Exports
//!
//! - `Envelope<T>` - Message wrapper with metadata
//! - `sha256` - SHA-256 hashing function
//! - `ArkonError` - Unified error type
//!
//! ## Implementation Notes
//!
//! Full implementation planned for Day 5 of the roadmap.
//! Will use napi-rs for generating Node.js bindings.

pub use arkon_common::{Envelope, EnvelopeBuilder, ArkonError, Result};
pub use arkon_common::{sha256, sha256_hex};

/// Placeholder for NAPI initialization
/// Will be replaced with actual napi-rs exports
pub fn placeholder() {
    println!("NAPI bindings not yet implemented");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestMessage {
        content: String,
    }

    #[test]
    fn test_reexports() {
        // Verify that re-exports work correctly
        let payload = TestMessage {
            content: "test".to_string(),
        };

        let envelope = Envelope::new(1, payload.clone());
        assert_eq!(envelope.payload, payload);

        let hash = sha256_hex(b"test");
        assert!(!hash.is_empty());
    }
}
