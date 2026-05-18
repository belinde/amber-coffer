use std::collections::HashMap;
use std::sync::RwLock;

use sqlx::sqlite::SqlitePool;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::services::campaign_storage;

use super::init_pool;

/// Application state: per-campaign SQLite pools and campaign id index.
#[derive(Default)]
pub struct AppState {
    pools: RwLock<HashMap<String, SqlitePool>>,
    id_index: RwLock<HashMap<String, String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn refresh_index(&self, handle: &AppHandle) -> AppResult<()> {
        let index = campaign_storage::build_id_index(handle)?;
        let mut guard = self
            .id_index
            .write()
            .map_err(|_| AppError::Internal("campaign index lock poisoned".into()))?;
        *guard = index;
        Ok(())
    }

    fn storage_uuid_for(&self, handle: &AppHandle, campaign_id: &str) -> AppResult<String> {
        if let Ok(guard) = self.id_index.read() {
            if let Some(uuid) = guard.get(campaign_id) {
                return Ok(uuid.clone());
            }
        }
        self.refresh_index(handle)?;
        let guard = self
            .id_index
            .read()
            .map_err(|_| AppError::Internal("campaign index lock poisoned".into()))?;
        guard
            .get(campaign_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("campaign {campaign_id}")))
    }

    pub fn register_campaign(&self, campaign_id: &str, storage_uuid: &str) {
        if let Ok(mut guard) = self.id_index.write() {
            guard.insert(campaign_id.to_string(), storage_uuid.to_string());
        }
    }

    pub async fn pool_for_campaign(
        &self,
        handle: &AppHandle,
        campaign_id: &str,
    ) -> AppResult<SqlitePool> {
        let storage_uuid = self.storage_uuid_for(handle, campaign_id)?;
        {
            let guard = self
                .pools
                .read()
                .map_err(|_| AppError::Internal("pool map lock poisoned".into()))?;
            if let Some(pool) = guard.get(&storage_uuid) {
                return Ok(pool.clone());
            }
        }

        let folder = campaign_storage::resolve_storage_folder(handle, campaign_id)?;
        let db_path = campaign_storage::database_path(&folder);
        let path_str = db_path
            .to_str()
            .ok_or_else(|| AppError::Internal("invalid database path".into()))?;

        let pool = init_pool(path_str).await?;

        let mut guard = self
            .pools
            .write()
            .map_err(|_| AppError::Internal("pool map lock poisoned".into()))?;
        guard.insert(storage_uuid, pool.clone());
        Ok(pool)
    }

    const ENTITY_TABLES: &'static [&'static str] = &[
        "characters",
        "npcs",
        "locations",
        "factions",
        "items",
        "relationships",
        "sessions",
        "campaign_images",
        "maps",
        "tokens",
        "lore_notes",
        "narrative_seeds",
        "handouts",
    ];

    /// Finds which campaign database contains a row with the given id.
    pub async fn pool_for_entity_id(
        &self,
        handle: &AppHandle,
        entity_id: &str,
    ) -> AppResult<SqlitePool> {
        for campaign in campaign_storage::list_campaigns(handle)? {
            let pool = self.pool_for_campaign(handle, &campaign.id).await?;
            for table in Self::ENTITY_TABLES {
                let query = format!("SELECT 1 FROM {table} WHERE id = ?");
                let found: Option<i64> = sqlx::query_scalar(&query)
                    .bind(entity_id)
                    .fetch_optional(&pool)
                    .await?;
                if found.is_some() {
                    return Ok(pool);
                }
            }
        }
        Err(AppError::NotFound(format!("entity {entity_id}")))
    }
}
