//! One-shot POC import CLI (uses the same Tauri data dir as the desktop app).
//!
//! Usage: cargo run --bin import_poc -- /path/to/campaign-dump.json

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use amber_coffer_master_lib::commands;
use amber_coffer_master_lib::db::AppState;
use amber_coffer_master_lib::error::AppError;
use tauri::{Manager, RunEvent};

fn main() {
    if let Err(e) = run() {
        eprintln!("import failed: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), AppError> {
    let dump_path: PathBuf = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| AppError::Internal("usage: import_poc <campaign-dump.json>".into()))?;

    if !dump_path.is_file() {
        return Err(AppError::Internal(format!(
            "dump file not found: {}",
            dump_path.display()
        )));
    }

    let dump_path_str = dump_path.to_string_lossy().into_owned();
    let import_done = AtomicBool::new(false);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let data_dir = handle
                    .path()
                    .app_data_dir()
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                std::fs::create_dir_all(&data_dir)
                    .map_err(|e| AppError::Internal(e.to_string()))?;

                let app_state = AppState::new();
                app_state.refresh_index(&handle)?;
                handle.manage(app_state);
                Ok::<(), AppError>(())
            })?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let exit_code = app.run_return(move |handle, event| {
        if !matches!(event, RunEvent::Ready) {
            return;
        }
        if import_done.swap(true, Ordering::SeqCst) {
            return;
        }

        let result = tauri::async_runtime::block_on(async {
            let state = handle.state::<AppState>();
            commands::import_campaign_dump(
                dump_path_str.clone(),
                None,
                None,
                handle.clone(),
                state,
            )
            .await
        });

        match result {
            Ok(report) => {
                match serde_json::to_string_pretty(&report) {
                    Ok(json) => println!("{json}"),
                    Err(e) => eprintln!("serialize report: {e}"),
                }
                handle.exit(0);
            }
            Err(e) => {
                eprintln!("{e}");
                handle.exit(1);
            }
        }
    });

    std::process::exit(exit_code);
}
