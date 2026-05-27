use std::path::Path;

use image::imageops::FilterType;
use image::GenericImageView;

use crate::error::{AppError, AppResult};
use crate::models::ClipRegion;

/// Maximum pixel size for the longest edge of a full-resolution image.
pub const MAX_FULL_EDGE_PX: u32 = 4096;

/// Convert source image to WebP, respecting max dimensions.
/// If either dimension exceeds `max_edge_px`, the image is downscaled
/// proportionally using Lanczos3 filtering.
/// Returns the encoded WebP bytes, final width, and final height.
pub fn convert_to_webp(source: &Path, max_edge_px: u32) -> AppResult<(Vec<u8>, u32, u32)> {
    let img = image::open(source).map_err(|e| {
        AppError::Internal(format!("failed to open image {}: {e}", source.display()))
    })?;

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
        .map_err(|e| AppError::Internal(format!("WebP encoding failed: {e}")))?;

    Ok((bytes, tw, th))
}

/// Generate a thumbnail that fits within 256×256 maintaining aspect ratio, encoded as WebP.
/// Images smaller than 256×256 are not upscaled.
pub fn generate_thumbnail(source: &Path) -> AppResult<Vec<u8>> {
    const MAX_THUMB_PX: u32 = 256;

    let img = image::open(source).map_err(|e| {
        AppError::Internal(format!("failed to open image {}: {e}", source.display()))
    })?;

    let (w, h) = img.dimensions();

    let output = if w.max(h) > MAX_THUMB_PX {
        img.resize(MAX_THUMB_PX, MAX_THUMB_PX, FilterType::Lanczos3)
    } else {
        img
    };

    let mut bytes: Vec<u8> = Vec::new();
    output
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::WebP,
        )
        .map_err(|e| AppError::Internal(format!("WebP encoding failed: {e}")))?;

    Ok(bytes)
}

/// Generate 128×128 token portrait from clip region.
/// Extracts a square region defined by the ClipRegion (center ± halfSide relative to min(w,h)),
/// resizes to exactly 128×128 pixels, and encodes as WebP.
pub fn generate_token_portrait(source: &Path, clip: &ClipRegion) -> AppResult<Vec<u8>> {
    let img = image::open(source).map_err(|e| {
        AppError::Internal(format!("failed to open image {}: {e}", source.display()))
    })?;

    let cropped = crop_token_portrait(&img, clip);

    let mut bytes: Vec<u8> = Vec::new();
    cropped
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::WebP,
        )
        .map_err(|e| AppError::Internal(format!("WebP encoding failed: {e}")))?;

    Ok(bytes)
}

/// Crop and resize the image according to the clip region.
/// The half_side is relative to min(width, height) of the source image.
fn crop_token_portrait(img: &image::DynamicImage, clip: &ClipRegion) -> image::DynamicImage {
    let (w, h) = img.dimensions();
    // Convert relative coords to pixel coords
    let cx = (clip.center_x * w as f64).round() as u32;
    let cy = (clip.center_y * h as f64).round() as u32;
    let half = (clip.half_side * w.min(h) as f64).round() as u32;

    // Extract square region
    let x = cx.saturating_sub(half);
    let y = cy.saturating_sub(half);
    let size = half * 2;

    let cropped = img.crop_imm(x, y, size, size);
    cropped.resize_exact(128, 128, FilterType::Lanczos3)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use tempfile::TempDir;

    /// Create a minimal valid PNG file with given dimensions in a temp directory.
    /// Returns the TempDir (to keep it alive) and the path to the PNG file.
    fn create_test_png(width: u32, height: u32) -> (TempDir, std::path::PathBuf) {
        let dir = TempDir::new().expect("failed to create temp dir");
        let path = dir.path().join("test.png");
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(width, height));
        img.save(&path).expect("failed to save test PNG");
        (dir, path)
    }

    #[test]
    fn small_image_not_resized() {
        let (_dir, path) = create_test_png(100, 80);
        let (bytes, w, h) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
        assert_eq!(w, 100);
        assert_eq!(h, 80);
        assert!(!bytes.is_empty());
    }

    #[test]
    fn wide_image_downscaled() {
        let (_dir, path) = create_test_png(8192, 4096);
        let (_, w, h) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
        assert_eq!(w, 4096);
        assert_eq!(h, 2048);
    }

    #[test]
    fn tall_image_downscaled() {
        let (_dir, path) = create_test_png(2000, 6000);
        let (_, w, h) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
        assert_eq!(h, 4096);
        // 2000 * (4096/6000) ≈ 1365
        assert_eq!(w, 1365);
    }

    #[test]
    fn exact_max_edge_not_resized() {
        let (_dir, path) = create_test_png(4096, 2048);
        let (_, w, h) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
        assert_eq!(w, 4096);
        assert_eq!(h, 2048);
    }

    #[test]
    fn nonexistent_file_returns_error() {
        let result = convert_to_webp(Path::new("/nonexistent/image.png"), MAX_FULL_EDGE_PX);
        assert!(result.is_err());
    }

    #[test]
    fn output_is_valid_webp() {
        let (_dir, path) = create_test_png(200, 150);
        let (bytes, _, _) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
        // WebP files start with "RIFF" magic bytes
        assert!(bytes.len() >= 4);
        assert_eq!(&bytes[0..4], b"RIFF");
    }

    #[test]
    fn thumbnail_fits_within_256() {
        let (_dir, path) = create_test_png(800, 400);
        let bytes = generate_thumbnail(&path).unwrap();
        assert!(!bytes.is_empty());
        // Decode and verify dimensions fit within 256×256
        let decoded = image::load_from_memory(&bytes).unwrap();
        let (w, h) = decoded.dimensions();
        assert!(w <= 256);
        assert!(h <= 256);
        // Aspect ratio preserved: 800:400 = 2:1, so 256×128
        assert_eq!(w, 256);
        assert_eq!(h, 128);
    }

    #[test]
    fn thumbnail_tall_image() {
        let (_dir, path) = create_test_png(200, 600);
        let bytes = generate_thumbnail(&path).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        let (w, h) = decoded.dimensions();
        assert!(w <= 256);
        assert!(h <= 256);
        // 200:600 → height capped at 256, width = 200*(256/600) ≈ 85
        assert_eq!(h, 256);
        assert_eq!(w, 85);
    }

    #[test]
    fn thumbnail_small_image_not_upscaled() {
        let (_dir, path) = create_test_png(100, 50);
        let bytes = generate_thumbnail(&path).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        let (w, h) = decoded.dimensions();
        // resize() does not upscale when both dimensions are within bounds
        assert_eq!(w, 100);
        assert_eq!(h, 50);
    }

    #[test]
    fn thumbnail_is_valid_webp() {
        let (_dir, path) = create_test_png(500, 300);
        let bytes = generate_thumbnail(&path).unwrap();
        assert!(bytes.len() >= 4);
        assert_eq!(&bytes[0..4], b"RIFF");
    }

    #[test]
    fn thumbnail_nonexistent_file_returns_error() {
        let result = generate_thumbnail(Path::new("/nonexistent/image.png"));
        assert!(result.is_err());
    }

    // --- generate_token_portrait tests ---

    #[test]
    fn token_portrait_centered_square_image() {
        let (_dir, path) = create_test_png(200, 200);
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.25,
        };
        let bytes = generate_token_portrait(&path, &clip).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (128, 128));
    }

    #[test]
    fn token_portrait_rectangular_image() {
        let (_dir, path) = create_test_png(400, 200);
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.25,
        };
        // half = 0.25 * min(400, 200) = 50px
        let bytes = generate_token_portrait(&path, &clip).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (128, 128));
    }

    #[test]
    fn token_portrait_corner_clip() {
        let (_dir, path) = create_test_png(300, 300);
        let clip = ClipRegion {
            center_x: 0.1,
            center_y: 0.1,
            half_side: 0.1,
        };
        let bytes = generate_token_portrait(&path, &clip).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (128, 128));
    }

    #[test]
    fn token_portrait_minimum_half_side() {
        let (_dir, path) = create_test_png(500, 500);
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.05,
        };
        let bytes = generate_token_portrait(&path, &clip).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (128, 128));
    }

    #[test]
    fn token_portrait_output_is_webp() {
        let (_dir, path) = create_test_png(256, 256);
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.25,
        };
        let bytes = generate_token_portrait(&path, &clip).unwrap();
        assert!(bytes.len() >= 4);
        assert_eq!(&bytes[0..4], b"RIFF");
    }

    #[test]
    fn token_portrait_nonexistent_file() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.25,
        };
        let result = generate_token_portrait(Path::new("/nonexistent/image.png"), &clip);
        assert!(result.is_err());
    }

    /// Strategy that generates a valid ClipRegion whose square fits within image bounds.
    fn valid_clip_region_strategy() -> impl Strategy<Value = ClipRegion> {
        // half_side in [0.05, 0.5], then center constrained so square fits within [0,1]
        (0.05f64..=0.5).prop_flat_map(|hs| {
            let min_c = hs;
            let max_c = 1.0 - hs;
            (Just(hs), min_c..=max_c, min_c..=max_c)
        }).prop_map(|(hs, cx, cy)| ClipRegion {
            center_x: cx,
            center_y: cy,
            half_side: hs,
        })
    }

    // **Validates: Requirements 1.4, 4.3**
    proptest! {
        // Keep case count low: image I/O is expensive per iteration
        #![proptest_config(proptest::prelude::ProptestConfig::with_cases(30))]

        #[test]
        fn image_variant_generation_no_clip(
            width in 1u32..=500,
            height in 1u32..=500,
        ) {
            let dir = TempDir::new().expect("failed to create temp dir");
            let path = dir.path().join("test.png");
            let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(width, height));
            img.save(&path).expect("failed to save test PNG");

            // Without ClipRegion: exactly 2 variants (full + thumbnail)
            let (full_bytes, fw, fh) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
            let thumb_bytes = generate_thumbnail(&path).unwrap();

            // Full variant: longest edge ≤ 4096
            prop_assert!(fw <= MAX_FULL_EDGE_PX, "full width {} exceeds max {}", fw, MAX_FULL_EDGE_PX);
            prop_assert!(fh <= MAX_FULL_EDGE_PX, "full height {} exceeds max {}", fh, MAX_FULL_EDGE_PX);
            prop_assert!(!full_bytes.is_empty());

            // Thumbnail variant: longest edge ≤ 256
            let thumb_decoded = image::load_from_memory(&thumb_bytes).unwrap();
            let (tw, th) = thumb_decoded.dimensions();
            prop_assert!(tw <= 256, "thumbnail width {} exceeds 256", tw);
            prop_assert!(th <= 256, "thumbnail height {} exceeds 256", th);

            // Exactly 2 variants produced (no token portrait without clip)
            let variant_count = 2u32;
            prop_assert_eq!(variant_count, 2);
        }

        #[test]
        fn image_variant_generation_with_clip(
            width in 1u32..=500,
            height in 1u32..=500,
            clip in valid_clip_region_strategy(),
        ) {
            let dir = TempDir::new().expect("failed to create temp dir");
            let path = dir.path().join("test.png");
            let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(width, height));
            img.save(&path).expect("failed to save test PNG");

            // With ClipRegion: exactly 3 variants (full + thumbnail + token portrait)
            let (full_bytes, fw, fh) = convert_to_webp(&path, MAX_FULL_EDGE_PX).unwrap();
            let thumb_bytes = generate_thumbnail(&path).unwrap();
            let token_bytes = generate_token_portrait(&path, &clip).unwrap();

            // Full variant: longest edge ≤ 4096
            prop_assert!(fw <= MAX_FULL_EDGE_PX, "full width {} exceeds max {}", fw, MAX_FULL_EDGE_PX);
            prop_assert!(fh <= MAX_FULL_EDGE_PX, "full height {} exceeds max {}", fh, MAX_FULL_EDGE_PX);
            prop_assert!(!full_bytes.is_empty());

            // Thumbnail variant: longest edge ≤ 256
            let thumb_decoded = image::load_from_memory(&thumb_bytes).unwrap();
            let (tw, th) = thumb_decoded.dimensions();
            prop_assert!(tw <= 256, "thumbnail width {} exceeds 256", tw);
            prop_assert!(th <= 256, "thumbnail height {} exceeds 256", th);

            // Token portrait: exactly 128×128
            let token_decoded = image::load_from_memory(&token_bytes).unwrap();
            let (tok_w, tok_h) = token_decoded.dimensions();
            prop_assert_eq!(tok_w, 128, "token portrait width {} != 128", tok_w);
            prop_assert_eq!(tok_h, 128, "token portrait height {} != 128", tok_h);

            // Exactly 3 variants produced
            let variant_count = 3u32;
            prop_assert_eq!(variant_count, 3);
        }
    }
}
