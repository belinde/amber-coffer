use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub path: Vec<String>,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Map<String, serde_json::Value>>,
}

impl ValidationIssue {
    pub fn new(path: &[&str], code: &str) -> Self {
        Self {
            path: path.iter().map(|s| (*s).to_string()).collect(),
            code: code.to_string(),
            params: None,
        }
    }

    pub fn with_min(path: &[&str], min: i64) -> Self {
        let mut params = serde_json::Map::new();
        params.insert("min".into(), serde_json::json!(min));
        Self {
            path: path.iter().map(|s| (*s).to_string()).collect(),
            code: "string.min_length".into(),
            params: Some(params),
        }
    }
}

pub fn validation_issues(issues: Vec<ValidationIssue>) -> crate::error::AppError {
    crate::error::AppError::Validation(issues)
}

pub fn required_field(path: &[&str]) -> crate::error::AppError {
    validation_issues(vec![ValidationIssue::with_min(path, 1)])
}

pub fn enum_invalid(path: &[&str]) -> crate::error::AppError {
    validation_issues(vec![ValidationIssue::new(path, "enum.invalid")])
}

pub fn generic_invalid(path: &[&str]) -> crate::error::AppError {
    validation_issues(vec![ValidationIssue::new(path, "generic.invalid")])
}
