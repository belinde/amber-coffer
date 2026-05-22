# Amber Coffer — AWS CDK

Infrastructure for web hosting, HTTP session sync, public canon, and Bedrock (see [ADR 0013](../docs/adr/0013-aws-web-hosting-and-dns.md), [ADR 0014](../docs/adr/0014-session-http-polling-sync.md)).

## Prerequisites

- Node.js via nvm (repo root `.nvmrc`)
- AWS CLI con profilo **`ambercoffer`** (obbligatorio per questo progetto — mai `default` / `belinde`)
- CDK bootstrap in **two regions** (same account):

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && . "$NVM_DIR/nvm.sh"
nvm use

export AWS_PROFILE=ambercoffer
export CDK_DEFAULT_REGION=eu-west-1
AWS_PROFILE=ambercoffer aws sts get-caller-identity   # verifica account

cd infrastructure
pnpm build

ACCOUNT_ID="$(AWS_PROFILE=ambercoffer aws sts get-caller-identity --query Account --output text)"

# Workload stacks (eu-west-1)
pnpm cdk bootstrap "aws://${ACCOUNT_ID}/eu-west-1" -c env=prod

# CloudFront certificates (us-east-1)
pnpm cdk bootstrap "aws://${ACCOUNT_ID}/us-east-1" -c env=prod
```

## Synth and deploy

```bash
export AWS_PROFILE=ambercoffer
export CDK_DEFAULT_REGION=eu-west-1
pnpm build
pnpm cdk synth -c env=prod
pnpm cdk deploy --all -c env=prod
```

Development environment (future): same commands with `-c env=dev`.

### Stack order

1. `AmberCoffer-Cert-{env}` (us-east-1) — ACM for CloudFront
2. `AmberCoffer-Web-{env}` — S3, CloudFront, Route53 (vetrina + player-activity)
3. `AmberCoffer-Handshake-{env}` — DynamoDB handshake + session sync state + JWT secret
4. `AmberCoffer-Api-{env}` — HTTP API (handshake, sync poll, master token)
5. Canon, Bedrock stacks

After deploy, create ACM DNS validation records if not auto-created (see Route53 console).

### Remove legacy IoT stack

If `AmberCoffer-Iot-prod` still exists from an older deploy:

```bash
pnpm cdk destroy "AmberCoffer-Iot-prod" -c env=prod
```

Deploy the updated `Handshake` and `Api` stacks first so the new `session-auth-secret` is in place.

## Deploy player-activity

```bash
./scripts/deploy-player-activity.sh prod
```

Builds `apps/player-activity`, syncs `dist/` to the environment bucket, invalidates the table CloudFront distribution.

## SSM parameters

| Path                                                  | Description                                       |
| ----------------------------------------------------- | ------------------------------------------------- |
| `/amber-coffer/{env}/cert/cloudfront-certificate-arn` | ACM ARN (us-east-1)                               |
| `/amber-coffer/{env}/web/vitrine-bucket-name`         | Vetrine S3 bucket                                 |
| `/amber-coffer/{env}/web/player-activity-bucket-name` | Player Activity S3 bucket                         |
| `/amber-coffer/{env}/web/table-distribution-id`       | CloudFront distribution for `table*`              |
| `/amber-coffer/{env}/api/http-api-url`                | Base URL `https://api*.ambercoffer.belinde.click` |
| `/amber-coffer/{env}/api/handshake-url`               | `POST` handshake endpoint                         |
| `/amber-coffer/{env}/api/sync-state-url`              | `GET` tactical sync state                         |
| `/amber-coffer/{env}/handshake/table-name`            | DynamoDB channel mapping table                    |
| `/amber-coffer/{env}/session-sync/table-name`         | DynamoDB tactical sync state                      |

## Session sync (Player Activity + Master)

1. Deploy stacks (`Handshake`, `Api` at minimum).
2. Set Discord client secret in Secrets Manager (`amber-coffer-{env}-discord-client-secret`) — replace placeholder `REPLACE_ME`.
3. Configure **Discord Developer Portal** URL Mappings and OAuth redirects (see below).
4. Link the campaign **voice channel** in the master app (Campaign → Discord). When a session goes **live**, the master app updates the DynamoDB handshake row automatically (`PUT /session/handshake/channel`). For a one-off bootstrap or without a live session, you can still seed manually:

```bash
chmod +x infrastructure/scripts/seed-handshake-channel.sh
./infrastructure/scripts/seed-handshake-channel.sh prod DISCORD_VOICE_CHANNEL_ID CAMPAIGN_UUID SESSION_UUID
```

Launch the Activity from that voice channel (rocket icon in VC). **Launch in DM** uses a different channel ID and will return `channel_not_linked` until mapped. After deleting and recreating a session, **reload the Activity** so players run handshake again (their JWT embeds the old `sessionId` until then).

5. **Player Activity deploy** — copy `apps/player-activity/.env.example` → `.env`, then from repo root:
   ```bash
   ./infrastructure/scripts/deploy-player-activity.sh prod
   ```
   (the script runs `pnpm build` with those `VITE_*` vars baked in, then S3 sync + CloudFront invalidation).
6. **Master app** — copy `apps/master-app/.env.example` → `.env`, then `cd apps/master-app && pnpm tauri build` (or `pnpm tauri dev`). Requires GM Discord OAuth for `POST /session/master/token`.

Print portal mappings:

```bash
chmod +x infrastructure/scripts/print-discord-url-mappings.sh
./infrastructure/scripts/print-discord-url-mappings.sh prod
```

### Discord Activity proxy (URL Mappings)

Inside Discord, network traffic is sandboxed. Register mappings under **Activities → URL Mappings** (`TARGET` without `https://`). List **`/api` before `/`**.

| PREFIX | TARGET (prod)                     |
| ------ | --------------------------------- |
| `/api` | `api.ambercoffer.belinde.click`   |
| `/`    | `table.ambercoffer.belinde.click` |

**OAuth2 → Redirects:** `https://table.ambercoffer.belinde.click`, `https://{APPLICATION_ID}.discordsays.com`, and `http://127.0.0.1:47832/oauth/callback` (master).

Both **player Activity** and **master-app** poll `GET /session/sync/state` every **2 s** (see ADR 0014). The master publishes snapshots via `PUT /session/sync/snapshot`; players POST move requests to `/session/sync/events`.

## Hostnames (prod)

| Service          | Host                                                         |
| ---------------- | ------------------------------------------------------------ |
| Vetrina          | `ambercoffer.belinde.click`, `www.ambercoffer.belinde.click` |
| Discord Activity | `table.ambercoffer.belinde.click`                            |
| API              | `api.ambercoffer.belinde.click`                              |

Dev uses `-dev` suffix on subdomain labels (`www-dev`, `table-dev`, `api-dev`).
