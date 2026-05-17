use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::models::vault_json::ImageRef;

const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif"];

pub fn images_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(data_dir.join("images"))
}

pub fn entity_image_dir(
    app: &AppHandle,
    campaign_id: &str,
    entity_id: &str,
) -> Result<PathBuf, AppError> {
    Ok(images_root(app)?
        .join(campaign_id)
        .join(entity_id))
}

fn extension_from_path(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .filter(|ext| ALLOWED_EXTENSIONS.contains(&ext.as_str()))
}

pub fn hash_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|e| AppError::Internal(e.to_string()))?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{:x}", digest))
}

/// Copy source image into L1 storage; returns ImageRef with relative local path and hash.
pub fn copy_image_to_l1(
    app: &AppHandle,
    campaign_id: &str,
    entity_id: &str,
    source_path: &str,
) -> Result<ImageRef, AppError> {
    let source = PathBuf::from(source_path);
    if !source.is_file() {
        return Err(AppError::NotFound(format!("image_file:{source_path}")));
    }

    let extension = extension_from_path(&source).ok_or_else(|| {
        AppError::Internal(format!("unsupported image format: {source_path}"))
    })?;

    let dest_dir = entity_image_dir(app, campaign_id, entity_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| AppError::Internal(e.to_string()))?;

    let file_name = format!("original.{extension}");
    let dest_file = dest_dir.join(&file_name);
    fs::copy(&source, &dest_file).map_err(|e| AppError::Internal(e.to_string()))?;

    let hash = hash_file(&dest_file)?;
    let local = format!("{campaign_id}/{entity_id}/{file_name}");

    Ok(ImageRef {
        local: Some(local),
        hash: Some(hash),
        thumbnail_url: None,
        canon_url: None,
    })
}
