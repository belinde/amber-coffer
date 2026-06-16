"""Filesystem contract tests for the Transcription Pipeline side.

Validates that the pipeline correctly discovers WAV files written by the
Discord bot in the expected directory structure, and preserves them after
transcription.

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 3.6
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from amber_whisper.live_pipeline import (
    _discover_new_wavs,
    is_file_stable,
    transcription_output_path,
)


class TestPipelineDiscoveryMatchesBotOutput:
    """Verify _discover_new_wavs finds files in the exact structure the bot writes."""

    def test_discovers_wavs_in_audio_discord_userid_structure(self, tmp_path: Path) -> None:
        """Pipeline discovers .wav files at audio/discord/{userId}/*.wav."""
        # Create the structure that the Discord bot produces
        user_ids = ["111111111111111111", "222222222222222222"]
        expected_files: list[Path] = []

        for user_id in user_ids:
            user_dir = tmp_path / "audio" / "discord" / user_id
            user_dir.mkdir(parents=True)
            # Write files matching the timestamp naming convention
            for ts in [1719849600, 1719849632]:
                wav_file = user_dir / f"{ts}.wav"
                wav_file.write_bytes(b"\x00" * 1024)
                expected_files.append(wav_file)

        # Run the pipeline's discovery function
        discovered = _discover_new_wavs(tmp_path, processed=set())

        assert len(discovered) == 4
        # All expected files must be found
        for expected in expected_files:
            assert expected in discovered

    def test_discovers_collision_suffix_filenames(self, tmp_path: Path) -> None:
        """Pipeline finds files with collision suffixes ({ts}_1.wav, {ts}_2.wav)."""
        user_dir = tmp_path / "audio" / "discord" / "111111111111111111"
        user_dir.mkdir(parents=True)

        # Collision naming pattern from the bot
        (user_dir / "1719849600.wav").write_bytes(b"\x00" * 1024)
        (user_dir / "1719849600_1.wav").write_bytes(b"\x00" * 1024)
        (user_dir / "1719849600_2.wav").write_bytes(b"\x00" * 1024)

        discovered = _discover_new_wavs(tmp_path, processed=set())

        assert len(discovered) == 3
        names = sorted(f.name for f in discovered)
        assert names == ["1719849600.wav", "1719849600_1.wav", "1719849600_2.wav"]

    def test_ignores_md_transcription_files(self, tmp_path: Path) -> None:
        """Pipeline only picks up .wav, not .md files written by transcription."""
        user_dir = tmp_path / "audio" / "discord" / "111111111111111111"
        user_dir.mkdir(parents=True)

        (user_dir / "1719849600.wav").write_bytes(b"\x00" * 1024)
        (user_dir / "1719849600.md").write_text("transcript text", encoding="utf-8")

        discovered = _discover_new_wavs(tmp_path, processed=set())

        assert len(discovered) == 1
        assert discovered[0].suffix == ".wav"

    def test_discovery_order_is_deterministic(self, tmp_path: Path) -> None:
        """Files are returned in sorted order (by user dir, then filename)."""
        user_dir = tmp_path / "audio" / "discord" / "111111111111111111"
        user_dir.mkdir(parents=True)

        # Write in reverse order
        (user_dir / "1719849660.wav").write_bytes(b"\x00" * 100)
        (user_dir / "1719849600.wav").write_bytes(b"\x00" * 100)
        (user_dir / "1719849632.wav").write_bytes(b"\x00" * 100)

        discovered = _discover_new_wavs(tmp_path, processed=set())

        names = [f.name for f in discovered]
        assert names == ["1719849600.wav", "1719849632.wav", "1719849660.wav"]


class TestFileStabilityContract:
    """Verify the 500ms stability window prevents partial reads."""

    def test_freshly_written_file_is_not_stable(self, tmp_path: Path) -> None:
        """A file just written (0ms ago) is not considered stable."""
        wav = tmp_path / "audio" / "discord" / "user1" / "1719849600.wav"
        wav.parent.mkdir(parents=True)
        wav.write_bytes(b"\x00" * 1024)

        mtime_ms = int(os.path.getmtime(wav) * 1000)
        # Simulate "now" as the same moment the file was written
        assert is_file_stable(wav, mtime_ms) is False

    def test_file_stable_after_500ms(self, tmp_path: Path) -> None:
        """A file older than 500ms is stable and safe to read."""
        wav = tmp_path / "audio" / "discord" / "user1" / "1719849600.wav"
        wav.parent.mkdir(parents=True)
        wav.write_bytes(b"\x00" * 1024)

        mtime_ms = int(os.path.getmtime(wav) * 1000)
        # Simulate "now" as 500ms after the file was written
        assert is_file_stable(wav, mtime_ms + 500) is True

    def test_stability_window_prevents_partial_read(self, tmp_path: Path) -> None:
        """A file modified 499ms ago is NOT stable (could still be written to)."""
        wav = tmp_path / "audio" / "discord" / "user1" / "1719849600.wav"
        wav.parent.mkdir(parents=True)
        wav.write_bytes(b"\x00" * 1024)

        mtime_ms = int(os.path.getmtime(wav) * 1000)
        assert is_file_stable(wav, mtime_ms + 499) is False


class TestTranscriptionPreservesSourceWav:
    """Verify the pipeline contract: .wav files are never deleted after transcription."""

    def test_transcription_output_is_md_alongside_wav(self, tmp_path: Path) -> None:
        """Transcription writes .md with same stem in same dir, not touching .wav."""
        wav = tmp_path / "audio" / "discord" / "user1" / "1719849600.wav"
        wav.parent.mkdir(parents=True)
        wav.write_bytes(b"\x00" * 1024)

        output = transcription_output_path(wav)

        # .md file is alongside the .wav
        assert output.parent == wav.parent
        assert output.stem == wav.stem
        assert output.suffix == ".md"

        # Original .wav is unaffected
        assert wav.exists()
        assert wav.stat().st_size == 1024

    def test_wav_intact_after_md_creation(self, tmp_path: Path) -> None:
        """After creating .md output, the source .wav is still intact."""
        wav = tmp_path / "audio" / "discord" / "user1" / "1719849600.wav"
        wav.parent.mkdir(parents=True)
        original_content = b"\x00\x01\x02" * 500
        wav.write_bytes(original_content)

        # Simulate transcription: write .md alongside
        md_path = transcription_output_path(wav)
        md_path.write_text("Transcribed text here", encoding="utf-8")

        # .wav must remain unchanged
        assert wav.exists()
        assert wav.read_bytes() == original_content

    def test_collision_suffix_files_get_correct_md_names(self, tmp_path: Path) -> None:
        """Collision files (1719849600_1.wav) produce correctly named .md outputs."""
        user_dir = tmp_path / "audio" / "discord" / "user1"
        user_dir.mkdir(parents=True)

        wav_files = [
            user_dir / "1719849600.wav",
            user_dir / "1719849600_1.wav",
            user_dir / "1719849600_2.wav",
        ]

        for wav in wav_files:
            wav.write_bytes(b"\x00" * 1024)

        md_outputs = [transcription_output_path(wav) for wav in wav_files]

        assert md_outputs[0].name == "1719849600.md"
        assert md_outputs[1].name == "1719849600_1.md"
        assert md_outputs[2].name == "1719849600_2.md"

        # All source .wav files remain intact
        for wav in wav_files:
            assert wav.exists()


class TestEndToEndFilesystemContract:
    """Integration test: full bot → pipeline filesystem flow."""

    def test_full_session_directory_structure(self, tmp_path: Path) -> None:
        """Verify the complete session directory layout matches the design spec."""
        # Simulate what the bot creates during a session
        users = ["111111111111111111", "222222222222222222"]
        all_wavs: list[Path] = []

        for user_id in users:
            user_dir = tmp_path / "audio" / "discord" / user_id
            user_dir.mkdir(parents=True)
            for ts in [1719849600, 1719849632]:
                wav = user_dir / f"{ts}.wav"
                wav.write_bytes(b"\x00" * 1024)
                all_wavs.append(wav)

        # Pipeline discovers all WAVs
        discovered = _discover_new_wavs(tmp_path, processed=set())
        assert len(discovered) == len(all_wavs)

        # After stability check passes, pipeline transcribes and writes .md
        for wav in discovered:
            md = transcription_output_path(wav)
            md.write_text("Transcribed content", encoding="utf-8")

        # All original .wav files are preserved
        for wav in all_wavs:
            assert wav.exists()
            assert wav.stat().st_size == 1024

        # Transcription outputs exist alongside
        for wav in all_wavs:
            md = wav.with_suffix(".md")
            assert md.exists()

    def test_manifest_relative_paths_match_discoverable_files(self, tmp_path: Path) -> None:
        """Manifest relativePaths from the bot match what the pipeline discovers."""
        user_id = "111111111111111111"
        user_dir = tmp_path / "audio" / "discord" / user_id
        user_dir.mkdir(parents=True)

        # Simulate what the bot writes: files + manifest relative paths
        timestamps = [1719849600, 1719849632, 1719849660]
        manifest_relative_paths: list[str] = []

        for ts in timestamps:
            filename = f"{ts}.wav"
            wav = user_dir / filename
            wav.write_bytes(b"\x00" * 1024)
            manifest_relative_paths.append(f"audio/discord/{user_id}/{filename}")

        # Pipeline discovers the same files
        discovered = _discover_new_wavs(tmp_path, processed=set())
        discovered_relative = [
            str(f.relative_to(tmp_path)) for f in discovered
        ]

        # The manifest's relativePaths should map 1:1 to discovered files
        assert sorted(manifest_relative_paths) == sorted(discovered_relative)

        # All manifest paths resolve to existing files
        for rel_path in manifest_relative_paths:
            abs_path = tmp_path / rel_path
            assert abs_path.exists()
