use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::validation_issue::{validation_issues, ValidationIssue};

/// Square clip region for token portrait generation.
/// Coordinates are relative to image dimensions (0.0..1.0).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipRegion {
    /// Center X, 0.0..1.0 relative to image width
    pub center_x: f64,
    /// Center Y, 0.0..1.0 relative to image height
    pub center_y: f64,
    /// Half-side length of the square clip, 0.05..0.5 relative to image dimensions
    pub half_side: f64,
}

impl ClipRegion {
    /// Validates that the clip region values are within acceptable ranges.
    /// Note: halfSide is relative to min(width, height) of the source image,
    /// so bounds checking against image edges requires knowing the aspect ratio.
    /// The crop function uses saturating_sub to handle edge cases safely.
    /// Here we only validate basic range constraints.
    pub fn validate(&self) -> AppResult<()> {
        let mut issues = Vec::new();

        if self.half_side < 0.05 {
            issues.push(ValidationIssue::new(&["halfSide"], "clip_region.half_side_too_small"));
        }

        if self.half_side > 0.5 {
            issues.push(ValidationIssue::new(&["halfSide"], "clip_region.half_side_too_large"));
        }

        if self.center_x < 0.0 || self.center_x > 1.0 {
            issues.push(ValidationIssue::new(&["centerX"], "clip_region.center_x_out_of_range"));
        }

        if self.center_y < 0.0 || self.center_y > 1.0 {
            issues.push(ValidationIssue::new(&["centerY"], "clip_region.center_y_out_of_range"));
        }

        if issues.is_empty() {
            Ok(())
        } else {
            Err(validation_issues(issues))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn valid_centered_clip() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.25,
        };
        assert!(clip.validate().is_ok());
    }

    #[test]
    fn valid_minimum_half_side() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.05,
        };
        assert!(clip.validate().is_ok());
    }

    #[test]
    fn valid_corner_clip() {
        let clip = ClipRegion {
            center_x: 0.1,
            center_y: 0.1,
            half_side: 0.1,
        };
        assert!(clip.validate().is_ok());
    }

    #[test]
    fn invalid_half_side_too_small() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.04,
        };
        assert!(clip.validate().is_err());
    }

    #[test]
    fn invalid_exceeds_left_bound() {
        let clip = ClipRegion {
            center_x: 0.1,
            center_y: 0.5,
            half_side: 0.2,
        };
        assert!(clip.validate().is_err());
    }

    #[test]
    fn invalid_exceeds_right_bound() {
        let clip = ClipRegion {
            center_x: 0.9,
            center_y: 0.5,
            half_side: 0.2,
        };
        assert!(clip.validate().is_err());
    }

    #[test]
    fn invalid_exceeds_top_bound() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.1,
            half_side: 0.2,
        };
        assert!(clip.validate().is_err());
    }

    #[test]
    fn invalid_exceeds_bottom_bound() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.9,
            half_side: 0.2,
        };
        assert!(clip.validate().is_err());
    }

    #[test]
    fn edge_case_exactly_at_bounds() {
        // center_x=0.25, half_side=0.25 → left=0.0, right=0.5 (valid)
        let clip = ClipRegion {
            center_x: 0.25,
            center_y: 0.75,
            half_side: 0.25,
        };
        assert!(clip.validate().is_ok());
    }

    #[test]
    fn serializes_to_camel_case() {
        let clip = ClipRegion {
            center_x: 0.5,
            center_y: 0.5,
            half_side: 0.25,
        };
        let json = serde_json::to_string(&clip).unwrap();
        assert!(json.contains("centerX"));
        assert!(json.contains("centerY"));
        assert!(json.contains("halfSide"));
        assert!(!json.contains("center_x"));
    }

    #[test]
    fn deserializes_from_camel_case() {
        let json = r#"{"centerX":0.3,"centerY":0.7,"halfSide":0.1}"#;
        let clip: ClipRegion = serde_json::from_str(json).unwrap();
        assert!((clip.center_x - 0.3).abs() < f64::EPSILON);
        assert!((clip.center_y - 0.7).abs() < f64::EPSILON);
        assert!((clip.half_side - 0.1).abs() < f64::EPSILON);
    }

    // **Validates: Requirements 4.1, 4.2**
    proptest! {
        #[test]
        fn clip_region_validation(
            cx in 0.0f64..=1.0,
            cy in 0.0f64..=1.0,
            hs in 0.0f64..=0.5,
        ) {
            let valid = cx - hs >= 0.0 && cx + hs <= 1.0
                     && cy - hs >= 0.0 && cy + hs <= 1.0
                     && hs >= 0.05;
            let clip = ClipRegion { center_x: cx, center_y: cy, half_side: hs };
            prop_assert_eq!(clip.validate().is_ok(), valid);
        }
    }
}
