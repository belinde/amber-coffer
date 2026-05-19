use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone)]
pub struct ResolvedCharacter {
    pub character_id: String,
    pub name: String,
}

pub async fn resolve_character_for_discord_user(
    pool: &SqlitePool,
    campaign_id: &str,
    discord_user_id: &str,
) -> AppResult<Option<ResolvedCharacter>> {
    let row: Option<(String, String)> = sqlx::query_as(
        r#"
        SELECT id, name FROM characters
        WHERE campaign_id = ? AND player_discord_id = ?
        LIMIT 1
        "#,
    )
    .bind(campaign_id)
    .bind(discord_user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(character_id, name)| ResolvedCharacter {
        character_id,
        name,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_pool;

    async fn test_pool() -> SqlitePool {
        let pool = init_pool(":memory:").await.expect("pool");
        sqlx::migrate!("./migrations").run(&pool).await.expect("migrate");
        pool
    }

    #[tokio::test]
    async fn resolves_character_by_discord_user_id() {
        let pool = test_pool().await;
        let now = 1_i64;
        sqlx::query(
            r#"
            INSERT INTO characters (
              id, campaign_id, name, player_discord_id, visibility,
              appearance_json, game_stats_json, notable_equipment_json,
              events_interesting_json, attributes_json, status,
              created_at, updated_at, version
            ) VALUES (?, ?, ?, ?, 'gm_only', '{}', '{}', '[]', '[]', '{}', 'active', ?, ?, 1)
            "#,
        )
        .bind("char-1")
        .bind("camp-1")
        .bind("Aria")
        .bind("999")
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .expect("insert");

        let resolved = resolve_character_for_discord_user(&pool, "camp-1", "999")
            .await
            .expect("resolve")
            .expect("some");
        assert_eq!(resolved.character_id, "char-1");
        assert_eq!(resolved.name, "Aria");

        let missing = resolve_character_for_discord_user(&pool, "camp-1", "000")
            .await
            .expect("resolve");
        assert!(missing.is_none());
    }
}
