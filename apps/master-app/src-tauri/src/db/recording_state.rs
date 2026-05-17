use std::process::Child;
use std::sync::Mutex;

/// Active Discord bot child process for the current recording session.
pub struct RecordingRuntime {
    pub session_id: String,
    pub child: Child,
}

pub struct RecordingState(pub Mutex<Option<RecordingRuntime>>);

impl RecordingState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}
