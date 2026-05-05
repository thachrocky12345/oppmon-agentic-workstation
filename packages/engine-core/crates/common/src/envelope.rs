//! Envelope<T> - Message wrapper with metadata
//!
//! The Envelope type wraps any payload with:
//! - Sequence number for ordering
//! - Created/updated timestamps
//! - Content hash for integrity verification
//! - Optional correlation ID for request tracing

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::hash::sha256_hex;

/// Envelope wraps a payload with metadata for message passing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope<T>
where
    T: Serialize,
{
    /// Unique envelope ID
    pub id: Uuid,

    /// Monotonic sequence number
    pub seq: u64,

    /// The wrapped payload
    pub payload: T,

    /// SHA-256 hash of the serialized payload
    pub content_hash: String,

    /// When the envelope was created
    pub created_at: DateTime<Utc>,

    /// When the envelope was last updated
    pub updated_at: DateTime<Utc>,

    /// Optional correlation ID for tracing related messages
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<Uuid>,

    /// Optional source identifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl<T> Envelope<T>
where
    T: Serialize,
{
    /// Create a new envelope with the given sequence number and payload
    pub fn new(seq: u64, payload: T) -> Self {
        let now = Utc::now();
        let content_hash = Self::compute_hash(&payload);

        Self {
            id: Uuid::new_v4(),
            seq,
            payload,
            content_hash,
            created_at: now,
            updated_at: now,
            correlation_id: None,
            source: None,
        }
    }

    /// Create a new envelope with a correlation ID
    pub fn with_correlation(seq: u64, payload: T, correlation_id: Uuid) -> Self {
        let mut envelope = Self::new(seq, payload);
        envelope.correlation_id = Some(correlation_id);
        envelope
    }

    /// Set the source identifier
    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.source = Some(source.into());
        self
    }

    /// Update the payload and refresh metadata
    pub fn update(&mut self, payload: T) {
        self.content_hash = Self::compute_hash(&payload);
        self.payload = payload;
        self.updated_at = Utc::now();
    }

    /// Verify the content hash matches the payload
    pub fn verify(&self) -> bool {
        Self::compute_hash(&self.payload) == self.content_hash
    }

    /// Compute SHA-256 hash of the payload
    fn compute_hash(payload: &T) -> String {
        let json = serde_json::to_string(payload).unwrap_or_default();
        sha256_hex(json.as_bytes())
    }
}

/// Builder for creating Envelopes with optional fields
pub struct EnvelopeBuilder<T>
where
    T: Serialize,
{
    seq: u64,
    payload: T,
    correlation_id: Option<Uuid>,
    source: Option<String>,
}

impl<T> EnvelopeBuilder<T>
where
    T: Serialize,
{
    /// Create a new builder with required fields
    pub fn new(seq: u64, payload: T) -> Self {
        Self {
            seq,
            payload,
            correlation_id: None,
            source: None,
        }
    }

    /// Set the correlation ID
    pub fn correlation_id(mut self, id: Uuid) -> Self {
        self.correlation_id = Some(id);
        self
    }

    /// Set the source identifier
    pub fn source(mut self, source: impl Into<String>) -> Self {
        self.source = Some(source.into());
        self
    }

    /// Build the envelope
    pub fn build(self) -> Envelope<T> {
        let mut envelope = Envelope::new(self.seq, self.payload);
        envelope.correlation_id = self.correlation_id;
        envelope.source = self.source;
        envelope
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestPayload {
        message: String,
        count: i32,
    }

    #[test]
    fn test_envelope_creation() {
        let payload = TestPayload {
            message: "Hello".to_string(),
            count: 42,
        };

        let envelope = Envelope::new(1, payload.clone());

        assert_eq!(envelope.seq, 1);
        assert_eq!(envelope.payload, payload);
        assert!(!envelope.content_hash.is_empty());
        assert!(envelope.correlation_id.is_none());
    }

    #[test]
    fn test_envelope_with_correlation() {
        let payload = TestPayload {
            message: "Test".to_string(),
            count: 1,
        };
        let correlation_id = Uuid::new_v4();

        let envelope = Envelope::with_correlation(1, payload, correlation_id);

        assert_eq!(envelope.correlation_id, Some(correlation_id));
    }

    #[test]
    fn test_envelope_verification() {
        let payload = TestPayload {
            message: "Verify me".to_string(),
            count: 100,
        };

        let envelope = Envelope::new(1, payload);

        assert!(envelope.verify());
    }

    #[test]
    fn test_envelope_update() {
        let payload1 = TestPayload {
            message: "Original".to_string(),
            count: 1,
        };
        let payload2 = TestPayload {
            message: "Updated".to_string(),
            count: 2,
        };

        let mut envelope = Envelope::new(1, payload1);
        let original_hash = envelope.content_hash.clone();
        let original_updated_at = envelope.updated_at;

        // Small delay to ensure timestamp changes
        std::thread::sleep(std::time::Duration::from_millis(10));

        envelope.update(payload2.clone());

        assert_eq!(envelope.payload, payload2);
        assert_ne!(envelope.content_hash, original_hash);
        assert!(envelope.updated_at > original_updated_at);
        assert!(envelope.verify());
    }

    #[test]
    fn test_envelope_builder() {
        let payload = TestPayload {
            message: "Built".to_string(),
            count: 99,
        };
        let correlation_id = Uuid::new_v4();

        let envelope = EnvelopeBuilder::new(5, payload.clone())
            .correlation_id(correlation_id)
            .source("test-source")
            .build();

        assert_eq!(envelope.seq, 5);
        assert_eq!(envelope.payload, payload);
        assert_eq!(envelope.correlation_id, Some(correlation_id));
        assert_eq!(envelope.source, Some("test-source".to_string()));
    }

    #[test]
    fn test_envelope_serialization() {
        let payload = TestPayload {
            message: "Serialize".to_string(),
            count: 7,
        };

        let envelope = Envelope::new(1, payload);
        let json = serde_json::to_string(&envelope).unwrap();
        let deserialized: Envelope<TestPayload> = serde_json::from_str(&json).unwrap();

        assert_eq!(envelope.id, deserialized.id);
        assert_eq!(envelope.seq, deserialized.seq);
        assert_eq!(envelope.payload, deserialized.payload);
        assert_eq!(envelope.content_hash, deserialized.content_hash);
    }
}
