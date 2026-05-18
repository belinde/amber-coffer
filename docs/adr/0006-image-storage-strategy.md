# ADR 0006: Strategia di storage delle immagini (locale + S3 selettivo)

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

Il POC gestisce localmente JPEG di ritratti (`immagini/personaggi/`, `immagini/png/`), viste di luoghi (`immagini/luoghi/`) e scene di sessione (`immagini/eventi/`). Il legacy cloud aveva tutto su S3 dietro auth Cognito.

Amber Coffer è **local-first** per il GM ma deve comunque:

1. Fornire le immagini ai **player** durante la sessione (Player Activity = Discord Activity, non ha accesso al filesystem del GM).
2. Pubblicare un **canon pubblico** (resoconti player-safe + asset normalizzati) tramite S3+CloudFront.

L'utente ha confermato (Q4 inventario): **locale primario; su S3 si caricano solo thumbnail dei token e immagini normalizzate per il sito pubblico**.

## Decisione

### Tre livelli di storage

| Livello                     | Locazione                                                                        | Contenuto                                                                      | Quando                                                                    |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **L1 — locale full-res**    | Cartella campagna (`$APPDATA/…/worlds/<storageUuid>/images/<entityId>/...`)      | Originali JPEG/PNG, full resolution                                            | Sempre (sorgente canonica)                                                |
| **L2 — S3 thumbnail token** | `s3://<bucket>/tokens/<campaignId>/<tokenId>.webp`                               | Thumbnail 256×256 WebP per i token del tabletop visibili in Player Activity    | Quando un token viene piazzato/sincronizzato sul tabletop                 |
| **L3 — S3 canon pubblico**  | `s3://<bucket>/public/<campaignId>/{characters,npcs,locations,events}/<id>.webp` | Versione normalizzata (max 1600px, sRGB, WebP) per il sito pubblico CloudFront | Quando il GM marca un'entità come `visibility: 'public_canon'` e pubblica |

### Pipeline di normalizzazione

Lato master-app (Rust, in `apps/master-app/src-tauri/src/services/images.rs`, da scrivere in fase successiva):

1. Import: copia il file in L1, calcola hash SHA-256, genera thumbnail 256×256 L2 (lazy).
2. Upload selettivo: il GM dichiara cosa è "token attivo" → upload thumbnail L2. Il GM dichiara cosa va in pubblico → upload L3.
3. **Riferimento opaco** nei record entità: campo `imageRef: ImageRef` con `{ local: 'path/relativo', thumbnailUrl?: string, canonUrl?: string, hash: string }`. Mai URL assoluto locale.
4. **Niente sync automatico full-res**: il full-res resta locale (privacy + costi).

### Player Activity

La Player Activity legge esclusivamente da `thumbnailUrl` (token) e `canonUrl` (canon pubblico), entrambi CloudFront. Mai accesso ad asset locali del GM.

### Bucket S3

Un solo bucket per campagna con prefissi `tokens/<campaignId>/` (privato, signed URL o CloudFront access policy) e `public/<campaignId>/` (CloudFront pubblico). Definito in `infrastructure/lib/stacks/public-canon.ts` (già stub).

## Conseguenze

### Positive

- Privacy: il full-res e i materiali GM-only non lasciano mai la macchina del GM.
- Costi cloud minimi: solo thumbnail (~30 KB) e versione web del canon pubblico.
- Rollback semplice: cancellare l'oggetto S3 non distrugge la sorgente.
- Coerente con la decisione local-first del blueprint.

### Negative

- Logica di upload non triviale (decidere cosa sale e quando) → richiede UI esplicita di "publish thumbnail / publish to canon" lato master-app.
- Due URL diversi per entità (thumbnail vs canon): la Player Activity deve sapere quale usare per quale vista.
- Niente backup full-res automatico: l'utente è responsabile del backup del proprio app data dir. Mitigazione: documentare il path e fornire un comando "Export campaign" futuro.

## Alternative considerate

- **Sync totale su S3**: scartato. Costo, privacy, complessità.
- **Solo locale**: scartato. Player Activity non avrebbe accesso, public canon impossibile.
- **CDN locale (master-app espone HTTP)**: scartato. Discord Activity non può accedere a host locali del GM; richiederebbe tunnel/reverse proxy out of scope.

## Riferimenti

- `tools/scripts/normalize_image_assets.py` del POC come riferimento per la normalizzazione (orientamento EXIF, resize).
- Stack pubblico canon stub: `infrastructure/lib/stacks/public-canon.ts`.
- Inventario migrazione: [docs/migration/inventory.md](../migration/inventory.md) § 1.1, riga `immagini/**`.
