use crate::error::AppError;
use crate::validation_issue::{enum_invalid, required_field};

const VISIBILITY_VALUES: &[&str] = &["gm_only", "shared", "public_canon"];

pub fn validate_visibility(visibility: &str) -> Result<(), AppError> {
    if VISIBILITY_VALUES.contains(&visibility) {
        Ok(())
    } else {
        Err(enum_invalid(&["visibility"]))
    }
}

pub fn validate_lore_kind(kind: &str) -> Result<(), AppError> {
    const KINDS: &[&str] = &[
        "concept",
        "history",
        "culture",
        "economy",
        "religion",
        "cosmology",
        "custom",
    ];
    if KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(enum_invalid(&["kind"]))
    }
}

pub fn validate_seed_status(status: &str) -> Result<(), AppError> {
    const STATUSES: &[&str] = &["idea", "planned", "introduced", "closed", "discarded"];
    if STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(enum_invalid(&["status"]))
    }
}

pub fn validate_faction_kind(kind: Option<&str>) -> Result<(), AppError> {
    let Some(kind) = kind else {
        return Ok(());
    };
    const KINDS: &[&str] = &[
        "state",
        "kingdom",
        "company",
        "guild",
        "cult",
        "family",
        "other",
    ];
    if KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(enum_invalid(&["kind"]))
    }
}

pub fn validate_session_play_state(play_state: &str) -> Result<(), AppError> {
    const STATES: &[&str] = &["preparing", "live", "ended"];
    if STATES.contains(&play_state) {
        Ok(())
    } else {
        Err(enum_invalid(&["playState"]))
    }
}

pub fn validate_session_status(status: &str) -> Result<(), AppError> {
    const STATUSES: &[&str] = &[
        "planned",
        "recording",
        "recorded",
        "transcribing",
        "transcribed",
        "refining",
        "refined",
        "validating",
        "published",
    ];
    if STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(enum_invalid(&["status"]))
    }
}

pub fn validate_npc_record_kind(kind: &str) -> Result<(), AppError> {
    if kind == "canonical" || kind == "scratch" {
        Ok(())
    } else {
        Err(enum_invalid(&["recordKind"]))
    }
}

pub fn validate_title_not_empty(title: &str) -> Result<(), AppError> {
    if title.trim().is_empty() {
        Err(required_field(&["title"]))
    } else {
        Ok(())
    }
}
