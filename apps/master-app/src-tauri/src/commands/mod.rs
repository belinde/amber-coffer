mod campaign_images;
mod discord_setup;
mod migrate;
mod campaigns;
mod characters;
mod factions;
mod handouts;
mod items;
mod locations;
mod lore_notes;
mod maps;
mod narrative_seeds;
mod npcs;
mod public_canon;
mod relationships;
mod session_discord;
mod session_pipeline;
mod sessions;
mod tabletop;
mod vault_validate;

pub use campaign_images::*;
pub use discord_setup::*;
pub use migrate::*;
pub use campaigns::*;
pub use characters::*;
pub use factions::*;
pub use handouts::*;
pub use items::*;
pub use locations::*;
pub use lore_notes::*;
pub use maps::*;
pub use narrative_seeds::*;
pub use npcs::*;
pub use public_canon::*;
pub use relationships::*;
pub use session_discord::*;
pub use session_pipeline::*;
pub use sessions::*;
pub use tabletop::*;

/// Health-check command for renderer ↔ Rust IPC.
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}
