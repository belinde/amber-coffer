# ADR 0004: Estensibilità sorgenti audio per la pipeline di sessione

**Stato**: Accettato (sorgente primaria MVP aggiornata da [ADR 0009](./0009-discord-bot-primary-audio.md))  
**Data**: 2026-05-17

## Contesto

Il POC `_readonly/campagna-poc/` registra **due tracce** audio durante la sessione (microfono GM + monitor PulseAudio dell'uscita di sistema, che cattura la videoconferenza), poi le passa a Whisper con diarizzazione `pyannote` per burst. Il legacy cloud usa invece WebRTC P2P con TURN e registrazione per partecipante.

Amber Coffer parte con un MVP molto più contenuto: la voce dei giocatori passa via **Discord Activity** e l'audio dei player **non viene catturato dal master-app** (decisione user, Q2 inventario Fase 1). Tuttavia il prodotto deve restare aperto a sorgenti audio aggiuntive in futuro (es. system monitor del GM, file upload post-sessione, capture da Discord se le API lo permetteranno, microfoni multipli locali).

## Decisione

1. **MVP (aggiornamento ADR 0009)**: sorgente primaria **`discord_capture`** via bot Discord locale; il **microfono del GM** (`gm_mic`) è previsto come seconda sorgente in fase successiva (Tauri / `cpal`).
2. **Modello dati estensibile**: ogni `Recording` ha `n` `AudioSource`, ognuno con `id`, `kind`, `label`, `startedAt`, `endedAt`, `path` (storage locale) e `metadata` libero.
   - `kind`: enum aperto `'gm_mic' | 'system_monitor' | 'upload' | 'discord_capture' | string` (string per estensione futura senza migration).
   - Una `Recording` con una sola sorgente è il caso MVP; più sorgenti sono il caso futuro dual-track / multi-mic.
3. **Sidecar Whisper**: il contratto verso il sidecar accetta una lista `AudioSource[]`, non un singolo file. La diarizzazione si applica solo dove richiesto (flag `diarize: bool` per sorgente). Output: `Transcript` con `segments[]`, ognuno con `sourceId` + `speaker?`.
4. **Niente WebRTC nel MVP**: il legacy cloud aveva WebRTC + TURN come fondamento; Amber Coffer lo esclude. La voce è responsabilità di Discord.

## Conseguenze

### Positive

- Schema `Recording` e `AudioSource` chiusi sotto Zod ma con `kind` estensibile.
- Sidecar Whisper progettato fin dall'inizio per N input; aggiungere sorgenti non richiede riscrittura.
- Esclusione di WebRTC riduce drasticamente lo scope (no TURN, no signaling, no SDP) e i costi cloud.

### Negative

- Multi-sorgente non testato finché non si aggiunge una seconda sorgente reale → rischio di assunzioni implicite single-source.
- Niente cattura voce player nel MVP: ogni feature che dipende dalla trascrizione completa della sessione (es. "evidenzia chi ha detto cosa per tutti i giocatori") è rimandata.

## Alternative considerate

- **Lift POC dual-track come baseline MVP**: scartato. Aumenta scope (PulseAudio Linux-only, sink virtuali, permessi sistema) e blocca cross-platform.
- **WebRTC in-app**: scartato. Sostituito da Discord Activity per la voce; Amber Coffer non è un competitor di Discord/Roll20.

## Riferimenti

- POC `tools/scripts/transcribe_session_dual.py` (`_readonly/campagna-poc/`) come riferimento implementativo futuro.
- `tools/sidecars/whisper/` come location target del nuovo sidecar.
