# Whisper STT Sidecar (placeholder)

Sidecar Python per la trascrizione offline delle sessioni (pipeline post-sessione).

## Stato

Implementazione MVP: trascrizione da manifest v2 (`chunks` con `sessionOffsetMs`) o legacy `*.wav`, merge in `transcripts/raw-merged.txt`. Formati input: WAV, OGG/Opus, MP3, FLAC, … (decodifica via ffmpeg in faster-whisper).

## Contratto futuro (bozza)

Il Master App invocherà questo eseguibile tramite `tauri-plugin-shell` con:

```bash
amber-whisper transcribe \
  --input /path/to/campaign/recordings/session-N/user.wav \
  --output /path/to/campaign/transcripts/session-N/user.json \
  --model base
```

### Output atteso (JSON)

```json
{
  "text": "...",
  "segments": [{ "start": 0.0, "end": 1.2, "text": "..." }],
  "model": "whisper-base",
  "language": "it"
}
```

## Sviluppo locale (obbligatorio per Trascrivi nel Coffer)

The Coffer invokes `.venv/bin/python` in this directory when present.

```bash
cd tools/sidecars/whisper
python3 -m venv .venv
.venv/bin/pip install -e ".[whisper]"
```

Verify: `.venv/bin/python -m amber_whisper transcribe --session-dir /path/to/session --language it`

Vedi [docs/blueprint.md](../../../docs/blueprint.md) per il contesto architetturale.
