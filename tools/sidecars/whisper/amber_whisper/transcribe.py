"""Session-directory transcription and merge."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

MANIFEST_NAME = "manifest.json"
AUDIO_DISCORD = Path("audio") / "discord"
TRANSCRIPTS_DIR = Path("transcripts")
RAW_MERGED = TRANSCRIPTS_DIR / "raw-merged.txt"
SEGMENTS_JSON = TRANSCRIPTS_DIR / "segments.json"
AUDIO_EXTENSIONS = (".wav", ".ogg", ".opus", ".mp3", ".flac", ".m4a", ".webm")


@dataclass(frozen=True)
class AudioSource:
    path: Path
    session_offset_s: float
    speaker: str
    source_id: str


def _format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _merge_segments(segments: list[dict[str, Any]]) -> str:
    ordered = sorted(segments, key=lambda s: (s["start"], s["end"]))
    lines: list[str] = []
    for seg in ordered:
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        speaker = str(seg.get("speaker", "unknown"))
        lines.append(f"[{_format_timestamp(float(seg['start']))}] {speaker}: {text}")
    return "\n".join(lines)


def _load_manifest(session_dir: Path) -> dict[str, Any] | None:
    manifest_path = session_dir / "audio" / MANIFEST_NAME
    if not manifest_path.is_file():
        return None
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _speaker_lookup(manifest: dict[str, Any] | None) -> dict[str, str]:
    if manifest is None:
        return {}
    names: dict[str, str] = {}
    for track in manifest.get("tracks", []):
        user_id = str(track.get("discordUserId", ""))
        if user_id:
            names[user_id] = str(track.get("displayName") or user_id)
    for chunk in manifest.get("chunks", []):
        user_id = str(chunk.get("discordUserId", ""))
        if user_id:
            names[user_id] = str(chunk.get("displayName") or user_id)
    return names


def _resolve_session_path(session_dir: Path, relative_path: str) -> Path:
    rel = Path(relative_path)
    if rel.parts and rel.parts[0] == "sessions":
        # Campaign-relative path from legacy manifests.
        try:
            rel = Path(*rel.parts[2:])
        except IndexError:
            pass
    return session_dir / rel


def _iter_audio_sources(session_dir: Path, manifest: dict[str, Any] | None) -> Iterator[AudioSource]:
    names = _speaker_lookup(manifest)
    audio_dir = session_dir / AUDIO_DISCORD

    if manifest and manifest.get("version") == 2:
        for chunk in manifest.get("chunks", []):
            rel = str(chunk.get("relativePath", ""))
            path = _resolve_session_path(session_dir, rel)
            if not path.is_file():
                continue
            user_id = str(chunk.get("discordUserId", path.parent.name))
            speaker = str(chunk.get("displayName") or names.get(user_id, user_id))
            offset_ms = int(chunk.get("sessionOffsetMs", 0))
            yield AudioSource(
                path=path,
                session_offset_s=offset_ms / 1000.0,
                speaker=speaker,
                source_id=f"{user_id}:{path.stem}",
            )
        return

    if manifest:
        for track in manifest.get("tracks", []):
            rel = str(track.get("relativePath", ""))
            path = _resolve_session_path(session_dir, rel)
            if not path.is_file():
                continue
            user_id = str(track.get("discordUserId", path.stem))
            speaker = str(track.get("displayName") or names.get(user_id, user_id))
            yield AudioSource(
                path=path,
                session_offset_s=0.0,
                speaker=speaker,
                source_id=user_id,
            )
        return

    if not audio_dir.is_dir():
        return

    for path in sorted(audio_dir.rglob("*")):
        if path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue
        user_id = path.parent.name if path.parent != audio_dir else path.stem
        speaker = names.get(user_id, user_id)
        yield AudioSource(
            path=path,
            session_offset_s=0.0,
            speaker=speaker,
            source_id=user_id,
        )


def _write_progress(progress_file: Path | None, current: int, total: int) -> None:
    if progress_file is None:
        return
    progress_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"current": current, "total": total, "phase": "transcribing"}
    progress_file.write_text(json.dumps(payload), encoding="utf-8")


def transcribe_session_dir(
    session_dir: Path,
    language: str = "it",
    model_name: str = "base",
    progress_file: Path | None = None,
) -> dict[str, Any]:
    session_dir = session_dir.resolve()
    manifest = _load_manifest(session_dir)
    sources = list(_iter_audio_sources(session_dir, manifest))
    if not sources:
        raise FileNotFoundError(f"No audio files found under {session_dir / AUDIO_DISCORD}")

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Run: pip install -e '.[whisper]' in tools/sidecars/whisper"
        ) from exc

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    all_segments: list[dict[str, Any]] = []
    total_sources = len(sources)
    _write_progress(progress_file, 0, total_sources)

    for index, source in enumerate(sources, start=1):
        segments, _info = model.transcribe(
            str(source.path),
            language=language,
            vad_filter=True,
        )
        for seg in segments:
            all_segments.append(
                {
                    "start": float(seg.start) + source.session_offset_s,
                    "end": float(seg.end) + source.session_offset_s,
                    "text": seg.text.strip(),
                    "speaker": source.speaker,
                    "sourceId": source.source_id,
                }
            )
        _write_progress(progress_file, index, total_sources)

    transcripts_dir = session_dir / TRANSCRIPTS_DIR
    transcripts_dir.mkdir(parents=True, exist_ok=True)

    merged = _merge_segments(all_segments)
    raw_path = session_dir / RAW_MERGED
    raw_path.write_text(merged, encoding="utf-8")

    segments_path = session_dir / SEGMENTS_JSON
    payload = {
        "model": f"whisper-{model_name}",
        "language": language,
        "segments": all_segments,
        "mergedTextPath": str(RAW_MERGED),
    }
    segments_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return {
        "model": payload["model"],
        "language": language,
        "segmentCount": len(all_segments),
        "mergedTextPath": str(RAW_MERGED),
        "segmentsPath": str(SEGMENTS_JSON),
    }
