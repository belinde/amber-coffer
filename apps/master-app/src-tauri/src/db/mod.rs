pub mod recording_state;
pub mod transcription_state;
mod state;
pub mod validate;

pub use recording_state::{RecordingRuntime, RecordingState};
pub use transcription_state::{TranscriptionRuntime, TranscriptionState};
pub use state::AppState;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::str::FromStr;
use tracing::info;

use crate::error::AppResult;

/// Opens (or creates) a per-campaign `database.db` and runs pending migrations.
pub async fn init_pool(database_path: &str) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::from_str(database_path)?
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    info!(path = database_path, "database initialized");
    Ok(pool)
}
