use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::Campaign;

pub const CAMPAIGN_JSON_FILE: &str = "campaign.json";
pub const DATABASE_FILE: &str = "database.db";

pub fn worlds_root(handle: &AppHandle) -> AppResult<PathBuf> {
    let data_dir = handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(data_dir.join("worlds"))
}

pub fn ensure_worlds_root(handle: &AppHandle) -> AppResult<PathBuf> {
    let root = worlds_root(handle)?;
    fs::create_dir_all(&root).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(root)
}

pub fn storage_folder(root: &Path, storage_uuid: &str) -> PathBuf {
    root.join(storage_uuid)
}

pub fn campaign_json_path(folder: &Path) -> PathBuf {
    folder.join(CAMPAIGN_JSON_FILE)
}

pub fn database_path(folder: &Path) -> PathBuf {
    folder.join(DATABASE_FILE)
}

pub fn images_dir(folder: &Path) -> PathBuf {
    folder.join("images")
}

pub fn read_campaign_json(folder: &Path) -> AppResult<Campaign> {
    let path = campaign_json_path(folder);
    let raw = fs::read_to_string(&path)
        .map_err(|e| AppError::Internal(format!("read {}: {e}", path.display())))?;
    let campaign: Campaign = serde_json::from_str(&raw)?;
    if campaign.id.trim().is_empty() || campaign.name.trim().is_empty() {
        return Err(AppError::Internal(format!(
            "invalid campaign metadata in {}",
            path.display()
        )));
    }
    Ok(campaign)
}

pub fn write_campaign_json(folder: &Path, campaign: &Campaign) -> AppResult<()> {
    fs::create_dir_all(folder).map_err(|e| AppError::Internal(e.to_string()))?;
    let path = campaign_json_path(folder);
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(campaign)?;
    fs::write(&tmp, json).map_err(|e| AppError::Internal(e.to_string()))?;
    fs::rename(&tmp, &path).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

/// Lists all campaigns by reading `campaign.json` in each storage folder.
pub fn list_campaigns(handle: &AppHandle) -> AppResult<Vec<Campaign>> {
    let root = worlds_root(handle)?;
    if !root.is_dir() {
        return Ok(vec![]);
    }

    let mut campaigns = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| AppError::Internal(e.to_string()))? {
        let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
        if !entry.file_type().map_err(|e| AppError::Internal(e.to_string()))?.is_dir() {
            continue;
        }
        let folder = entry.path();
        if campaign_json_path(&folder).is_file() {
            campaigns.push(read_campaign_json(&folder)?);
        }
    }

    campaigns.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(campaigns)
}

pub fn build_id_index(handle: &AppHandle) -> AppResult<HashMap<String, String>> {
    let root = worlds_root(handle)?;
    let mut index = HashMap::new();
    if !root.is_dir() {
        return Ok(index);
    }

    for entry in fs::read_dir(&root).map_err(|e| AppError::Internal(e.to_string()))? {
        let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
        if !entry.file_type().map_err(|e| AppError::Internal(e.to_string()))?.is_dir() {
            continue;
        }
        let folder = entry.path();
        let storage_uuid = entry
            .file_name()
            .into_string()
            .map_err(|_| AppError::Internal("invalid storage folder name".into()))?;
        if campaign_json_path(&folder).is_file() {
            let campaign = read_campaign_json(&folder)?;
            index.insert(campaign.id, storage_uuid);
        }
    }
    Ok(index)
}

pub fn resolve_storage_folder(handle: &AppHandle, campaign_id: &str) -> AppResult<PathBuf> {
    let root = worlds_root(handle)?;
    for entry in fs::read_dir(&root).map_err(|e| AppError::Internal(e.to_string()))? {
        let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
        if !entry.file_type().map_err(|e| AppError::Internal(e.to_string()))?.is_dir() {
            continue;
        }
        let folder = entry.path();
        if !campaign_json_path(&folder).is_file() {
            continue;
        }
        let campaign = read_campaign_json(&folder)?;
        if campaign.id == campaign_id {
            return Ok(folder);
        }
    }
    Err(AppError::NotFound(format!("campaign {campaign_id}")))
}

pub fn campaign_exists(handle: &AppHandle, campaign_id: &str) -> bool {
    resolve_storage_folder(handle, campaign_id).is_ok()
}

fn names_match(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

/// Campaigns whose `name` matches (case-insensitive). Empty if none; error if multiple.
pub fn find_campaigns_by_name(handle: &AppHandle, name: &str) -> AppResult<Vec<Campaign>> {
    let needle = name.trim();
    if needle.is_empty() {
        return Ok(vec![]);
    }
    Ok(list_campaigns(handle)?
        .into_iter()
        .filter(|c| names_match(&c.name, needle))
        .collect())
}

pub fn find_campaign_by_name(handle: &AppHandle, name: &str) -> AppResult<Option<Campaign>> {
    let matches = find_campaigns_by_name(handle, name)?;
    match matches.len() {
        0 => Ok(None),
        1 => Ok(Some(matches.into_iter().next().unwrap())),
        n => Err(AppError::Internal(format!(
            "found {n} campaigns named \"{name}\"; rename duplicates before import"
        ))),
    }
}

pub fn unique_campaign_slug(handle: &AppHandle, base: &str) -> AppResult<String> {
    unique_campaign_slug_excluding(handle, base, None)
}

/// Allocates a slug unique among all campaigns, optionally ignoring `exclude_campaign_id`'s current slug.
pub fn unique_campaign_slug_excluding(
    handle: &AppHandle,
    base: &str,
    exclude_campaign_id: Option<&str>,
) -> AppResult<String> {
    let existing: std::collections::HashSet<String> = list_campaigns(handle)?
        .into_iter()
        .filter(|c| {
            exclude_campaign_id
                .map(|id| c.id != id)
                .unwrap_or(true)
        })
        .map(|c| c.slug)
        .collect();

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
        if !existing.contains(&slug) {
            return Ok(slug);
        }
    }

    Err(AppError::Internal(
        "could not allocate unique campaign slug".into(),
    ))
}

pub fn create_storage_folder(handle: &AppHandle) -> AppResult<(PathBuf, String)> {
    let root = ensure_worlds_root(handle)?;
    let storage_uuid = Uuid::now_v7().to_string();
    let folder = storage_folder(&root, &storage_uuid);
    fs::create_dir_all(&folder).map_err(|e| AppError::Internal(e.to_string()))?;
    fs::create_dir_all(images_dir(&folder)).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok((folder, storage_uuid))
}
