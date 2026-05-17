// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

//! Error types for the Arkon engine
//!
//! Provides a unified error type for all engine operations

use thiserror::Error;

/// Result type alias using ArkonError
pub type Result<T> = std::result::Result<T, ArkonError>;

/// Unified error type for Arkon engine operations
#[derive(Debug, Error)]
pub enum ArkonError {
    /// Invalid input or configuration
    #[error("Validation error: {0}")]
    Validation(String),

    /// Resource not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// Operation not permitted
    #[error("Forbidden: {0}")]
    Forbidden(String),

    /// Authentication required or failed
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    /// Resource already exists
    #[error("Conflict: {0}")]
    Conflict(String),

    /// Rate limit exceeded
    #[error("Rate limited: {0}")]
    RateLimited(String),

    /// Serialization/deserialization error
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// I/O error
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),

    /// External service error
    #[error("External service error: {service} - {message}")]
    ExternalService { service: String, message: String },

    /// Timeout error
    #[error("Timeout: {0}")]
    Timeout(String),
}

impl ArkonError {
    /// Create a validation error
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    /// Create a not found error
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    /// Create a forbidden error
    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::Forbidden(msg.into())
    }

    /// Create an unauthorized error
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::Unauthorized(msg.into())
    }

    /// Create a conflict error
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::Conflict(msg.into())
    }

    /// Create a rate limited error
    pub fn rate_limited(msg: impl Into<String>) -> Self {
        Self::RateLimited(msg.into())
    }

    /// Create an internal error
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }

    /// Create an external service error
    pub fn external_service(service: impl Into<String>, message: impl Into<String>) -> Self {
        Self::ExternalService {
            service: service.into(),
            message: message.into(),
        }
    }

    /// Create a timeout error
    pub fn timeout(msg: impl Into<String>) -> Self {
        Self::Timeout(msg.into())
    }

    /// Get the error code for API responses
    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "VALIDATION_ERROR",
            Self::NotFound(_) => "NOT_FOUND",
            Self::Forbidden(_) => "FORBIDDEN",
            Self::Unauthorized(_) => "UNAUTHORIZED",
            Self::Conflict(_) => "CONFLICT",
            Self::RateLimited(_) => "RATE_LIMITED",
            Self::Serialization(_) => "SERIALIZATION_ERROR",
            Self::Io(_) => "IO_ERROR",
            Self::Internal(_) => "INTERNAL_ERROR",
            Self::ExternalService { .. } => "EXTERNAL_SERVICE_ERROR",
            Self::Timeout(_) => "TIMEOUT",
        }
    }

    /// Get the HTTP status code
    pub fn status_code(&self) -> u16 {
        match self {
            Self::Validation(_) => 400,
            Self::NotFound(_) => 404,
            Self::Forbidden(_) => 403,
            Self::Unauthorized(_) => 401,
            Self::Conflict(_) => 409,
            Self::RateLimited(_) => 429,
            Self::Serialization(_) => 400,
            Self::Io(_) => 500,
            Self::Internal(_) => 500,
            Self::ExternalService { .. } => 502,
            Self::Timeout(_) => 504,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let err = ArkonError::validation("Invalid email");
        assert_eq!(err.code(), "VALIDATION_ERROR");
        assert_eq!(err.status_code(), 400);
    }

    #[test]
    fn test_error_display() {
        let err = ArkonError::not_found("User not found");
        assert_eq!(format!("{}", err), "Not found: User not found");
    }

    #[test]
    fn test_external_service_error() {
        let err = ArkonError::external_service("OpenAI", "Rate limit exceeded");
        assert_eq!(
            format!("{}", err),
            "External service error: OpenAI - Rate limit exceeded"
        );
        assert_eq!(err.status_code(), 502);
    }
}
