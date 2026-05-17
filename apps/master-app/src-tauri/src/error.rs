use serde::Serialize;
use thiserror::Error;

use crate::validation_issue::ValidationIssue;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("validation failed")]
    Validation(Vec<ValidationIssue>),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("internal error: {0}")]
    Internal(String),

    #[error("not implemented: {0}")]
    NotImplemented(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload<'a> {
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    issues: Option<&'a [ValidationIssue]>,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let payload = match self {
            AppError::Validation(issues) => ErrorPayload {
                kind: "validation",
                message: None,
                issues: Some(issues.as_slice()),
            },
            other => ErrorPayload {
                kind: "message",
                message: Some(&other.to_string()),
                issues: None,
            },
        };
        payload.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
