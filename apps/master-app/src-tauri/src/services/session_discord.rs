use serde::Serialize;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::services::character_discord;
use crate::services::recording_ingest::{gm_discord_user_id, GM_SPEAKER_LABEL};
use crate::util::now_ms;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiscordAssignmentView {
    pub id: String,
    pub session_id: String,
    pub discord_user_id: String,
    pub discord_display_name: String,
    pub participant_role: String,
    pub character_id: Option<String>,
    pub character_name: Option<String>,
    pub is_primary: bool,
    pub sort_order: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiscordParticipantView {
    pub discord_user_id: String,
    pub display_name: String,
    pub participant_role: String,
    pub is_gm: bool,
    pub total_duration_ms: i64,
    pub segment_count: i32,
    pub default_character_id: Option<String>,
    pub default_character_name: Option<String>,
    pub assignments: Vec<SessionDiscordAssignmentView>,
}

pub async fn seed_assignments_from_recordings(
    pool: &SqlitePool,
    campaign_id: &str,
    session_id: &str,
) -> AppResult<()> {
    let gm_id = gm_discord_user_id();
    let participants: Vec<(String, String, Option<i64>)> = sqlx::query_as(
        r#"
        SELECT r.user_discord_id,
               COALESCE(
                 (SELECT discord_display_name FROM recording_segments rs
                  WHERE rs.session_id = r.session_id AND rs.discord_user_id = r.user_discord_id
                  LIMIT 1),
                 r.user_discord_id
               ),
               r.duration_ms
        FROM recordings r
        WHERE r.session_id = ?
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    let now = now_ms();

    for (discord_user_id, display_name, _dur) in participants {
        let already: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM session_discord_assignments WHERE session_id = ? AND discord_user_id = ?",
        )
        .bind(session_id)
        .bind(&discord_user_id)
        .fetch_one(pool)
        .await?;

        if already > 0 {
            continue;
        }

        let is_gm = gm_id.as_ref().is_some_and(|g| g == &discord_user_id);
        let role = if is_gm { "gm" } else { "player" };
        let character_id = if is_gm {
            None
        } else {
            resolve_seed_character_id(pool, campaign_id, &discord_user_id).await?
        };

        let id = Uuid::now_v7().to_string();
        sqlx::query(
            r#"
            INSERT INTO session_discord_assignments (
              id, session_id, discord_user_id, discord_display_name, participant_role,
              character_id, is_primary, sort_order, created_at, updated_at, version
            ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 1)
            "#,
        )
        .bind(&id)
        .bind(session_id)
        .bind(&discord_user_id)
        .bind(&display_name)
        .bind(role)
        .bind(&character_id)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn list_participants(
    pool: &SqlitePool,
    campaign_id: &str,
    session_id: &str,
) -> AppResult<Vec<SessionDiscordParticipantView>> {
    let discord_users: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT DISTINCT discord_user_id FROM (
          SELECT user_discord_id AS discord_user_id FROM recordings WHERE session_id = ?
          UNION
          SELECT discord_user_id FROM session_discord_assignments WHERE session_id = ?
        )
        "#,
    )
    .bind(session_id)
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    let mut out = Vec::new();
    for (discord_user_id,) in discord_users {
        let display_name: Option<(String,)> = sqlx::query_as(
            "SELECT discord_display_name FROM session_discord_assignments WHERE session_id = ? AND discord_user_id = ? LIMIT 1",
        )
        .bind(session_id)
        .bind(&discord_user_id)
        .fetch_optional(pool)
        .await?;
        let display_name = display_name
            .map(|(n,)| n)
            .unwrap_or_else(|| discord_user_id.clone());

        let (total_duration_ms,): (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(duration_ms), 0) FROM recordings WHERE session_id = ? AND user_discord_id = ?",
        )
        .bind(session_id)
        .bind(&discord_user_id)
        .fetch_one(pool)
        .await?;

        let (segment_count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM recording_segments WHERE session_id = ? AND discord_user_id = ?",
        )
        .bind(session_id)
        .bind(&discord_user_id)
        .fetch_one(pool)
        .await?;

        let assignments = load_assignments_for_user(pool, session_id, &discord_user_id).await?;
        let participant_role = assignments
            .first()
            .map(|a| a.participant_role.clone())
            .unwrap_or_else(|| "player".to_string());
        let is_gm = participant_role == "gm";

        let default_character = if is_gm {
            None
        } else {
            character_discord::resolve_character_for_discord_user(pool, campaign_id, &discord_user_id)
                .await?
        };

        out.push(SessionDiscordParticipantView {
            discord_user_id: discord_user_id.clone(),
            display_name,
            participant_role: participant_role.clone(),
            is_gm,
            total_duration_ms,
            segment_count: segment_count as i32,
            default_character_id: default_character.as_ref().map(|c| c.character_id.clone()),
            default_character_name: default_character.map(|c| c.name),
            assignments,
        });
    }

    out.sort_by(|a, b| {
        if a.is_gm != b.is_gm {
            return b.is_gm.cmp(&a.is_gm);
        }
        a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase())
    });

    Ok(out)
}

async fn load_assignments_for_user(
    pool: &SqlitePool,
    session_id: &str,
    discord_user_id: &str,
) -> AppResult<Vec<SessionDiscordAssignmentView>> {
    let rows: Vec<(
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        i32,
        i32,
    )> = sqlx::query_as(
        r#"
        SELECT a.id, a.session_id, a.discord_user_id, a.discord_display_name, a.participant_role,
               a.character_id, c.name, a.is_primary, a.sort_order
        FROM session_discord_assignments a
        LEFT JOIN characters c ON c.id = a.character_id
        WHERE a.session_id = ? AND a.discord_user_id = ?
        ORDER BY a.sort_order ASC, a.created_at ASC
        "#,
    )
    .bind(session_id)
    .bind(discord_user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, session_id, discord_user_id, discord_display_name, participant_role, character_id, character_name, is_primary, sort_order)| {
                SessionDiscordAssignmentView {
                    id,
                    session_id,
                    discord_user_id,
                    discord_display_name,
                    participant_role,
                    character_id,
                    character_name,
                    is_primary: is_primary != 0,
                    sort_order,
                }
            },
        )
        .collect())
}

pub async fn upsert_assignment(
    pool: &SqlitePool,
    campaign_id: &str,
    session_id: &str,
    discord_user_id: &str,
    discord_display_name: Option<&str>,
    participant_role: Option<&str>,
    character_id: Option<Option<&str>>,
    is_primary: Option<bool>,
) -> AppResult<SessionDiscordAssignmentView> {
    if let Some(Some(cid)) = character_id {
        let exists: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM characters WHERE id = ? AND campaign_id = ?",
        )
        .bind(cid)
        .bind(campaign_id)
        .fetch_optional(pool)
        .await?;
        if exists.is_none() {
            return Err(AppError::NotFound(format!("character {cid}")));
        }
    }

    let role = participant_role.unwrap_or("player");
    if role == "gm" && character_id.is_some_and(|c| c.is_some()) {
        return Err(AppError::Internal(
            "GM participant cannot be linked to a player character".into(),
        ));
    }

    let now = now_ms();
    let existing: Option<(String,)> = if let Some(Some(cid)) = character_id {
        sqlx::query_as(
            "SELECT id FROM session_discord_assignments WHERE session_id = ? AND discord_user_id = ? AND character_id = ? LIMIT 1",
        )
        .bind(session_id)
        .bind(discord_user_id)
        .bind(cid)
        .fetch_optional(pool)
        .await?
    } else if is_primary == Some(true) {
        sqlx::query_as(
            "SELECT id FROM session_discord_assignments WHERE session_id = ? AND discord_user_id = ? AND is_primary = 1 LIMIT 1",
        )
        .bind(session_id)
        .bind(discord_user_id)
        .fetch_optional(pool)
        .await?
    } else {
        None
    };

    let id = if let Some((id,)) = existing {
        let name = discord_display_name.unwrap_or(discord_user_id);
        let role = participant_role.unwrap_or("player");
        let cid = character_id.flatten();
        let primary = if is_primary.unwrap_or(false) { 1 } else { 0 };
        sqlx::query(
            r#"
            UPDATE session_discord_assignments
            SET discord_display_name = ?, participant_role = ?, character_id = ?,
                is_primary = ?, updated_at = ?, version = version + 1
            WHERE id = ?
            "#,
        )
        .bind(name)
        .bind(role)
        .bind(cid)
        .bind(primary)
        .bind(now)
        .bind(&id)
        .execute(pool)
        .await?;
        id
    } else {
        let new_id = Uuid::now_v7().to_string();
        let (sort_order,): (i32,) = sqlx::query_as(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM session_discord_assignments WHERE session_id = ? AND discord_user_id = ?",
        )
        .bind(session_id)
        .bind(discord_user_id)
        .fetch_one(pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO session_discord_assignments (
              id, session_id, discord_user_id, discord_display_name, participant_role,
              character_id, is_primary, sort_order, created_at, updated_at, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            "#,
        )
        .bind(&new_id)
        .bind(session_id)
        .bind(discord_user_id)
        .bind(discord_display_name.unwrap_or(discord_user_id))
        .bind(role)
        .bind(character_id.flatten())
        .bind(if is_primary.unwrap_or(false) { 1 } else { 0 })
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;
        new_id
    };

    if is_primary == Some(true) {
        sqlx::query(
            "UPDATE session_discord_assignments SET is_primary = 0, updated_at = ? WHERE session_id = ? AND discord_user_id = ? AND id != ?",
        )
        .bind(now)
        .bind(session_id)
        .bind(discord_user_id)
        .bind(&id)
        .execute(pool)
        .await?;
        sqlx::query(
            "UPDATE session_discord_assignments SET is_primary = 1, updated_at = ? WHERE id = ?",
        )
        .bind(now)
        .bind(&id)
        .execute(pool)
        .await?;
    }

    let rows = load_assignments_for_user(pool, session_id, discord_user_id).await?;
    rows.into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| AppError::Internal("assignment not found after upsert".into()))
}

pub async fn remove_assignment(pool: &SqlitePool, assignment_id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM session_discord_assignments WHERE id = ?")
        .bind(assignment_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn add_shared_account_character(
    pool: &SqlitePool,
    campaign_id: &str,
    session_id: &str,
    discord_user_id: &str,
    character_id: &str,
) -> AppResult<SessionDiscordAssignmentView> {
    let gm_id = gm_discord_user_id();
    if gm_id.as_ref().is_some_and(|g| g == discord_user_id) {
        return Err(AppError::Internal(
            "cannot add player character to GM discord account".into(),
        ));
    }

    upsert_assignment(
        pool,
        campaign_id,
        session_id,
        discord_user_id,
        None,
        Some("player"),
        Some(Some(character_id)),
        Some(false),
    )
    .await
}

pub async fn participant_counts(
    pool: &SqlitePool,
    session_id: &str,
) -> AppResult<(i64, i64)> {
    let (total,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT user_discord_id) FROM recordings WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?;

    let (players,): (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(DISTINCT r.user_discord_id) FROM recordings r
        LEFT JOIN session_discord_assignments a
          ON a.session_id = r.session_id AND a.discord_user_id = r.user_discord_id AND a.is_primary = 1
        WHERE r.session_id = ?
          AND COALESCE(a.participant_role, 'player') != 'gm'
        "#,
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?;

    Ok((total, players))
}

#[allow(dead_code)]
pub fn gm_speaker_label() -> &'static str {
    GM_SPEAKER_LABEL
}

async fn resolve_seed_character_id(
    pool: &SqlitePool,
    campaign_id: &str,
    discord_user_id: &str,
) -> AppResult<Option<String>> {
    let Some(resolved) =
        character_discord::resolve_character_for_discord_user(pool, campaign_id, discord_user_id)
            .await?
    else {
        return Ok(None);
    };

    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM characters WHERE id = ? AND campaign_id = ?",
    )
    .bind(&resolved.character_id)
    .bind(campaign_id)
    .fetch_optional(pool)
    .await?;

    Ok(exists.map(|(id,)| id))
}
