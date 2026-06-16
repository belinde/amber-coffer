"""CLI for Whisper transcription (offline batch and live pipeline)."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from amber_whisper.transcribe import transcribe_session_dir


def main() -> int:
    parser = argparse.ArgumentParser(prog="amber-whisper")
    sub = parser.add_subparsers(dest="command", required=True)

    # --- transcribe (batch) ---
    transcribe = sub.add_parser("transcribe", help="Transcribe session audio directory (batch)")
    transcribe.add_argument("--session-dir", required=True, type=Path)
    transcribe.add_argument("--language", default="it")
    transcribe.add_argument("--model", default="base")
    transcribe.add_argument("--progress-file", type=Path, default=None)

    # --- live (streaming pipeline) ---
    live = sub.add_parser("live", help="Run live transcription pipeline (polls for new chunks)")
    live.add_argument("--session-dir", required=True, type=Path)
    live.add_argument("--language", default="it")
    live.add_argument("--model", default="small")
    live.add_argument("--state-file", type=Path, default=None)
    live.add_argument("--signal-file", type=Path, default=None)

    args = parser.parse_args()

    if args.command == "transcribe":
        result = transcribe_session_dir(
            session_dir=args.session_dir,
            language=args.language,
            model_name=args.model,
            progress_file=args.progress_file,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "live":
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        )
        from amber_whisper.live_pipeline import run_live_pipeline

        return run_live_pipeline(
            session_dir=args.session_dir,
            language=args.language,
            model_name=args.model,
            state_file=args.state_file,
            signal_file=args.signal_file,
        )

    return 1


if __name__ == "__main__":
    sys.exit(main())
