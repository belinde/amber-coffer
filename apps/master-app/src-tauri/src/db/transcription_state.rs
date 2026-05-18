use std::process::Child;
use std::sync::Mutex;

/// Active Whisper sidecar child for the current transcription job.
pub struct TranscriptionRuntime {
    pub session_id: String,
    /// `None` while the sidecar process is still being spawned on a worker thread.
    pub child: Option<Child>,
}

pub struct TranscriptionState(pub Mutex<Option<TranscriptionRuntime>>);

impl TranscriptionState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}
