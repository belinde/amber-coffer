use tauri::State;
use uuid::Uuid;

use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::required_field;
use crate::models::{Campaign, CreateCampaignInput, UpdateCampaignInput};
use crate::util::{now_ms, slugify};

#[tauri::command]
pub async fn list_campaigns(state: State<'_, AppState>) -> Result<Vec<Campaign>, AppError> {
    let rows = sqlx::query_as::<_, Campaign>(
        r#"
        SELECT id, name, slug, description, discord_channel_id, created_at, updated_at, version
        FROM campaigns
        ORDER BY name COLLATE NOCASE
        "#,
    )
    .fetch_all(state.pool())
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn get_campaign(id: String, state: State<'_, AppState>) -> Result<Option<Campaign>, AppError> {
    let row = sqlx::query_as::<_, Campaign>(
        r#"
        SELECT id, name, slug, description, discord_channel_id, created_at, updated_at, version
        FROM campaigns
        WHERE id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(state.pool())
    .await?;

    Ok(row)
}

#[tauri::command]
pub async fn create_campaign(
    input: CreateCampaignInput,
    state: State<'_, AppState>,
) -> Result<Campaign, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let base_slug = slugify(name);
    let slug = unique_campaign_slug(state.pool(), &base_slug).await?;

    sqlx::query(
        r#"
        INSERT INTO campaigns (id, name, slug, description, discord_channel_id, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(name)
    .bind(&slug)
    .bind(&input.description)
    .bind(&input.discord_channel_id)
    .bind(now)
    .bind(now)
    .execute(state.pool())
    .await?;

    get_campaign(id, state)
        .await?
        .ok_or_else(|| AppError::Internal("campaign insert succeeded but row missing".into()))
}

async fn unique_campaign_slug(pool: &sqlx::SqlitePool, base: &str) -> Result<String, AppError> {
    let mut candidate = base.to_string();
    if candidate.is_empty() {
        candidate = "campaign".to_string();
    }

    for attempt in 0..8 {
        let slug = if attempt == 0 {
            candidate.clone()
        } else {
            format!("{}-{}", candidate, Uuid::now_v7().simple())
        };

        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM campaigns WHERE slug = ?")
            .bind(&slug)
            .fetch_optional(pool)
            .await?;

        if exists.is_none() {
            return Ok(slug);
        }
    }

    Err(AppError::Internal("could not allocate unique campaign slug".into()))
}

#[tauri::command]
pub async fn update_campaign(
    input: UpdateCampaignInput,
    state: State<'_, AppState>,
) -> Result<Campaign, AppError> {
    let now = now_ms();
    let channel = input
        .discord_channel_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let result = sqlx::query(
        r#"
        UPDATE campaigns
        SET discord_channel_id = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(&channel)
    .bind(now)
    .bind(&input.id)
    .execute(state.pool())
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("campaign {}", input.id)));
    }

    get_campaign(input.id, state)
        .await?
        .ok_or_else(|| AppError::Internal("campaign update succeeded but row missing".into()))
}
