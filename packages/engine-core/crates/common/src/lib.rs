//! Arkon Common Library
//!
//! Provides shared types and utilities for the Arkon engine:
//! - `Envelope<T>`: Message wrapper with sequence numbers and timestamps
//! - Error types for consistent error handling
//! - Hashing utilities for content addressing

pub mod envelope;
pub mod error;
pub mod hash;

// Re-exports
pub use envelope::{Envelope, EnvelopeBuilder};
pub use error::{ArkonError, Result};
pub use hash::{sha256, sha256_hex};
