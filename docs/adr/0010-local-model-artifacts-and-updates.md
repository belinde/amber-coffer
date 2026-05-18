# ADR 0010: Artifact modelli locali, Model Manager e aggiornamenti

**Stato**: Accettato  
**Data**: 2026-05-18

## Contesto

La pipeline STT post-sessione usa un sidecar Whisper (`tools/sidecars/whisper/`, [ADR 0004](./0004-audio-source-extensibility.md), [ADR 0009](./0009-discord-bot-primary-audio.md)). Oggi in sviluppo il master-app invoca Python da un venv nel monorepo; modello e lingua sono hardcoded (`base`, `it`). Gli utenti finali di un'app distribuita non possono — e non devono — eseguire `pip install` o clonare il repository.

Esiste già una pagina **Impostazioni** nello Schermo del master (`apps/master-app/src/features/settings/`: shell `vault | settings`, tab `general` e `discord` in [`settings-tabs.config.ts`](../../apps/master-app/src/features/settings/settings-tabs.config.ts)). Manca la gestione dei pesi ML e la distinzione documentata tra aggiornamento **applicazione** e aggiornamento **modelli**.

Le [specifiche funzionali](../functional-specs.md) richiedono trascrizione offline con modelli Whisper locali; questo ADR definisce come l'utente li ottiene e aggiorna in autonomia.

**Ambito MVP documentato**: solo artifact **STT Whisper** (CTranslate2 / faster-whisper). LLM per refinement narrativo, diarizzazione (pyannote) e altri sidecar potranno riusare lo stesso framework in fasi successive.

## Decisione

### 1. Due canali di aggiornamento separati

| Canale                                   | Cosa aggiorna                                                                | Meccanismo                                                        | Non usare per                      |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| **App updater** (`tauri-plugin-updater`) | Installer, bundle Tauri, **eseguibile** sidecar `amber-whisper` (non i pesi) | Endpoint firmato (es. `latest.json` su GitHub Releases o S3)      | Download pesi ML (centinaia MB–GB) |
| **Model Manager**                        | Pesi CTranslate2 / faster-whisper per lingua e tier                          | Manifest catalogo dedicato + download HTTP(S) + verifica `sha256` | Aggiornare il binario dell'app     |

La stessa pipeline di release può pubblicare **due manifest** distinti: `app-update.json` (updater) e `models/catalog.json` (Model Manager). L'updater può portare una versione app che richiede un `minCatalogVersion` più recente; non scarica i file del catalogo.

### 2. UI: tab «Modelli locali» in Impostazioni esistente

- **Non** introdurre una seconda pagina Impostazioni: estendere `SETTINGS_TABS` con `{ id: 'localModels', … }` e un pannello dedicato (es. `LocalModelsSettingsPanel.tsx`).
- Navigazione: sidebar footer → Impostazioni → tab **Modelli locali** (`settings.tabs.localModels`).
- **Deep link**: `openSettings('localModels')` — stesso pattern di `openSettings('discord')` da vault/sessione. Se l'utente avvia «Trascrivi» senza modello installato, l'app guida verso questo tab (o propone download inline con consenso spazio disco); **mai** un messaggio che richiede `pip install` o venv.
- **Aggiornamenti app** (Tauri updater): sotto-sezione nel tab `general` (MVP documentazione); eventuale tab `updates` separato post-MVP.

**Scope dati**: l'accesso a Impostazioni richiede oggi una campagna selezionata, ma preferenze STT e artifact modelli sono **app-globali** (non per-campagna). Persistenza in app data (es. `tauri-plugin-store` o file sotto `$APPDATA/amber-coffer/`), indipendente dalla campagna attiva mostrata nel tab Generale.

### 3. Storage locale

Root: `$APPDATA/amber-coffer/models/` (allineato al principio local-first di [ADR 0006](./0006-image-storage-strategy.md)).

```text
models/
  whisper/
    <modelId>/                 # es. whisper-base-it, whisper-small-multilingual
      …                        # layout CTranslate2 standard faster-whisper
      metadata.json            # catalogVersion, sha256, downloadedAt, tier, languages
```

Il sidecar in produzione riceve `--model-dir` (o env `AMBER_WHISPER_MODEL_DIR`) puntando alla directory dell'artifact installato. **Vietato** in build distribuita dipendere da `tools/sidecars/whisper/.venv` (resta solo per sviluppo; vedi [`tools/sidecars/whisper/README.md`](../../tools/sidecars/whisper/README.md)).

### 4. Catalogo modelli (manifest)

Schema concettuale (implementazione Zod in `packages/shared` in fase codice):

- `catalogVersion`, `publishedAt`
- `artifacts[]`: `{ id, kind: "whisper-ct2", tier, languages[], sizeBytes, url, sha256, minAppVersion? }`

Hosting MVP: CDN progetto (S3 + CloudFront, prefisso dedicato es. `models/`), distinto dal bucket canon pubblico ([`infrastructure/`](../../infrastructure/)). Download solo HTTPS; verifica integrità obbligatoria.

### 5. Lingua UI vs lingua trascrizione vs tier

| Concetto                | Fonte                                                                        | Uso                                       |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| **UI locale**           | i18next (`it`, `en`, `fr`, `es`)                                             | Etichette app                             |
| **Lingua trascrizione** | Tab Modelli locali (default: lingua UI, override esplicito)                  | Argomento `--language` al sidecar Whisper |
| **Tier modello**        | Scelta utente (`tiny` / `base` / `small` / …) + suggerimento RAM/disco in UI | Qualità vs velocità                       |

### 6. Integrazione `tauri-plugin-updater` (futura implementazione)

| Aspetto           | Raccomandazione                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Plugin            | `tauri-plugin-updater` nel master-app; `endpoints`, chiavi firma, canale stable/beta                          |
| CI/CD             | Release compatibili updater v2                                                                                |
| Sicurezza app     | Firma release Tauri                                                                                           |
| Sicurezza modelli | `sha256` per artifact; opzionale firma del manifest catalogo                                                  |
| Offline           | Modelli già scaricati restano usabili; catalogo in cache con TTL                                              |
| UI                | «Aggiorna applicazione» nel tab Generale, distinto da «Scarica / Aggiorna modello STT» nel tab Modelli locali |

## Fasi

| Fase               | Stato       | Contenuto                                                                        |
| ------------------ | ----------- | -------------------------------------------------------------------------------- |
| **0 — oggi**       | Attuale     | Dev: venv monorepo + path compile-time; utente finale: non supportato            |
| **1b — UI**        | Parziale    | Shell Impostazioni + tab `general` / `discord`                                   |
| **1 — release GM** | Obiettivo   | Sidecar impacchettato + tab `localModels` + catalogo Whisper + download autonomo |
| **2 — post-MVP**   | Pianificato | Estendere `kind` nel catalogo (LLM locale, adapter); stesso tab Impostazioni     |

## Conseguenze

### Positive

- Utente finale autonomo su lingua e qualità STT senza competenze da sviluppatore.
- Installer leggero (pesi non nel bundle).
- Estensione tab Impostazioni coerente con Discord già migrato lì.

### Negative

- Due sistemi di update da mantenere (app + catalogo modelli).
- Primo utilizzo STT richiede download esplicito (spazio disco, tempo).
- Catalogo e mirror da operare in infrastruttura.

## Alternative considerate

| Alternativa                                      | Esito                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Bundlare tutti i pesi Whisper nell'installer     | Scartato: dimensioni ingestibili e aggiornamenti lenti          |
| Solo download manuale da Hugging Face            | Scartato: incompatibile con utente non tecnico                  |
| Usare `tauri-plugin-updater` anche per i pesi ML | Scartato: updater pensato per binari app, non artifact multi‑GB |
| Nuova pagina «Modelli» fuori da Impostazioni     | Scartato: duplica navigazione; si estende `SettingsView`        |

## Riferimenti

- [0004-audio-source-extensibility.md](./0004-audio-source-extensibility.md)
- [0009-discord-bot-primary-audio.md](./0009-discord-bot-primary-audio.md)
- [0006-image-storage-strategy.md](./0006-image-storage-strategy.md)
- [functional-specs.md](../functional-specs.md) § Impostazioni
- `apps/master-app/src/features/settings/`
- `tools/sidecars/whisper/`
