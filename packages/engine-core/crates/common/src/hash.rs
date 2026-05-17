// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

//! Hashing utilities
//!
//! Provides SHA-256 hashing for content addressing

use sha2::{Digest, Sha256};

/// Compute SHA-256 hash of bytes
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Compute SHA-256 hash and return as hex string
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(sha256(data))
}

/// Compute SHA-256 hash of a string and return as hex string
pub fn sha256_str(s: &str) -> String {
    sha256_hex(s.as_bytes())
}

/// Verify that data matches expected hash
pub fn verify_hash(data: &[u8], expected_hex: &str) -> bool {
    sha256_hex(data) == expected_hex
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_empty() {
        // SHA-256 of empty string
        let hash = sha256_hex(b"");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_sha256_hello() {
        let hash = sha256_hex(b"hello");
        assert_eq!(
            hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_sha256_str() {
        let hash = sha256_str("hello world");
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_verify_hash() {
        let data = b"test data";
        let hash = sha256_hex(data);
        assert!(verify_hash(data, &hash));
        assert!(!verify_hash(b"wrong data", &hash));
    }

    #[test]
    fn test_sha256_deterministic() {
        let data = b"deterministic test";
        let hash1 = sha256_hex(data);
        let hash2 = sha256_hex(data);
        assert_eq!(hash1, hash2);
    }
}
