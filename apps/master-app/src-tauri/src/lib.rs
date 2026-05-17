mod commands;
mod db;
mod error;
mod models;
mod services;
mod validation_issue;
mod util;

use std::sync::Arc;

use db::RecordingState;
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
        .plugin(tauri_plugin_shell::init())
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

                let db_path = data_dir.join("amber-coffer.db");
                let pool = db::init_pool(
                    db_path
                        .to_str()
                        .ok_or_else(|| error::AppError::Internal("invalid db path".into()))?,
                )
                .await?;

                handle.manage(db::AppState::new(pool));
                handle.manage(Arc::new(RecordingState::new()));
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
            commands::set_discord_bot_token,
            commands::has_discord_bot_token,
            commands::session_start_recording,
            commands::session_stop_recording,
            commands::session_run_transcription,
            commands::get_session_pipeline_state,
            commands::import_campaign_dump,
            commands::list_maps,
            commands::create_map,
            commands::list_tokens,
            commands::publish_sync_message,
            commands::place_token,
            commands::move_token,
            commands::resolve_token_move_request,
            commands::remove_token,
            commands::share_handout,
            commands::hide_handout,
            commands::publish_tabletop_snapshot,
            commands::list_handouts,
            commands::create_handout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
