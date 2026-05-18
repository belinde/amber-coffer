# Glossario di dominio — EN ↔ IT

Riferimento per codice (inglese), documentazione di progetto (italiano) e stringhe UI i18n.

| EN (codice / tipi)     | IT (UI / documentazione)       | Note                                                                                                                                                  |
| ---------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign               | Campagna                       | Unità isolata: cartella `worlds/{storageUuid}/` con `campaign.json` + `database.db` + asset                                                           |
| Character              | Personaggio Giocante (PG)      | Controllato da un player                                                                                                                              |
| NPC                    | Personaggio Non Giocante (PNG) | Controllato dal Master                                                                                                                                |
| Location               | Luogo                          | Gerarchico (`parent_id`)                                                                                                                              |
| Faction                | Fazione                        | Gruppo organizzato                                                                                                                                    |
| Item                   | Oggetto                        | Equip, chiavi, artefatti                                                                                                                              |
| Relationship           | Relazione                      | Arco tipizzato tra entità                                                                                                                             |
| Canon                  | Canone                         | Stato narrativo validato dal GM                                                                                                                       |
| Canon Diff             | Diff del Canone                | Proposta AI in attesa di approvazione                                                                                                                 |
| Session                | Sessione                       | Episodio di gioco numerato                                                                                                                            |
| Recording              | Registrazione                  | Traccia audio per utente Discord                                                                                                                      |
| Transcript             | Trascrizione                   | Testo grezzo o rifinito                                                                                                                               |
| Map                    | Mappa                          | Tavolo tattico                                                                                                                                        |
| Token                  | Token                          | Segnaposto su mappa (PG/PNG)                                                                                                                          |
| Fog of War             | Nebbia di guerra               | Regione poligonale su mappa                                                                                                                           |
| Amber Coffer           | Amber Coffer                   | Prodotto (nome unico, tutte le superfici)                                                                                                             |
| Master Screen          | Schermo del master             | App desktop GM (`apps/master-app`)                                                                                                                    |
| Game table             | Tavolo di gioco                | Discord Activity (`apps/player-activity`)                                                                                                             |
| Campaign catalog       | Catalogo campagna              | Griglia sezioni campagna — vista di fallback al primo avvio se esiste già una campagna su disco                                                       |
| Master                 | Master / GM                    | Game Master                                                                                                                                           |
| Player                 | Giocatore                      | Partecipante alla campagna                                                                                                                            |
| World Vault            | Archivio del mondo             | Sezioni relazionali del mondo (PG, PNG, Luoghi, …) nello Schermo del master                                                                           |
| Sync Envelope          | Busta di sincronizzazione      | Wrapper MQTT tipizzato                                                                                                                                |
| Lore Note              | Nota di ambientazione          | Concetto strutturale (religione, economia, storia, geografia, ecc.) — entità di prima classe ([ADR 0005](./adr/0005-system-agnostic-domain-model.md)) |
| Narrative Seed         | Spunto narrativo               | Idea / evento potenziale non ancora canonico ([ADR 0005](./adr/0005-system-agnostic-domain-model.md))                                                 |
| Game Stats             | Statistiche di gioco           | Record key/value system-agnostic su `Character` / `Npc`                                                                                               |
| Game System Hint       | Suggerimento sistema           | Hint non vincolante (`dnd5e`, `pf2e`, `custom`, ...) per UI                                                                                           |
| Audio Source           | Sorgente audio                 | Canale di registrazione (mic GM, monitor, upload, ...) ([ADR 0004](./adr/0004-audio-source-extensibility.md))                                         |
| Image Ref              | Riferimento immagine           | Wrapper opaco: path locale + URL thumbnail/canon S3 ([ADR 0006](./adr/0006-image-storage-strategy.md))                                                |
| Public Canon           | Canon pubblico                 | Sottoinsieme delle entità marcate per pubblicazione su CloudFront                                                                                     |
| Visual Reference       | Riferimento visivo             | Prompt testuale per generazione immagine (campo libero, spesso EN)                                                                                    |
| Appearance             | Aspetto                        | Tratti visivi **permanenti** di un personaggio/luogo (stati di scena nei resoconti)                                                                   |
| Local model            | Modello locale                 | Artifact ML eseguito on-device (MVP: pesi Whisper STT) — [ADR 0010](./adr/0010-local-model-artifacts-and-updates.md)                                  |
| Model catalog          | Catalogo modelli               | Manifest remoto (`models/catalog.json`) con URL, tier, lingue e checksum degli artifact scaricabili                                                   |
| Model Manager          | Gestione modelli               | UI e servizi per scaricare/aggiornare/rimuovere modelli locali (tab Impostazioni → Modelli locali)                                                    |
| App update             | Aggiornamento applicazione     | Nuova versione del binario Amber Coffer via `tauri-plugin-updater` — distinto dagli artifact ML                                                       |
| Model artifact         | Artifact modello               | File o directory di pesi (es. CTranslate2 per faster-whisper) in `$APPDATA/amber-coffer/models/`                                                      |
| Transcription language | Lingua trascrizione            | Lingua passata al sidecar STT; default lingua UI, override in Modelli locali                                                                          |
| Settings               | Impostazioni                   | Pagina globale master-app (sidebar footer): tab Generale, Discord, Modelli locali                                                                     |

## Convenzioni nel codice

- Tipi TypeScript e tabelle SQL: **sempre inglese** (`Character`, `npcs`, `locations`)
- Chiavi i18n: `domain.scope.key` (es. `world.character.status.active`)
- Lingue UI supportate: `it`, `en`, `fr`, `es`
