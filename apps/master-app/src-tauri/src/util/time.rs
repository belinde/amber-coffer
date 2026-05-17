use std::time::{SystemTime, UNIX_EPOCH};

/// Unix timestamp in milliseconds (matches `Timestamp` in `packages/shared`).
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before UNIX epoch")
        .as_millis() as i64
}
