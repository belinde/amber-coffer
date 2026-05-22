"""
Validates: Requirements 3.2

Preservation property: _iter_audio_sources correctly converts sessionOffsetMs
to session_offset_s for v2 manifest chunks.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from amber_whisper.transcribe import _iter_audio_sources


def _make_session_dir(tmp_path: Path, chunks: list[dict]) -> tuple[Path, dict]:
    """Create a minimal session directory with a v2 manifest and dummy audio files."""
    session_dir = tmp_path / "session"
    session_dir.mkdir(parents=True, exist_ok=True)

    # Create audio files referenced by chunks
    for chunk in chunks:
        rel = chunk["relativePath"]
        audio_path = session_dir / rel
        audio_path.parent.mkdir(parents=True, exist_ok=True)
        # Write enough bytes to be a valid file (> 0 bytes)
        audio_path.write_bytes(b"\x00" * 512)

    manifest = {
        "version": 2,
        "sessionId": "test-session-id",
        "sourceKind": "discord_capture",
        "startedAt": 1700000000000,
        "endedAt": 1700003600000,
        "channelId": "123456789",
        "chunks": chunks,
    }

    audio_dir = session_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = audio_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    return session_dir, manifest


# Strategy for generating valid sessionOffsetMs values (0 to 7200000 ms = 2 hours)
offset_ms_strategy = st.integers(min_value=0, max_value=7_200_000)

# Strategy for generating a chunk configuration
chunk_strategy = st.fixed_dictionaries(
    {
        "discordUserId": st.from_regex(r"[0-9]{17,20}", fullmatch=True),
        "displayName": st.text(min_size=1, max_size=20, alphabet=st.characters(categories=("L", "N"))),
        "sessionOffsetMs": offset_ms_strategy,
        "durationMs": st.integers(min_value=1000, max_value=600_000),
        "codec": st.just("opus_ogg"),
        "sampleRate": st.just(48000),
        "channels": st.just(2),
    }
)


@given(
    chunks_data=st.lists(chunk_strategy, min_size=1, max_size=10),
)
@settings(max_examples=200, deadline=None)
def test_session_offset_s_equals_session_offset_ms_divided_by_1000(
    chunks_data: list[dict],
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    """For all non-negative integer sessionOffsetMs values,
    _iter_audio_sources produces session_offset_s == sessionOffsetMs / 1000.0"""
    tmp_path = tmp_path_factory.mktemp("session")

    # Assign unique relative paths to each chunk
    chunks = []
    for i, data in enumerate(chunks_data):
        user_id = data["discordUserId"]
        chunk = {
            **data,
            "relativePath": f"audio/discord/{user_id}/{i:04d}.ogg",
        }
        chunks.append(chunk)

    session_dir, manifest = _make_session_dir(tmp_path, chunks)

    sources = list(_iter_audio_sources(session_dir, manifest))

    assert len(sources) == len(chunks), (
        f"Expected {len(chunks)} sources, got {len(sources)}"
    )

    for source, chunk in zip(sources, chunks):
        expected_offset_s = chunk["sessionOffsetMs"] / 1000.0
        assert source.session_offset_s == expected_offset_s, (
            f"Expected session_offset_s={expected_offset_s}, "
            f"got {source.session_offset_s} for sessionOffsetMs={chunk['sessionOffsetMs']}"
        )
