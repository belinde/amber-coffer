# ADR 0009: Bot Discord come sorgente audio primaria

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

[ADR 0004](./0004-audio-source-extensibility.md) definiva l'MVP con **solo microfono GM** locale. Le [specifiche funzionali](../functional-specs.md) e il [blueprint](../blueprint.md) descrivono invece un **bot Discord** che registra la videoconferenza con tracce per partecipante, storage locale e pipeline STT post-sessione.

La decisione di prodotto (2026-05-17) allinea l'implementazione al bot Discord come **sorgente primaria**; `gm_mic` e `system_monitor` restano estensioni future sullo stesso modello multi-sorgente.

## Decisione

1. **`discord_capture` è la sorgente audio primaria** per le sessioni live: processo `apps/discord-bot` (Node + discord.js + @discordjs/voice) orchestrato dal master-app.
2. **Layout file** sotto `$APPDATA/amber-coffer/worlds/<storageUuid>/sessions/<sessionNumber>/` (vedi [ADR 0002](./0002-local-first-storage.md)):
   - `audio/discord/<discordUserId>/track.ogg` — traccia consolidata per partecipante (dopo ingest)
   - `audio/discord/<discordUserId>/<NNNN>.ogg` — chunk grezzi opzionali (handoff bot, poi `superseded` in DB)
   - `audio/manifest.json` — handoff bot + snapshot esportato da SQLite per Whisper
   - **SQLite campagna** (fonte di verità post-ingest): `recording_segments`, `recordings`, `session_discord_assignments`
   - Legacy v1: singolo `<discordUserId>.wav` per partecipante (ancora leggibile da Whisper)
   - `transcripts/raw-merged.txt` — trascrizione grezza merged (in attesa di refinement)
   - `transcripts/segments.json` — segmenti strutturati Whisper
3. **Token bot** (BYOB del GM) in **keyring OS** (`amber-coffer` / `discord-bot-token`), con migrazione one-shot da `amber-settings.json` se presente. Globale per dispositivo, mai in repository. **Non** è il token dell’Application Amber Coffer del prodotto ([ADR 0012](./0012-amber-discord-application.md)).
4. **Canale vocale** da `campaign.discordChannelId` in `campaign.json`; configurazione guidata in Impostazioni → Discord (OAuth utente Amber + invito bot GM + picker canali vocali), con fallback ID manuale; join one-click dal master-app.
5. **STT offline** via sidecar `tools/sidecars/whisper/`; speaker identity da traccia Discord (no pyannote nel MVP). Pesi Whisper scaricati dal GM in Impostazioni → Modelli locali ([ADR 0010](./0010-local-model-artifacts-and-updates.md)); in sviluppo resta il venv monorepo.
6. **Mic GM locale** (`gm_mic`): fuori scope di questo ADR; stesso contratto `AudioSource` quando verrà aggiunto.

## Conseguenze

### Positive

- Cattura tutte le voci in VC senza PulseAudio / sink virtuali (cross-platform sul lato GM).
- Allineamento con workflow POC (`trascrizione-grezza` merged) e blueprint multi-track.
- Path relativi in DB; file grezzi ispezionabili dal GM.

### Negative

- Dipendenza da processo Node esterno + permessi bot Discord.
- Bot deve restare in esecuzione per tutta la sessione; chiusura master-app termina la registrazione (MVP).
- Qualità audio limitata dal codec Opus di Discord.

## Relazione con ADR 0004

ADR 0004 resta valido per:

- Modello `AudioSource` estensibile e sidecar Whisper multi-input.
- Assenza di WebRTC in-app.

La sezione «MVP solo mic GM» di ADR 0004 è **sostituita** da questo ADR per quanto riguarda la sorgente primaria attiva.

## Riferimenti

- [0004-audio-source-extensibility.md](./0004-audio-source-extensibility.md)
- [0010-local-model-artifacts-and-updates.md](./0010-local-model-artifacts-and-updates.md)
- [0012-amber-discord-application.md](./0012-amber-discord-application.md) — OAuth wizard e Activity (client ID prodotto)
- [poc-workflows.md](../migration/poc-workflows.md) §2
- `apps/discord-bot/`, `apps/master-app/src-tauri/src/services/discord_setup.rs`, `tools/sidecars/whisper/`
