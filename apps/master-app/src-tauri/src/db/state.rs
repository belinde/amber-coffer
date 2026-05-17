use sqlx::sqlite::SqlitePool;

/// Shared application state: authoritative SQLite pool for the local campaign vault.
#[derive(Clone)]
pub struct AppState {
    pool: SqlitePool,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
