pub mod commands;
pub mod db;
pub mod error;
mod models;
mod services;
mod tabletop_defaults;
mod validation_issue;
mod util;

use std::sync::Arc;

use db::{RecordingState, TranscriptionState};
use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "amber_coffer_master=debug,tauri=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let data_dir = handle
                    .path()
                    .app_data_dir()
                    .map_err(|e| error::AppError::Internal(e.to_string()))?;

                std::fs::create_dir_all(&data_dir)
                    .map_err(|e| error::AppError::Internal(e.to_string()))?;

                let app_state = db::AppState::new();
                app_state.refresh_index(&handle)?;
                handle.manage(app_state);
                handle.manage(Arc::new(services::discord_setup::DiscordOAuthState::default()));
                services::discord_secrets::migrate_bot_token_from_store(&handle)?;
                handle.manage(Arc::new(RecordingState::new()));
                handle.manage(Arc::new(TranscriptionState::new()));
                Ok::<(), error::AppError>(())
            })
            .map_err(|e| {
                eprintln!("database setup failed: {e}");
                e
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::list_campaigns,
            commands::get_campaign,
            commands::create_campaign,
            commands::ensure_poc_campaign,
            commands::update_campaign,
            commands::list_characters,
            commands::get_character,
            commands::create_character,
            commands::update_character,
            commands::delete_character,
            commands::list_locations,
            commands::get_location,
            commands::create_location,
            commands::update_location,
            commands::delete_location,
            commands::list_factions,
            commands::get_faction,
            commands::create_faction,
            commands::update_faction,
            commands::delete_faction,
            commands::list_npcs,
            commands::get_npc,
            commands::create_npc,
            commands::update_npc,
            commands::delete_npc,
            commands::list_items,
            commands::get_item,
            commands::create_item,
            commands::update_item,
            commands::delete_item,
            commands::list_relationships,
            commands::get_relationship,
            commands::create_relationship,
            commands::update_relationship,
            commands::delete_relationship,
            commands::list_lore_notes,
            commands::get_lore_note,
            commands::create_lore_note,
            commands::update_lore_note,
            commands::delete_lore_note,
            commands::list_narrative_seeds,
            commands::get_narrative_seed,
            commands::create_narrative_seed,
            commands::update_narrative_seed,
            commands::delete_narrative_seed,
            commands::list_campaign_images,
            commands::get_campaign_image,
            commands::create_campaign_image,
            commands::update_campaign_image,
            commands::delete_campaign_image,
            commands::attach_campaign_image_file,
            commands::resolve_campaign_image_path,
            commands::list_sessions,
            commands::get_session,
            commands::create_session,
            commands::update_session,
            commands::delete_session,
            commands::session_begin_play,
            commands::session_end_play,
            commands::set_discord_bot_token,
            commands::has_discord_bot_token,
            commands::discord_oauth_start,
            commands::discord_oauth_clear,
            commands::discord_oauth_status,
            commands::discord_oauth_logout,
            commands::discord_ensure_user_oauth,
            commands::discord_list_guild_members,
            commands::discord_search_guild_members,
            commands::discord_list_admin_guilds,
            commands::discord_open_bot_invite,
            commands::discord_is_bot_in_guild,
            commands::discord_list_voice_channels,
            commands::discord_parse_bot_application_id,
            commands::session_start_recording,
            commands::session_stop_recording,
            commands::session_run_transcription,
            commands::get_session_pipeline_state,
            commands::list_session_recordings,
            commands::list_session_discord_participants,
            commands::upsert_session_discord_assignment,
            commands::remove_session_discord_assignment,
            commands::add_session_shared_account_character,
            commands::discord_connected_user,
            commands::import_campaign_dump,
            commands::repair_campaign_image_portraits,
            commands::repair_poc_campaign_portraits,
            commands::list_maps,
            commands::create_map,
            commands::update_map_background,
            commands::update_map_grid_cols,
            commands::list_tokens,
            commands::discord_user_access_token,
            commands::build_tabletop_snapshot_json,
            commands::place_token,
            commands::create_custom_session_token,
            commands::move_token,
            commands::resolve_token_move_request,
            commands::remove_token,
            commands::set_token_controller,
            commands::set_token_visibility,
            commands::ensure_campaign_character_tokens,
            commands::share_handout,
            commands::hide_handout,
            commands::publish_tabletop_snapshot,
            commands::list_handouts,
            commands::create_handout,
            commands::share_image_as_handout,
            commands::preview_public_canon_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
