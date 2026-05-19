use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::RwLock;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::{STANDARD as B64_STD, URL_SAFE_NO_PAD as B64_URL};
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use urlencoding::encode;

use crate::error::{AppError, AppResult};
use crate::services::discord_recording::read_bot_token;
use crate::services::discord_secrets::{
    clear_oauth_session, load_oauth_session, oauth_session_from_token_response, save_oauth_session,
    StoredOAuthSession,
};
use crate::util::now_ms;
use crate::validation_issue::{validation_issues, ValidationIssue};

/// Amber Coffer product application — keep in sync with `packages/shared`.
pub const AMBER_DISCORD_APPLICATION_ID: &str = "1505870393007935598";
pub const OAUTH_REDIRECT_URI: &str = "http://127.0.0.1:47832/oauth/callback";
const OAUTH_LISTEN_PORT: u16 = 47832;
const GM_BOT_INVITE_PERMISSIONS: &str = "3146752";

const ADMINISTRATOR: u64 = 0x8;
const MANAGE_GUILD: u64 = 0x20;

#[derive(Default)]
pub struct DiscordOAuthState {
    session: RwLock<Option<StoredOAuthSession>>,
}

impl DiscordOAuthState {
    fn set_session(&self, session: StoredOAuthSession) -> AppResult<()> {
        save_oauth_session(&session)?;
        let mut guard = self
            .session
            .write()
            .map_err(|_| AppError::Internal("oauth session lock poisoned".into()))?;
        *guard = Some(session);
        Ok(())
    }

    fn clear_ram(&self) {
        if let Ok(mut guard) = self.session.write() {
            *guard = None;
        }
    }

    fn ram_session(&self) -> AppResult<Option<StoredOAuthSession>> {
        let guard = self
            .session
            .read()
            .map_err(|_| AppError::Internal("oauth session lock poisoned".into()))?;
        Ok(guard.clone())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordOauthStatus {
    pub connected: bool,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordGuildMemberOption {
    pub id: String,
    pub username: String,
    pub global_name: Option<String>,
    pub nick: Option<String>,
    pub avatar: Option<String>,
    pub display_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordGuildOption {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub bot_present: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordVoiceChannelOption {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub parent_name: Option<String>,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    #[allow(dead_code)]
    token_type: Option<String>,
    #[serde(default)]
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChannelGuildRow {
    guild_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MemberUserRow {
    id: String,
    username: String,
    global_name: Option<String>,
    avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MemberRow {
    user: MemberUserRow,
    nick: Option<String>,
}

const MEMBER_LIST_PAGE_LIMIT: u32 = 1000;
const MEMBER_LIST_MAX_PAGES: u32 = 10;
const MEMBER_SEARCH_LIMIT: u32 = 100;

#[derive(Debug, Deserialize)]
struct GuildRow {
    id: String,
    name: String,
    icon: Option<String>,
    permissions: String,
}

#[derive(Debug, Deserialize)]
struct ChannelRow {
    id: String,
    name: String,
    #[serde(rename = "type")]
    channel_type: i32,
    parent_id: Option<String>,
}

fn http_client() -> AppResult<Client> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn pkce_verifier() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    B64_URL.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    B64_URL.encode(hash)
}

fn open_url(handle: &AppHandle, url: &str) -> AppResult<()> {
    handle
        .opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("open browser: {e}")))
}

fn normalize_bot_token<'a>(token: &'a str) -> &'a str {
    let trimmed = token.trim();
    trimmed
        .strip_prefix("Bot ")
        .or_else(|| trimmed.strip_prefix("bot "))
        .unwrap_or(trimmed)
}

/// Discord REST expects `Authorization: Bot <token>`, not Bearer.
fn discord_bot_authorization(token: &str) -> String {
    format!("Bot {}", normalize_bot_token(token))
}

enum DiscordAuth<'a> {
    Bearer(&'a str),
    Bot(&'a str),
}

fn apply_discord_auth(builder: reqwest::RequestBuilder, auth: DiscordAuth<'_>) -> reqwest::RequestBuilder {
    match auth {
        DiscordAuth::Bearer(token) => builder.bearer_auth(token),
        DiscordAuth::Bot(token) => builder.header("Authorization", discord_bot_authorization(token)),
    }
}

async fn discord_api_get_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    url: &str,
    auth: DiscordAuth<'_>,
    api_label: &str,
) -> AppResult<T> {
    let res = apply_discord_auth(client.get(url), auth)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("{api_label}: {e}")))?;
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "{api_label}: HTTP {status} {body}"
        )));
    }
    res.json()
        .await
        .map_err(|e| AppError::Internal(format!("{api_label} parse: {e}")))
}

fn member_display_name(user: &MemberUserRow, nick: Option<&str>) -> String {
    nick.filter(|n| !n.is_empty())
        .map(|n| n.to_string())
        .or_else(|| user.global_name.clone())
        .unwrap_or_else(|| user.username.clone())
}

fn member_row_to_option(row: MemberRow) -> DiscordGuildMemberOption {
    let display_name = member_display_name(&row.user, row.nick.as_deref());
    DiscordGuildMemberOption {
        id: row.user.id,
        username: row.user.username,
        global_name: row.user.global_name,
        nick: row.nick,
        avatar: row.user.avatar,
        display_name,
    }
}

fn discord_members_api_error(status: reqwest::StatusCode, body: &str, api_label: &str) -> AppError {
    if status == reqwest::StatusCode::FORBIDDEN {
        return validation_issues(vec![ValidationIssue::new(
            &["discord"],
            "members_intent_required",
        )]);
    }
    AppError::Internal(format!("{api_label}: HTTP {status} {body}"))
}

async fn discord_api_get_members(
    client: &Client,
    url: &str,
    bot_token: &str,
    api_label: &str,
) -> AppResult<Vec<MemberRow>> {
    let res = apply_discord_auth(client.get(url), DiscordAuth::Bot(bot_token))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("{api_label}: {e}")))?;
    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(discord_members_api_error(status, &body, api_label));
    }
    res.json()
        .await
        .map_err(|e| AppError::Internal(format!("{api_label} parse: {e}")))
}

fn hydrate_oauth_from_store(oauth_state: &DiscordOAuthState) -> AppResult<()> {
    if oauth_state.ram_session()?.is_some() {
        return Ok(());
    }
    if let Some(session) = load_oauth_session()? {
        let mut guard = oauth_state
            .session
            .write()
            .map_err(|_| AppError::Internal("oauth session lock poisoned".into()))?;
        *guard = Some(session);
    }
    Ok(())
}

fn is_discord_http_unauthorized(err: &AppError) -> bool {
    match err {
        AppError::Internal(msg) => msg.contains("HTTP 401") || msg.contains("401 Unauthorized"),
        _ => false,
    }
}

fn user_oauth_expired_error() -> AppError {
    validation_issues(vec![ValidationIssue::new(
        &["discord"],
        "user_oauth_expired",
    )])
}

async fn refresh_user_access_token(oauth_state: &DiscordOAuthState) -> AppResult<String> {
    hydrate_oauth_from_store(oauth_state)?;
    let session = oauth_state
        .ram_session()?
        .or(load_oauth_session()?)
        .ok_or_else(|| AppError::Internal("discord user login required".into()))?;
    let refreshed = refresh_oauth_session(&session).await?;
    oauth_state.set_session(refreshed.clone())?;
    Ok(refreshed.access_token)
}

async fn refresh_oauth_session(session: &StoredOAuthSession) -> AppResult<StoredOAuthSession> {
    let refresh_token = session.refresh_token.as_deref().ok_or_else(|| {
        AppError::Internal("discord oauth refresh token missing".into())
    })?;
    let client = http_client()?;
    let token_res = client
        .post("https://discord.com/api/oauth2/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!(
            "client_id={}&grant_type=refresh_token&refresh_token={}",
            encode(AMBER_DISCORD_APPLICATION_ID),
            encode(refresh_token),
        ))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("oauth refresh request: {e}")))?;

    if !token_res.status().is_success() {
        let body = token_res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("oauth refresh failed: {body}")));
    }

    let token: TokenResponse = token_res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("oauth refresh parse: {e}")))?;

    Ok(oauth_session_from_token_response(
        token.access_token,
        token.refresh_token.or(session.refresh_token.clone()),
        token.expires_in,
        token.scope.or(session.scope.clone()),
    ))
}

pub async fn ensure_user_access_token(
    handle: &AppHandle,
    oauth_state: &DiscordOAuthState,
) -> AppResult<String> {
    hydrate_oauth_from_store(oauth_state)?;
    let now = now_ms();

    if let Some(session) = oauth_state.ram_session()? {
        if session.is_valid(now) {
            return Ok(session.access_token);
        }
        return refresh_user_access_token(oauth_state).await;
    }
    if let Some(session) = load_oauth_session()? {
        if session.is_valid(now) {
            oauth_state.set_session(session.clone())?;
            return Ok(session.access_token);
        }
        oauth_state.set_session(session.clone())?;
        return refresh_user_access_token(oauth_state).await;
    }

    oauth_start(handle, oauth_state).await?;
    oauth_state
        .ram_session()?
        .map(|s| s.access_token)
        .ok_or_else(|| AppError::Internal("discord user login required".into()))
}

pub fn oauth_status() -> AppResult<DiscordOauthStatus> {
    let now = now_ms();
    match load_oauth_session()? {
        Some(session) if session.is_valid(now) => Ok(DiscordOauthStatus {
            connected: true,
            expires_at: Some(session.expires_at),
        }),
        Some(session) => Ok(DiscordOauthStatus {
            connected: false,
            expires_at: Some(session.expires_at),
        }),
        None => Ok(DiscordOauthStatus {
            connected: false,
            expires_at: None,
        }),
    }
}

pub fn oauth_logout(oauth_state: &DiscordOAuthState) -> AppResult<()> {
    oauth_state.clear_ram();
    clear_oauth_session()
}

pub fn oauth_clear(oauth_state: &DiscordOAuthState) {
    oauth_state.clear_ram();
}

async fn exchange_authorization_code(code: &str, verifier: &str) -> AppResult<StoredOAuthSession> {
    let client = http_client()?;
    let token_res = client
        .post("https://discord.com/api/oauth2/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!(
            "client_id={}&grant_type=authorization_code&code={}&redirect_uri={}&code_verifier={}",
            encode(AMBER_DISCORD_APPLICATION_ID),
            encode(code),
            encode(OAUTH_REDIRECT_URI),
            encode(verifier),
        ))
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("oauth token request: {e}")))?;

    if !token_res.status().is_success() {
        let body = token_res.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("oauth token failed: {body}")));
    }

    let token: TokenResponse = token_res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("oauth token parse: {e}")))?;

    Ok(oauth_session_from_token_response(
        token.access_token,
        token.refresh_token,
        token.expires_in,
        token.scope,
    ))
}

/// Decodes the first dot-separated segment of a Discord bot token (unpadded standard base64).
fn decode_bot_token_segment(segment: &str) -> AppResult<Vec<u8>> {
    let pad_len = (4 - segment.len() % 4) % 4;
    let padded = format!("{segment}{}", "=".repeat(pad_len));
    B64_STD
        .decode(padded.as_bytes())
        .or_else(|_| B64_URL.decode(segment.as_bytes()))
        .map_err(|e| AppError::Internal(format!("invalid bot token encoding: {e}")))
}

/// Extracts the GM bot application (client) id from a Discord bot token.
pub fn application_id_from_bot_token(token: &str) -> AppResult<String> {
    let token = normalize_bot_token(token);
    let segment = token
        .split('.')
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Internal("invalid bot token format".into()))?;
    let decoded = decode_bot_token_segment(segment)?;
    let id = String::from_utf8(decoded)
        .map_err(|e| AppError::Internal(format!("invalid bot token id: {e}")))?;
    if id.chars().all(|c| c.is_ascii_digit()) && !id.is_empty() {
        Ok(id)
    } else {
        Err(AppError::Internal("invalid bot application id".into()))
    }
}

pub fn bot_invite_url_with_token(bot_token: &str, guild_id: &str) -> AppResult<String> {
    let client_id = application_id_from_bot_token(bot_token)?;
    Ok(format!(
        "https://discord.com/oauth2/authorize?client_id={}&permissions={}&scope=bot&guild_id={}",
        encode(&client_id),
        GM_BOT_INVITE_PERMISSIONS,
        encode(guild_id)
    ))
}

pub async fn oauth_start(handle: &AppHandle, oauth_state: &DiscordOAuthState) -> AppResult<()> {
    if AMBER_DISCORD_APPLICATION_ID == "000000000000000000" {
        return Err(AppError::Internal(
            "AMBER_DISCORD_APPLICATION_ID is not configured; set it in packages/shared".into(),
        ));
    }

    oauth_logout(oauth_state)?;

    let verifier = pkce_verifier();
    let challenge = pkce_challenge(&verifier);
    let state_param = pkce_verifier();

    let authorize_url = format!(
        "https://discord.com/oauth2/authorize?client_id={}&response_type=code&redirect_uri={}&scope=identify%20guilds&state={}&code_challenge={}&code_challenge_method=S256",
        encode(AMBER_DISCORD_APPLICATION_ID),
        encode(OAUTH_REDIRECT_URI),
        encode(&state_param),
        encode(&challenge),
    );

    let code = tokio::task::spawn_blocking({
        let authorize_url = authorize_url.clone();
        let state_param = state_param.clone();
        let handle = handle.clone();
        move || -> AppResult<String> {
            // Bind before opening the browser so the redirect cannot race the listener.
            wait_for_oauth_code(&state_param, || open_url(&handle, &authorize_url))
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("oauth task join: {e}")))??;

    let session = exchange_authorization_code(&code, &verifier).await?;
    oauth_state.set_session(session)
}

fn wait_for_oauth_code(
    expected_state: &str,
    before_accept: impl FnOnce() -> AppResult<()>,
) -> AppResult<String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_LISTEN_PORT))
        .map_err(|e| AppError::Internal(format!("oauth listen bind: {e}")))?;
    listener
        .set_nonblocking(false)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    before_accept()?;

    let (mut stream, _) = listener
        .accept()
        .map_err(|e| AppError::Internal(format!("oauth callback wait: {e}")))?;

    let mut buf = [0u8; 4096];
    let n = stream
        .read(&mut buf)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let request = String::from_utf8_lossy(&buf[..n]);

    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("");

    let (code_opt, state_ok) = parse_callback_query(path, expected_state)?;

    let body = if state_ok {
        "<html><body><p>Discord connected. You can close this window.</p></body></html>"
    } else {
        "<html><body><p>Login failed. Return to Amber Coffer.</p></body></html>"
    };
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());

    code_opt.ok_or_else(|| AppError::Internal("oauth cancelled or denied".into()))
}

fn parse_callback_query(path: &str, expected_state: &str) -> AppResult<(Option<String>, bool)> {
    let query = path.split('?').nth(1).unwrap_or("");
    let mut code = None;
    let mut state = None;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let key = kv.next().unwrap_or("");
        let val = kv
            .next()
            .map(|v| urlencoding::decode(v).unwrap_or_else(|_| v.into()).into_owned())
            .unwrap_or_default();
        match key {
            "code" => code = Some(val),
            "state" => state = Some(val),
            _ => {}
        }
    }
    let state_ok = state.as_deref() == Some(expected_state);
    Ok((code, state_ok))
}

fn user_can_admin_guild(permissions: &str) -> bool {
    let bits: u64 = permissions.parse().unwrap_or(0);
    (bits & ADMINISTRATOR) != 0 || (bits & MANAGE_GUILD) != 0
}

async fn list_guilds_merged_with_oauth_recovery(
    oauth_state: &DiscordOAuthState,
    user_token: &str,
    bot_token: Option<&str>,
) -> AppResult<Vec<DiscordGuildOption>> {
    match list_guilds_merged(user_token, bot_token).await {
        Ok(guilds) => Ok(guilds),
        Err(e) if is_discord_http_unauthorized(&e) => {
            let refreshed_token = refresh_user_access_token(oauth_state).await;
            match refreshed_token {
                Ok(token) => match list_guilds_merged(&token, bot_token).await {
                    Ok(guilds) => Ok(guilds),
                    Err(retry_err) if is_discord_http_unauthorized(&retry_err) => {
                        let _ = oauth_logout(oauth_state);
                        Err(user_oauth_expired_error())
                    }
                    Err(retry_err) => Err(retry_err),
                },
                Err(_) => {
                    let _ = oauth_logout(oauth_state);
                    Err(user_oauth_expired_error())
                }
            }
        }
        Err(e) => Err(e),
    }
}

pub async fn list_admin_guilds_with_bot(
    handle: &AppHandle,
    oauth_state: &DiscordOAuthState,
) -> AppResult<Vec<DiscordGuildOption>> {
    let access_token = ensure_user_access_token(handle, oauth_state).await?;
    let bot_token = read_bot_token(handle).ok();
    list_guilds_merged_with_oauth_recovery(oauth_state, &access_token, bot_token.as_deref()).await
}

pub async fn ensure_user_oauth(handle: &AppHandle, oauth_state: &DiscordOAuthState) -> AppResult<()> {
    ensure_user_access_token(handle, oauth_state).await?;
    Ok(())
}

async fn fetch_discord_guild_rows(
    client: &Client,
    api_label: &str,
    auth: DiscordAuth<'_>,
) -> AppResult<Vec<GuildRow>> {
    discord_api_get_json(
        client,
        "https://discord.com/api/v10/users/@me/guilds",
        auth,
        api_label,
    )
    .await
}

async fn bot_guild_ids_soft(client: &Client, bot_token: &str) -> std::collections::HashSet<String> {
    match fetch_discord_guild_rows(client, "discord bot guilds", DiscordAuth::Bot(bot_token)).await
    {
        Ok(rows) => rows.into_iter().map(|g| g.id).collect(),
        Err(e) => {
            tracing::warn!("discord bot guild list failed, continuing without bot hints: {e}");
            std::collections::HashSet::new()
        }
    }
}

async fn list_guilds_merged(
    user_token: &str,
    bot_token: Option<&str>,
) -> AppResult<Vec<DiscordGuildOption>> {
    let client = http_client()?;

    let user_guilds =
        fetch_discord_guild_rows(&client, "discord user guilds", DiscordAuth::Bearer(user_token))
            .await?;

    let bot_guild_ids: std::collections::HashSet<String> = if let Some(bot) = bot_token {
        bot_guild_ids_soft(&client, bot).await
    } else {
        std::collections::HashSet::new()
    };

    Ok(user_guilds
        .into_iter()
        .filter(|g| user_can_admin_guild(&g.permissions))
        .map(|g| DiscordGuildOption {
            bot_present: bot_guild_ids.contains(&g.id),
            id: g.id,
            name: g.name,
            icon: g.icon,
        })
        .collect())
}

pub async fn is_bot_in_guild(handle: &AppHandle, guild_id: &str) -> AppResult<bool> {
    let bot_token = read_bot_token(handle)?;
    let client = http_client()?;
    let rows =
        fetch_discord_guild_rows(&client, "discord bot guilds", DiscordAuth::Bot(&bot_token))
            .await?;
    Ok(rows.iter().any(|g| g.id == guild_id))
}

pub async fn list_voice_channels(
    handle: &AppHandle,
    guild_id: &str,
) -> AppResult<Vec<DiscordVoiceChannelOption>> {
    let bot_token = read_bot_token(handle)?;
    let client = http_client()?;

    let channels: Vec<ChannelRow> = discord_api_get_json(
        &client,
        &format!("https://discord.com/api/v10/guilds/{guild_id}/channels"),
        DiscordAuth::Bot(&bot_token),
        "discord channels",
    )
    .await?;

    let category_names: std::collections::HashMap<String, String> = channels
        .iter()
        .filter(|c| c.channel_type == 4)
        .map(|c| (c.id.clone(), c.name.clone()))
        .collect();

    let mut voice: Vec<DiscordVoiceChannelOption> = channels
        .into_iter()
        .filter(|c| c.channel_type == 2 || c.channel_type == 13)
        .map(|c| {
            let parent_name = c
                .parent_id
                .as_ref()
                .and_then(|pid| category_names.get(pid).cloned());
            let kind = if c.channel_type == 13 {
                "stage"
            } else {
                "voice"
            };
            DiscordVoiceChannelOption {
                id: c.id,
                name: c.name,
                parent_id: c.parent_id,
                parent_name,
                kind: kind.to_string(),
            }
        })
        .collect();

    voice.sort_by(|a, b| {
        a.parent_name
            .cmp(&b.parent_name)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(voice)
}

pub fn open_bot_invite(handle: &AppHandle, guild_id: &str) -> AppResult<()> {
    let bot_token = read_bot_token(handle)?;
    let url = bot_invite_url_with_token(&bot_token, guild_id)?;
    open_url(handle, &url)
}

pub async fn resolve_guild_id_from_channel(
    handle: &AppHandle,
    channel_id: &str,
) -> AppResult<Option<String>> {
    let bot_token = read_bot_token(handle)?;
    let client = http_client()?;
    let channel: ChannelGuildRow = discord_api_get_json(
        &client,
        &format!("https://discord.com/api/v10/channels/{channel_id}"),
        DiscordAuth::Bot(&bot_token),
        "discord channel",
    )
    .await?;
    Ok(channel.guild_id)
}

pub async fn list_guild_members(
    handle: &AppHandle,
    guild_id: &str,
) -> AppResult<Vec<DiscordGuildMemberOption>> {
    let bot_token = read_bot_token(handle)?;
    let client = http_client()?;
    let mut members: Vec<DiscordGuildMemberOption> = Vec::new();
    let mut after: Option<String> = None;

    for _ in 0..MEMBER_LIST_MAX_PAGES {
        let mut url = format!(
            "https://discord.com/api/v10/guilds/{guild_id}/members?limit={MEMBER_LIST_PAGE_LIMIT}"
        );
        if let Some(ref cursor) = after {
            url.push_str(&format!("&after={}", encode(cursor)));
        }

        let page: Vec<MemberRow> =
            discord_api_get_members(&client, &url, &bot_token, "discord guild members").await?;
        let page_len = page.len();
        members.extend(page.into_iter().map(member_row_to_option));
        if page_len < MEMBER_LIST_PAGE_LIMIT as usize {
            break;
        }
        after = members.last().map(|m| m.id.clone());
        if after.is_none() {
            break;
        }
    }

    members.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    Ok(members)
}

pub async fn search_guild_members(
    handle: &AppHandle,
    guild_id: &str,
    query: &str,
) -> AppResult<Vec<DiscordGuildMemberOption>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err(validation_issues(vec![ValidationIssue::with_min(
            &["query"],
            1,
        )]));
    }

    let bot_token = read_bot_token(handle)?;
    let client = http_client()?;
    let url = format!(
        "https://discord.com/api/v10/guilds/{guild_id}/members/search?query={}&limit={MEMBER_SEARCH_LIMIT}",
        encode(trimmed)
    );
    let rows: Vec<MemberRow> =
        discord_api_get_members(&client, &url, &bot_token, "discord guild member search").await?;
    let mut members: Vec<DiscordGuildMemberOption> =
        rows.into_iter().map(member_row_to_option).collect();
    members.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    Ok(members)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn application_id_from_unpadded_bot_token_segment() {
        let token = "MTUwNTg3MDM5MzAwNzkzNTU5OA.part2.part3";
        assert_eq!(
            application_id_from_bot_token(token).unwrap(),
            "1505870393007935598"
        );
    }

    #[test]
    fn application_id_strips_bot_prefix() {
        let token = "Bot MTUwNTg3MDM5MzAwNzkzNTU5OA.part2.part3";
        assert_eq!(
            application_id_from_bot_token(token).unwrap(),
            "1505870393007935598"
        );
    }

    #[test]
    fn bot_authorization_header_uses_bot_scheme() {
        assert_eq!(
            discord_bot_authorization("abc.def.ghi"),
            "Bot abc.def.ghi"
        );
        assert_eq!(
            discord_bot_authorization("Bot abc.def.ghi"),
            "Bot abc.def.ghi"
        );
    }
}
