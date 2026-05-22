use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::{AppError, AppResult};
use crate::util::now_ms;

pub const KEYRING_SERVICE: &str = "amber-coffer";
pub const OAUTH_ACCOUNT: &str = "discord-user-oauth";
pub const BOT_TOKEN_ACCOUNT: &str = "discord-bot-token";

const BOT_TOKEN_STORE_KEY: &str = "discord.botToken";
const SETTINGS_STORE: &str = "amber-settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredOAuthSession {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub discord_user_id: Option<String>,
    #[serde(default)]
    pub discord_username: Option<String>,
}

impl StoredOAuthSession {
    pub fn is_valid(&self, now: i64) -> bool {
        self.expires_at > now
    }
}

fn keyring_entry(account: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, account)
        .map_err(|e| AppError::Internal(format!("keyring entry: {e}")))
}

fn normalize_bot_token(token: &str) -> String {
    let trimmed = token.trim();
    trimmed
        .strip_prefix("Bot ")
        .or_else(|| trimmed.strip_prefix("bot "))
        .unwrap_or(trimmed)
        .to_string()
}

fn settings_store(handle: &AppHandle) -> AppResult<Arc<tauri_plugin_store::Store<tauri::Wry>>> {
    handle
        .store(SETTINGS_STORE)
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn load_bot_token_from_store(handle: &AppHandle) -> AppResult<Option<String>> {
    let store = settings_store(handle)?;
    let legacy = store
        .get(BOT_TOKEN_STORE_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    let Some(token) = legacy else {
        return Ok(None);
    };
    let normalized = normalize_bot_token(&token);
    if normalized.is_empty() {
        Ok(None)
    } else {
        Ok(Some(normalized))
    }
}

fn save_bot_token_to_store(handle: &AppHandle, token: &str) -> AppResult<()> {
    let store = settings_store(handle)?;
    store.set(BOT_TOKEN_STORE_KEY, serde_json::Value::String(token.to_string()));
    store
        .save()
        .map_err(|e| AppError::Internal(format!("settings store save bot token: {e}")))
}

fn clear_bot_token_from_store(handle: &AppHandle) -> AppResult<()> {
    let store = settings_store(handle)?;
    store.delete(BOT_TOKEN_STORE_KEY);
    store
        .save()
        .map_err(|e| AppError::Internal(format!("settings store clear bot token: {e}")))?;
    Ok(())
}

fn try_keyring_load() -> AppResult<Option<String>> {
    let entry = keyring_entry(BOT_TOKEN_ACCOUNT)?;
    match entry.get_password() {
        Ok(token) => {
            let normalized = normalize_bot_token(&token);
            if normalized.is_empty() {
                Ok(None)
            } else {
                Ok(Some(normalized))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            tracing::warn!("keyring read bot token: {e}");
            Ok(None)
        }
    }
}

fn try_keyring_save_and_verify(token: &str) -> bool {
    let Ok(entry) = keyring_entry(BOT_TOKEN_ACCOUNT) else {
        return false;
    };
    if entry.set_password(token).is_err() {
        return false;
    }
    matches!(try_keyring_load(), Ok(Some(stored)) if stored == token)
}

pub fn migrate_bot_token_from_store(handle: &AppHandle) -> AppResult<()> {
    if load_bot_token(handle).is_ok() {
        return Ok(());
    }

    let store = settings_store(handle)?;
    let legacy = store
        .get(BOT_TOKEN_STORE_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    let Some(token) = legacy.filter(|t| !t.trim().is_empty()) else {
        return Ok(());
    };

    save_bot_token(handle, &token)?;
    if try_keyring_load().ok().flatten().is_some() {
        store.delete(BOT_TOKEN_STORE_KEY);
        store
            .save()
            .map_err(|e| AppError::Internal(format!("settings store save after bot token migration: {e}")))?;
        tracing::info!("migrated discord bot token from plugin-store to keyring");
    } else {
        tracing::info!("discord bot token kept in plugin-store (keyring unavailable)");
    }
    Ok(())
}

pub fn load_oauth_session() -> AppResult<Option<StoredOAuthSession>> {
    let entry = keyring_entry(OAUTH_ACCOUNT)?;
    match entry.get_password() {
        Ok(raw) => {
            let session: StoredOAuthSession = serde_json::from_str(&raw)
                .map_err(|e| AppError::Internal(format!("oauth session parse: {e}")))?;
            Ok(Some(session))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Internal(format!("keyring read oauth: {e}"))),
    }
}

pub fn save_oauth_session(session: &StoredOAuthSession) -> AppResult<()> {
    let raw = serde_json::to_string(session).map_err(AppError::Serialization)?;
    keyring_entry(OAUTH_ACCOUNT)?
        .set_password(&raw)
        .map_err(|e| AppError::Internal(format!("keyring write oauth: {e}")))
}

pub fn clear_oauth_session() -> AppResult<()> {
    match keyring_entry(OAUTH_ACCOUNT)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Internal(format!("keyring delete oauth: {e}"))),
    }
}

pub fn load_bot_token(handle: &AppHandle) -> AppResult<String> {
    if let Some(token) = try_keyring_load()? {
        return Ok(token);
    }
    if let Some(token) = load_bot_token_from_store(handle)? {
        return Ok(token);
    }
    Err(crate::validation_issue::required_field(&["discord", "botToken"]))
}

pub fn save_bot_token(handle: &AppHandle, token: &str) -> AppResult<()> {
    let normalized = normalize_bot_token(token);
    if normalized.is_empty() {
        return Err(crate::validation_issue::required_field(&["discord", "botToken"]));
    }

    if try_keyring_save_and_verify(&normalized) {
        let _ = clear_bot_token_from_store(handle);
    } else {
        save_bot_token_to_store(handle, &normalized)?;
    }
    Ok(())
}

pub fn has_bot_token(handle: &AppHandle) -> bool {
    load_bot_token(handle).is_ok()
}

pub fn load_bot_token_after_migration(handle: &AppHandle) -> AppResult<String> {
    migrate_bot_token_from_store(handle)?;
    load_bot_token(handle)
}

pub fn oauth_session_from_token_response(
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    scope: Option<String>,
) -> StoredOAuthSession {
    let now = now_ms();
    let ttl_secs = expires_in.unwrap_or(604_800);
    let expires_at = now + ttl_secs.saturating_mul(1000) - 60_000;
    StoredOAuthSession {
        access_token,
        refresh_token,
        expires_at,
        scope,
        discord_user_id: None,
        discord_username: None,
    }
}

pub fn gm_discord_user_id() -> Option<String> {
    load_oauth_session()
        .ok()
        .flatten()
        .and_then(|s| s.discord_user_id.filter(|id| !id.is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_session_validity_respects_expiry() {
        let now = 1_000_000;
        let session = StoredOAuthSession {
            access_token: "a".into(),
            refresh_token: None,
            expires_at: now + 5_000,
            scope: None,
            discord_user_id: None,
            discord_username: None,
        };
        assert!(session.is_valid(now));
        assert!(!session.is_valid(now + 10_000));
    }
}
