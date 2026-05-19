# ADR 0012: Discord Application unificata Amber Coffer

**Stato**: Accettato  
**Data**: 2026-05-18

## Contesto

Amber Coffer usa Discord in due modi:

1. **Master App (GM)**: wizard di setup (OAuth utente, invito bot BYOB, picker canale vocale) e registrazione audio tramite il **bot personale del GM**.
2. **Tavolo di gioco** (`apps/player-activity`): Embedded App SDK per il tavolo tattico nello stesso ecosistema Discord.

Servono **due Application Discord concettuali**:

| Application                 | Ruolo                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| **Amber Coffer** (prodotto) | OAuth2 utente (`identify`, `guilds`); client ID per Activity                    |
| **Bot del GM** (BYOB)       | Token in keyring OS (`discord-bot-token`); join canale vocale per registrazione |

## Decisione

- **Una sola Application** nel [Developer Portal](https://discord.com/developers/applications) per il brand **Amber Coffer** (`AMBER_DISCORD_APPLICATION_ID` in `packages/shared`).
- **OAuth Master**: PKCE, client ID pubblico in repo, **nessun client secret**; redirect `http://127.0.0.1:<port>/oauth/callback` (listener locale in dev).
- **Activity**: stesso `client_id`; URL mappings verso deploy `apps/player-activity` (CloudFront). L’HTTP API passa dal **proxy Discord** (`/api`) — non da fetch assoluti verso `api.*` in iframe.
- **Bot registrazione**: resta il bot creato dal GM nel portale; il wizard genera l’URL di invito usando il `client_id` estratto dal token del GM, non l’Application Amber.
- **OAuth persistito**: sessione utente (access + refresh) in keyring (`discord-user-oauth`); refresh automatico; comandi `discord_oauth_status`, `discord_ensure_user_oauth`, `discord_oauth_logout`. Il wizard non cancella più la sessione al salvataggio del canale.
- **Collegamento PG ↔ Discord**: `campaign.discordGuildId` + `Character.playerDiscordId`; roster server via REST bot (`GET /guilds/{id}/members` e search); richiede **Server Members Intent** sul bot del GM.
- **Risoluzione audio**: `recordings.user_discord_id` → personaggio tramite `player_discord_id` (nessuna FK su `recordings`).

### Checklist Developer Portal

1. Creare Application «Amber Coffer».
2. Copiare Application ID → `packages/shared/src/discord/amber-application.ts`.
3. **OAuth2 → Redirects**:
   - `http://127.0.0.1:47832/oauth/callback` — master-app (`AMBER_DISCORD_OAUTH_REDIRECT_URI`)
   - `https://table.ambercoffer.belinde.click` — URL pubblica Activity (prod)
   - `https://{APPLICATION_ID}.discordsays.com` — origin iframe in prod (handshake OAuth)
4. **Activities → URL Mappings** (TARGET senza protocollo; ordine: `/api` prima di `/`):
   - `/` → `table.ambercoffer.belinde.click` (SPA)
   - `/api` → `api.ambercoffer.belinde.click` (handshake + sync HTTP)
   - Script: `infrastructure/scripts/print-discord-url-mappings.sh`
5. **Bot** (opzionale su Application Amber): per Activity/handshake; **non** per audio BYOB.

## Conseguenze

### Positive

- Un solo `client_id` per Activity e OAuth GM.
- BYOB preserva privacy e controllo server del GM.

### Negative

- Placeholder ID finché l’app portal non è creata.
- Due concetti da spiegare in UI (Application Amber vs bot del GM).

## Riferimenti

- [ADR 0009](./0009-discord-bot-primary-audio.md) — audio BYOB
- `packages/shared/src/discord/amber-application.ts`
- `apps/master-app/src-tauri/src/services/discord_setup.rs`
