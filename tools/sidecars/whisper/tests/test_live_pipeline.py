"""Unit tests for live_pipeline module.

Tests file discovery, stability timeout, drain behavior, and error logging.
Requirements: 3.7, 3.8, 6.4, 7.2, 7.5
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from amber_whisper.live_pipeline import (
    _discover_new_wavs,
    _log_error,
    _read_signal,
    _write_state,
    is_file_stable,
)


# ---------------------------------------------------------------------------
# File discovery tests (Requirement 7.2 — polls audio dirs for .wav files)
# ---------------------------------------------------------------------------


class TestDiscoverNewWavs:
    """Test _discover_new_wavs finds .wav files and ignores others."""

    def test_finds_wav_files_ignores_md(self, tmp_path: Path) -> None:
        """Only .wav files are discovered, .md and other extensions are skipped."""
        user_dir = tmp_path / "audio" / "discord" / "user1"
        user_dir.mkdir(parents=True)
        (user_dir / "1719849600.wav").write_bytes(b"\x00" * 100)
        (user_dir / "1719849600.md").write_text("transcript", encoding="utf-8")
        (user_dir / "notes.txt").write_text("notes", encoding="utf-8")

        result = _discover_new_wavs(tmp_path, processed=set())

        assert len(result) == 1
        assert result[0].name == "1719849600.wav"

    def test_finds_wavs_across_multiple_users(self, tmp_path: Path) -> None:
        """Files from multiple user subdirectories are all discovered."""
        for user_id in ("user1", "user2"):
            user_dir = tmp_path / "audio" / "discord" / user_id
            user_dir.mkdir(parents=True)
            (user_dir / "1719849600.wav").write_bytes(b"\x00" * 100)

        result = _discover_new_wavs(tmp_path, processed=set())

        assert len(result) == 2

    def test_excludes_already_processed(self, tmp_path: Path) -> None:
        """Files already in the processed set are not returned."""
        user_dir = tmp_path / "audio" / "discord" / "user1"
        user_dir.mkdir(parents=True)
        wav1 = user_dir / "1719849600.wav"
        wav2 = user_dir / "1719849632.wav"
        wav1.write_bytes(b"\x00" * 100)
        wav2.write_bytes(b"\x00" * 100)

        result = _discover_new_wavs(tmp_path, processed={wav1})

        assert len(result) == 1
        assert result[0] == wav2

    def test_returns_sorted_order(self, tmp_path: Path) -> None:
        """Results are returned in sorted order (by user dir then filename)."""
        user_dir = tmp_path / "audio" / "discord" / "user1"
        user_dir.mkdir(parents=True)
        (user_dir / "1719849632.wav").write_bytes(b"\x00" * 100)
        (user_dir / "1719849600.wav").write_bytes(b"\x00" * 100)

        result = _discover_new_wavs(tmp_path, processed=set())

        assert result[0].name == "1719849600.wav"
        assert result[1].name == "1719849632.wav"

    def test_empty_when_no_audio_dir(self, tmp_path: Path) -> None:
        """Returns empty list when audio/discord/ directory doesn't exist."""
        result = _discover_new_wavs(tmp_path, processed=set())
        assert result == []

    def test_ignores_files_in_audio_root(self, tmp_path: Path) -> None:
        """Files directly in audio/discord/ (not in user subdirs) are ignored."""
        discord_dir = tmp_path / "audio" / "discord"
        discord_dir.mkdir(parents=True)
        (discord_dir / "stray.wav").write_bytes(b"\x00" * 100)

        result = _discover_new_wavs(tmp_path, processed=set())

        assert result == []


# ---------------------------------------------------------------------------
# Stability timeout tests (Requirement 7.5 — 500ms stability window)
# ---------------------------------------------------------------------------


class TestIsFileStable:
    """Test is_file_stable ensures files are old enough before processing."""

    def test_file_not_stable_when_too_recent(self, tmp_path: Path) -> None:
        """A file modified less than 500ms ago is not stable."""
        wav = tmp_path / "chunk.wav"
        wav.write_bytes(b"\x00" * 100)
        mtime_ms = int(os.path.getmtime(wav) * 1000)

        # Current time is 200ms after mtime — not stable
        assert is_file_stable(wav, mtime_ms + 200) is False

    def test_file_stable_when_old_enough(self, tmp_path: Path) -> None:
        """A file modified >= 500ms ago is stable."""
        wav = tmp_path / "chunk.wav"
        wav.write_bytes(b"\x00" * 100)
        mtime_ms = int(os.path.getmtime(wav) * 1000)

        # Current time is exactly 500ms after mtime — stable
        assert is_file_stable(wav, mtime_ms + 500) is True

    def test_file_stable_well_past_threshold(self, tmp_path: Path) -> None:
        """A file modified well past the threshold is stable."""
        wav = tmp_path / "chunk.wav"
        wav.write_bytes(b"\x00" * 100)
        mtime_ms = int(os.path.getmtime(wav) * 1000)

        assert is_file_stable(wav, mtime_ms + 5000) is True

    def test_file_not_stable_at_boundary(self, tmp_path: Path) -> None:
        """A file at exactly 499ms is not stable."""
        wav = tmp_path / "chunk.wav"
        wav.write_bytes(b"\x00" * 100)
        mtime_ms = int(os.path.getmtime(wav) * 1000)

        assert is_file_stable(wav, mtime_ms + 499) is False

    def test_nonexistent_file_is_not_stable(self, tmp_path: Path) -> None:
        """A file that doesn't exist returns False."""
        wav = tmp_path / "nonexistent.wav"
        assert is_file_stable(wav, int(time.time() * 1000)) is False

    def test_custom_min_age(self, tmp_path: Path) -> None:
        """Custom min_age_ms is respected."""
        wav = tmp_path / "chunk.wav"
        wav.write_bytes(b"\x00" * 100)
        mtime_ms = int(os.path.getmtime(wav) * 1000)

        # 800ms age, 1000ms threshold — not stable
        assert is_file_stable(wav, mtime_ms + 800, min_age_ms=1000) is False
        # 1000ms age, 1000ms threshold — stable
        assert is_file_stable(wav, mtime_ms + 1000, min_age_ms=1000) is True


# ---------------------------------------------------------------------------
# Drain behavior tests (Requirement 6.4 — signal read + drain logic)
# ---------------------------------------------------------------------------


class TestDrainBehavior:
    """Test _read_signal for stop signal detection (drives drain logic)."""

    def test_read_signal_returns_true_on_stop(self, tmp_path: Path) -> None:
        """Signal file with action=stop returns True."""
        signal_file = tmp_path / "pipeline-signal.json"
        signal_file.write_text(
            json.dumps({"action": "stop", "writtenAt": 1700000000}),
            encoding="utf-8",
        )

        assert _read_signal(signal_file) is True

    def test_read_signal_returns_false_when_missing(self, tmp_path: Path) -> None:
        """No signal file means no stop signal."""
        signal_file = tmp_path / "pipeline-signal.json"

        assert _read_signal(signal_file) is False

    def test_read_signal_returns_false_on_invalid_json(self, tmp_path: Path) -> None:
        """Malformed JSON in signal file returns False gracefully."""
        signal_file = tmp_path / "pipeline-signal.json"
        signal_file.write_text("not json at all", encoding="utf-8")

        assert _read_signal(signal_file) is False

    def test_read_signal_returns_false_on_different_action(self, tmp_path: Path) -> None:
        """A signal with an action other than 'stop' returns False."""
        signal_file = tmp_path / "pipeline-signal.json"
        signal_file.write_text(
            json.dumps({"action": "pause", "writtenAt": 1700000000}),
            encoding="utf-8",
        )

        assert _read_signal(signal_file) is False

    def test_write_state_creates_state_file(self, tmp_path: Path) -> None:
        """_write_state writes valid JSON state to disk."""
        state_file = tmp_path / "pipeline-state.json"
        state = {
            "status": "draining",
            "chunksTranscribed": 3,
            "chunksPending": 1,
            "lastUpdatedAt": 0,
            "errors": [],
        }

        _write_state(state_file, state)

        written = json.loads(state_file.read_text(encoding="utf-8"))
        assert written["status"] == "draining"
        assert written["chunksTranscribed"] == 3
        assert written["chunksPending"] == 1
        assert written["lastUpdatedAt"] > 0  # Updated by _write_state

    def test_write_state_overwrites_existing(self, tmp_path: Path) -> None:
        """_write_state replaces existing state file atomically."""
        state_file = tmp_path / "pipeline-state.json"
        state_file.write_text('{"status": "active"}', encoding="utf-8")

        state = {
            "status": "stopped",
            "chunksTranscribed": 5,
            "chunksPending": 0,
            "lastUpdatedAt": 0,
            "errors": [],
        }
        _write_state(state_file, state)

        written = json.loads(state_file.read_text(encoding="utf-8"))
        assert written["status"] == "stopped"
        assert written["chunksTranscribed"] == 5


# ---------------------------------------------------------------------------
# Error logging tests (Requirement 3.7 — log to transcription-errors.log)
# ---------------------------------------------------------------------------


class TestLogError:
    """Test _log_error writes structured error entries."""

    def test_creates_error_log_file(self, tmp_path: Path) -> None:
        """_log_error creates transcription-errors.log if it doesn't exist."""
        chunk = tmp_path / "audio" / "discord" / "user1" / "1719849600.wav"
        chunk.parent.mkdir(parents=True)
        chunk.write_bytes(b"\x00" * 100)

        _log_error(tmp_path, chunk, "RuntimeError: model crash")

        log_file = tmp_path / "transcription-errors.log"
        assert log_file.exists()
        content = log_file.read_text(encoding="utf-8")
        assert "1719849600.wav" in content
        assert "RuntimeError: model crash" in content

    def test_appends_multiple_errors(self, tmp_path: Path) -> None:
        """Multiple errors are appended to the same file."""
        chunk1 = tmp_path / "audio" / "discord" / "user1" / "chunk1.wav"
        chunk2 = tmp_path / "audio" / "discord" / "user1" / "chunk2.wav"
        chunk1.parent.mkdir(parents=True)
        chunk1.write_bytes(b"\x00" * 100)
        chunk2.write_bytes(b"\x00" * 100)

        _log_error(tmp_path, chunk1, "Error A")
        _log_error(tmp_path, chunk2, "Error B")

        log_file = tmp_path / "transcription-errors.log"
        content = log_file.read_text(encoding="utf-8")
        assert "chunk1.wav" in content
        assert "Error A" in content
        assert "chunk2.wav" in content
        assert "Error B" in content

    def test_returns_error_record(self, tmp_path: Path) -> None:
        """_log_error returns a structured dict with chunk path, error, and timestamp."""
        chunk = tmp_path / "audio" / "discord" / "user1" / "test.wav"
        chunk.parent.mkdir(parents=True)
        chunk.write_bytes(b"\x00" * 100)

        result = _log_error(tmp_path, chunk, "timeout exceeded")

        assert result["chunkPath"] == str(chunk)
        assert result["error"] == "timeout exceeded"
        assert "timestamp" in result
        assert isinstance(result["timestamp"], int)

    def test_log_entry_format_has_timestamp(self, tmp_path: Path) -> None:
        """Each log line includes a bracketed timestamp."""
        chunk = tmp_path / "some.wav"
        chunk.write_bytes(b"\x00" * 100)

        with patch("amber_whisper.live_pipeline._now_epoch_s", return_value=1700000000):
            _log_error(tmp_path, chunk, "test error")

        log_file = tmp_path / "transcription-errors.log"
        content = log_file.read_text(encoding="utf-8")
        assert "[1700000000]" in content
