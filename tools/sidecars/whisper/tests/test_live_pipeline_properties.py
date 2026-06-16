"""
Property-based tests for live pipeline utilities.

Validates: Requirements 3.3, 3.4, 7.5, 8.1, 8.5
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from hypothesis import given, settings
from hypothesis import strategies as st

from amber_whisper.live_pipeline import (
    _discover_new_wavs,
    default_pipeline_state,
    derive_ui_state,
    is_file_stable,
    parse_pipeline_state,
    transcription_output_path,
)


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Valid path stems: alphanumeric with underscores, non-empty
path_stem_strategy = st.from_regex(r"[a-z0-9][a-z0-9_]{0,30}", fullmatch=True)

# Directory components
dir_component_strategy = st.from_regex(r"[a-z][a-z0-9_]{0,15}", fullmatch=True)

# Valid pipeline statuses
valid_status_strategy = st.sampled_from(["starting", "ready", "active", "draining", "stopped"])

# Invalid pipeline statuses (not in enum)
invalid_status_strategy = st.text(min_size=1, max_size=20).filter(
    lambda s: s not in ("starting", "ready", "active", "draining", "stopped")
)

# Epoch milliseconds (reasonable range)
epoch_ms_strategy = st.integers(min_value=0, max_value=2_000_000_000_000)


# ---------------------------------------------------------------------------
# Property 4: Transcription output naming convention
# ---------------------------------------------------------------------------


@given(
    dir_parts=st.lists(dir_component_strategy, min_size=1, max_size=4),
    stem=path_stem_strategy,
)
@settings(max_examples=100, deadline=None)
def test_transcription_output_path_same_dir_same_stem_md_extension(
    dir_parts: list[str],
    stem: str,
) -> None:
    """For any .wav path, transcription_output_path returns same dir, same stem, .md extension.

    Validates: Requirements 3.3
    """
    dir_path = Path("/").joinpath(*dir_parts)
    wav_path = dir_path / f"{stem}.wav"

    result = transcription_output_path(wav_path)

    assert result.parent == wav_path.parent, "Output must be in the same directory"
    assert result.stem == wav_path.stem, "Output must have the same stem"
    assert result.suffix == ".md", "Output must have .md extension"


# ---------------------------------------------------------------------------
# Property 10: Pipeline state file parsing
# ---------------------------------------------------------------------------


@given(
    status=valid_status_strategy,
    chunks_transcribed=st.integers(min_value=0, max_value=100_000),
    chunks_pending=st.integers(min_value=0, max_value=100_000),
    last_updated_at=st.integers(min_value=0, max_value=2_000_000_000),
)
@settings(max_examples=100, deadline=None)
def test_parse_pipeline_state_valid_json(
    status: str,
    chunks_transcribed: int,
    chunks_pending: int,
    last_updated_at: int,
) -> None:
    """Valid JSON with correct schema parses to matching struct.

    Validates: Requirements 8.1
    """
    state = {
        "status": status,
        "chunksTranscribed": chunks_transcribed,
        "chunksPending": chunks_pending,
        "lastUpdatedAt": last_updated_at,
        "errors": [],
    }
    content = json.dumps(state)

    result = parse_pipeline_state(content)

    assert result["status"] == status
    assert result["chunksTranscribed"] == chunks_transcribed
    assert result["chunksPending"] == chunks_pending
    assert result["lastUpdatedAt"] == last_updated_at
    assert result["errors"] == []


# ---------------------------------------------------------------------------
# Property 11: File stability check decision
# ---------------------------------------------------------------------------


@given(
    mtime_ms=epoch_ms_strategy,
    current_time_ms=epoch_ms_strategy,
)
@settings(max_examples=100, deadline=None)
def test_file_stability_check_decision(
    mtime_ms: int,
    current_time_ms: int,
) -> None:
    """File is stable iff currentTime - lastModified >= 500ms.

    Validates: Requirements 3.4
    """
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        test_file = Path(f.name)
        # Mock os.path.getmtime to return our controlled mtime
        with patch("amber_whisper.live_pipeline.os.path.getmtime", return_value=mtime_ms / 1000.0):
            result = is_file_stable(test_file, current_time_ms)

    expected = (current_time_ms - mtime_ms) >= 500
    assert result == expected, (
        f"is_file_stable should be {expected} for "
        f"current_time_ms={current_time_ms}, mtime_ms={mtime_ms}, "
        f"diff={current_time_ms - mtime_ms}"
    )


# ---------------------------------------------------------------------------
# Property 12: Pipeline state to UI state derivation
# ---------------------------------------------------------------------------


@given(status=valid_status_strategy)
@settings(max_examples=100, deadline=None)
def test_derive_ui_state_active_or_draining(status: str) -> None:
    """transcriptionActive is true iff status is 'active' or 'draining'.

    Validates: Requirements 8.1
    """
    result = derive_ui_state(status)
    expected = status in ("active", "draining")
    assert result == expected, (
        f"derive_ui_state('{status}') should be {expected}, got {result}"
    )


# ---------------------------------------------------------------------------
# Property 13: Missing state file fallback
# ---------------------------------------------------------------------------


@given(
    content=st.one_of(
        st.just(""),
        st.just("null"),
        st.just("[]"),
        st.just("{"),
        st.just("not json at all"),
        st.text(min_size=0, max_size=50).filter(lambda s: s.strip() not in ("", )),
        st.builds(
            json.dumps,
            st.fixed_dictionaries({"status": invalid_status_strategy}),
        ),
    ),
)
@settings(max_examples=100, deadline=None)
def test_missing_state_file_fallback(content: str) -> None:
    """Invalid/empty/absent content returns defaults (stopped, 0, 0).

    Validates: Requirements 8.5
    """
    result = parse_pipeline_state(content)
    defaults = default_pipeline_state()

    assert result["status"] == defaults["status"]
    assert result["chunksTranscribed"] == defaults["chunksTranscribed"]
    assert result["chunksPending"] == defaults["chunksPending"]
    assert result["lastUpdatedAt"] == defaults["lastUpdatedAt"]
    assert result["errors"] == defaults["errors"]


# ---------------------------------------------------------------------------
# Property 14: Chunk processing order preservation
# ---------------------------------------------------------------------------


@given(
    user_ids=st.lists(
        st.from_regex(r"[0-9]{17,20}", fullmatch=True),
        min_size=1,
        max_size=3,
        unique=True,
    ),
    filenames_per_user=st.lists(
        st.lists(
            st.from_regex(r"[0-9]{10}", fullmatch=True),
            min_size=1,
            max_size=5,
            unique=True,
        ),
        min_size=1,
        max_size=3,
    ),
)
@settings(max_examples=100, deadline=None)
def test_chunk_processing_order_preservation(
    user_ids: list[str],
    filenames_per_user: list[list[str]],
) -> None:
    """Discovered paths are processed in sorted (FIFO) order within user dirs.

    Validates: Requirements 7.5
    """
    import tempfile

    with tempfile.TemporaryDirectory() as tmp_dir:
        session_dir = Path(tmp_dir) / "session"
        audio_root = session_dir / "audio" / "discord"

        # Trim filenames list to match user_ids length
        filenames_list = filenames_per_user[: len(user_ids)]
        while len(filenames_list) < len(user_ids):
            filenames_list.append(["1700000000"])

        # Create wav files for each user
        all_expected: list[Path] = []
        for user_id in sorted(user_ids):
            idx = sorted(user_ids).index(user_id)
            user_dir = audio_root / user_id
            user_dir.mkdir(parents=True, exist_ok=True)
            fnames = sorted(filenames_list[idx])
            for fname in fnames:
                wav_file = user_dir / f"{fname}.wav"
                wav_file.write_bytes(b"\x00" * 64)
                all_expected.append(wav_file)

        processed: set[Path] = set()
        result = _discover_new_wavs(session_dir, processed)

        # Results should be in sorted order (user dirs sorted, files within sorted)
        assert result == all_expected, (
            f"Discovery order must be sorted. Expected {all_expected}, got {result}"
        )
        # All discovered files have .wav extension
        for p in result:
            assert p.suffix == ".wav"
