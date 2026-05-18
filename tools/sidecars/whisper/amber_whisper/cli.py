"""CLI for offline Whisper transcription."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from amber_whisper.transcribe import transcribe_session_dir


def main() -> int:
    parser = argparse.ArgumentParser(prog="amber-whisper")
    sub = parser.add_subparsers(dest="command", required=True)

    transcribe = sub.add_parser("transcribe", help="Transcribe session audio directory")
    transcribe.add_argument("--session-dir", required=True, type=Path)
    transcribe.add_argument("--language", default="it")
    transcribe.add_argument("--model", default="base")
    transcribe.add_argument("--progress-file", type=Path, default=None)

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

    return 1


if __name__ == "__main__":
    sys.exit(main())
