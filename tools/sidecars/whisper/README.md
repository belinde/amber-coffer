# Whisper STT Sidecar

Sidecar per la trascrizione offline delle sessioni (pipeline post-sessione).

## Stato

Implementazione MVP: trascrizione da manifest v2 (`chunks` con `sessionOffsetMs`) o legacy `*.wav`, merge in `transcripts/raw-merged.txt`. Formati input: WAV, OGG/Opus, MP3, FLAC, … (decodifica via ffmpeg in faster-whisper).

## Produzione (app distribuita)

Nella build per utenti finali:

- Il master-app invoca un **eseguibile** sidecar impacchettato (non il venv del monorepo).
- I **pesi** Whisper (CTranslate2) risiedono in `$APPDATA/amber-coffer/models/whisper/<modelId>/`, scaricati dal GM in **Impostazioni → Modelli locali**.
- Il sidecar riceve `--model-dir` (o env `AMBER_WHISPER_MODEL_DIR`) e `--language` dalla preferenza utente.

Vedi [ADR 0010](../../../docs/adr/0010-local-model-artifacts-and-updates.md) e [functional-specs](../../../docs/functional-specs.md).

## Sviluppo locale

Solo per sviluppatori che eseguono il Coffer dal monorepo. Il Coffer usa `.venv/bin/python` in questa directory quando presente.

```bash
cd tools/sidecars/whisper
python3 -m venv .venv
.venv/bin/pip install -e ".[whisper]"
```

Verify:

```bash
.venv/bin/python -m amber_whisper transcribe --session-dir /path/to/session --language it
```

Gli utenti finali **non** devono eseguire questi comandi.

## Contratto CLI (bozza)

```bash
amber-whisper transcribe \
  --session-dir /path/to/campaign/sessions/N \
  --model-dir /path/to/models/whisper/<modelId> \
  --language it \
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

## Riferimenti

- [docs/blueprint.md](../../../docs/blueprint.md)
- [ADR 0004](../../../docs/adr/0004-audio-source-extensibility.md), [ADR 0009](../../../docs/adr/0009-discord-bot-primary-audio.md), [ADR 0010](../../../docs/adr/0010-local-model-artifacts-and-updates.md)
