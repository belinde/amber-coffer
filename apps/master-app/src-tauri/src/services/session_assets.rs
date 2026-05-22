use std::path::Path;

use image::imageops::FilterType;
use image::GenericImageView;
use reqwest::header::CONTENT_TYPE;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresignResponse {
    upload_url: String,
    public_path: String,
    #[allow(dead_code)]
    object_key: String,
    #[allow(dead_code)]
    expires_at: i64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PresignRequestBody<'a> {
    campaign_id: &'a str,
    session_id: &'a str,
    asset_kind: &'a str,
    content_type: &'a str,
    content_length: usize,
}

pub struct UploadedSessionAsset {
    pub public_path: String,
    pub hash: String,
    pub width_px: u32,
    pub height_px: u32,
}

pub fn normalize_image_to_webp(source: &Path, max_edge_px: u32) -> AppResult<(Vec<u8>, u32, u32)> {
    let img = image::open(source).map_err(|e| AppError::Internal(e.to_string()))?;
    let (w, h) = img.dimensions();
    let (tw, th) = if w.max(h) <= max_edge_px {
        (w, h)
    } else if w >= h {
        let tw = max_edge_px;
        let th = (h as f64 * (max_edge_px as f64 / w as f64)).round() as u32;
        (tw, th.max(1))
    } else {
        let th = max_edge_px;
        let tw = (w as f64 * (max_edge_px as f64 / h as f64)).round() as u32;
        (tw.max(1), th)
    };

    let resized = if (tw, th) != (w, h) {
        img.resize(tw, th, FilterType::Lanczos3)
    } else {
        img
    };

    let mut bytes: Vec<u8> = Vec::new();
    resized
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::WebP,
        )
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok((bytes, tw, th))
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{:x}", digest)
}

async fn request_presigned_upload(
    sync_api_base_url: &str,
    session_token: &str,
    campaign_id: &str,
    session_id: &str,
    asset_kind: &str,
    content_length: usize,
) -> AppResult<PresignResponse> {
    let base = sync_api_base_url.trim_end_matches('/');
    let url = format!("{base}/session/assets/presign");
    let body = PresignRequestBody {
        campaign_id,
        session_id,
        asset_kind,
        content_type: "image/webp",
        content_length,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("authorization", format!("Bearer {session_token}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "presign_failed:{status}:{text}"
        )));
    }

    response
        .json::<PresignResponse>()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))
}

pub async fn put_presigned_webp(upload_url: &str, bytes: &[u8]) -> AppResult<()> {
    let client = reqwest::Client::new();
    let response = client
        .put(upload_url)
        .header(CONTENT_TYPE, "image/webp")
        .body(bytes.to_vec())
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "s3_upload_failed:{status}:{text}"
        )));
    }
    Ok(())
}

pub async fn upload_session_image(
    sync_api_base_url: &str,
    session_token: &str,
    campaign_id: &str,
    session_id: &str,
    asset_kind: &str,
    source: &Path,
    max_edge_px: u32,
) -> AppResult<UploadedSessionAsset> {
    let (bytes, width_px, height_px) = normalize_image_to_webp(source, max_edge_px)?;
    let hash = hash_bytes(&bytes);
    let presign = request_presigned_upload(
        sync_api_base_url,
        session_token,
        campaign_id,
        session_id,
        asset_kind,
        bytes.len(),
    )
    .await?;
    put_presigned_webp(&presign.upload_url, &bytes).await?;
    Ok(UploadedSessionAsset {
        public_path: presign.public_path,
        hash,
        width_px,
        height_px,
    })
}
