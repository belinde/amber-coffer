"""Live transcription pipeline — polls for WAV chunks and transcribes incrementally."""

from __future__ import annotations

import json
import logging
import os
import time
import traceback
from collections import deque
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

AUDIO_DISCORD = Path("audio") / "discord"
DEFAULT_POLL_INTERVAL_S = 0.5
MIN_STABILITY_MS = 500


# ---------------------------------------------------------------------------
# Exported utility functions (testable, referenced by design Properties 4, 10–13)
# ---------------------------------------------------------------------------


def is_file_stable(path: Path, current_time_ms: int, min_age_ms: int = MIN_STABILITY_MS) -> bool:
    """Return True if *path* has not been modified for at least *min_age_ms* milliseconds.

    Uses the file's mtime compared to *current_time_ms* (epoch milliseconds).
    """
    try:
        mtime_ms = int(os.path.getmtime(path) * 1000)
    except OSError:
        return False
    return (current_time_ms - mtime_ms) >= min_age_ms


def transcription_output_path(wav_path: Path) -> Path:
    """Return the `.md` output path for a given `.wav` chunk path (same dir, same stem)."""
    return wav_path.with_suffix(".md")


def parse_pipeline_state(content: str) -> dict[str, Any]:
    """Parse a pipeline state JSON string, returning the dict or defaults on failure."""
    try:
        data = json.loads(content)
        if not isinstance(data, dict):
            return default_pipeline_state()
        # Validate minimal shape
        if data.get("status") not in ("starting", "ready", "active", "draining", "stopped"):
            return default_pipeline_state()
        return {
            "status": data["status"],
            "chunksTranscribed": int(data.get("chunksTranscribed", 0)),
            "chunksPending": int(data.get("chunksPending", 0)),
            "lastUpdatedAt": int(data.get("lastUpdatedAt", 0)),
            "errors": data.get("errors", []),
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return default_pipeline_state()


def derive_ui_state(status: str) -> bool:
    """Return True iff the pipeline status indicates active transcription work."""
    return status in ("active", "draining")


def default_pipeline_state() -> dict[str, Any]:
    """Return the default pipeline state used when the state file is missing or invalid."""
    return {
        "status": "stopped",
        "chunksTranscribed": 0,
        "chunksPending": 0,
        "lastUpdatedAt": 0,
        "errors": [],
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now_epoch_s() -> int:
    return int(time.time())


def _write_state(state_file: Path, state: dict[str, Any]) -> None:
    """Atomically write pipeline state to disk."""
    state["lastUpdatedAt"] = _now_epoch_s()
    tmp = state_file.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
        tmp.replace(state_file)
    except OSError:
        logger.warning("Failed to write state file %s", state_file)


def _read_signal(signal_file: Path) -> bool:
    """Return True if the signal file requests a stop."""
    if not signal_file.is_file():
        return False
    try:
        data = json.loads(signal_file.read_text(encoding="utf-8"))
        return data.get("action") == "stop"
    except (json.JSONDecodeError, OSError):
        return False


def _discover_new_wavs(session_dir: Path, processed: set[Path]) -> list[Path]:
    """Scan audio/discord/*/ for .wav files not yet processed. Returns in sorted discovery order."""
    audio_root = session_dir / AUDIO_DISCORD
    if not audio_root.is_dir():
        return []
    found: list[Path] = []
    for user_dir in sorted(audio_root.iterdir()):
        if not user_dir.is_dir():
            continue
        for wav in sorted(user_dir.iterdir()):
            if wav.suffix.lower() == ".wav" and wav not in processed:
                found.append(wav)
    return found


def _log_error(session_dir: Path, chunk_path: Path, error_msg: str) -> dict[str, Any]:
    """Append an error entry to transcription-errors.log and return an error record."""
    log_file = session_dir / "transcription-errors.log"
    ts = _now_epoch_s()
    line = f"[{ts}] {chunk_path}: {error_msg}\n"
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        logger.warning("Could not write to error log %s", log_file)
    return {"chunkPath": str(chunk_path), "error": error_msg, "timestamp": ts}


# ---------------------------------------------------------------------------
# Main pipeline loop
# ---------------------------------------------------------------------------


def run_live_pipeline(
    session_dir: Path,
    language: str = "it",
    model_name: str = "small",
    state_file: Path | None = None,
    signal_file: Path | None = None,
) -> int:
    """Run the live transcription pipeline. Returns 0 on clean exit, 1 on fatal error."""

    session_dir = session_dir.resolve()
    if state_file is None:
        state_file = session_dir / "pipeline-state.json"
    if signal_file is None:
        signal_file = session_dir / "pipeline-signal.json"

    state: dict[str, Any] = {
        "status": "starting",
        "chunksTranscribed": 0,
        "chunksPending": 0,
        "lastUpdatedAt": 0,
        "errors": [],
    }
    _write_state(state_file, state)

    # Load faster-whisper model
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        logger.error("faster-whisper not installed: %s", exc)
        state["status"] = "stopped"
        _write_state(state_file, state)
        return 1

    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
    except Exception as exc:
        logger.error("Failed to load model '%s': %s", model_name, exc)
        state["status"] = "stopped"
        _write_state(state_file, state)
        return 1

    state["status"] = "ready"
    _write_state(state_file, state)
    logger.info("Pipeline ready — model '%s' loaded, polling %s", model_name, session_dir)

    # FIFO processing queue and tracking
    processed: set[Path] = set()
    queue: deque[Path] = deque()
    draining = False

    while True:
        # Check for stop signal
        if not draining and _read_signal(signal_file):
            draining = True
            state["status"] = "draining"
            logger.info("Stop signal received — draining queue")
            # Final discovery pass before draining
            new_wavs = _discover_new_wavs(session_dir, processed)
            for wav in new_wavs:
                if wav not in processed and wav not in queue:
                    queue.append(wav)
            _write_state(state_file, state)

        # Discover new files (only when not draining — draining uses final snapshot)
        if not draining:
            new_wavs = _discover_new_wavs(session_dir, processed)
            for wav in new_wavs:
                if wav not in queue:
                    queue.append(wav)

        # Update pending count
        state["chunksPending"] = len(queue)

        # If draining and queue empty, we're done
        if draining and len(queue) == 0:
            state["status"] = "stopped"
            _write_state(state_file, state)
            logger.info("Drain complete — pipeline stopped")
            return 0

        # Process next stable chunk from the queue
        if queue:
            next_chunk = queue[0]
            current_ms = int(time.time() * 1000)
            if is_file_stable(next_chunk, current_ms):
                queue.popleft()
                # Mark as active
                if state["status"] == "ready":
                    state["status"] = "active"

                # Transcribe
                try:
                    segments, _info = model.transcribe(
                        str(next_chunk),
                        language=language,
                        vad_filter=True,
                    )
                    text_lines: list[str] = []
                    for seg in segments:
                        text = seg.text.strip()
                        if text:
                            text_lines.append(text)

                    output_path = transcription_output_path(next_chunk)
                    output_path.write_text("\n".join(text_lines), encoding="utf-8")

                    state["chunksTranscribed"] += 1
                    processed.add(next_chunk)
                    logger.info("Transcribed %s (%d segments)", next_chunk.name, len(text_lines))

                except Exception as exc:
                    error_msg = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
                    err_record = _log_error(session_dir, next_chunk, error_msg)
                    state["errors"].append(err_record)
                    processed.add(next_chunk)
                    logger.warning("Transcription failed for %s: %s", next_chunk.name, exc)

                state["chunksPending"] = len(queue)
                _write_state(state_file, state)
            # else: file not stable yet, leave in queue and wait

        # If not draining and no work, sleep before next poll
        if not draining:
            time.sleep(DEFAULT_POLL_INTERVAL_S)
        elif queue:
            # During drain, still need to wait for stability
            time.sleep(DEFAULT_POLL_INTERVAL_S)
