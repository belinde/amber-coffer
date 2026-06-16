use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

/// Active Discord bot child process for the current recording session.
pub struct RecordingRuntime {
    pub session_id: String,
    pub child: Child,
    pub pipeline: Option<LivePipelineRuntime>,
}

/// Live transcription pipeline process spawned alongside the Discord bot.
pub struct LivePipelineRuntime {
    pub session_id: String,
    pub child: Option<Child>,
    pub state_file: PathBuf,
    pub signal_file: PathBuf,
}

pub struct RecordingState(pub Mutex<Option<RecordingRuntime>>);

impl RecordingState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}
