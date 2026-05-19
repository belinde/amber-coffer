# Amber Coffer — AWS CDK

Infrastructure for web hosting, HTTP session sync, public canon, and Bedrock (see [ADR 0013](../docs/adr/0013-aws-web-hosting-and-dns.md), [ADR 0014](../docs/adr/0014-session-http-polling-sync.md)).

## Prerequisites

- Node.js via nvm (repo root `.nvmrc`)
- AWS CLI configured (`CDK_DEFAULT_ACCOUNT`, or `aws configure`)
- CDK bootstrap in **two regions** (same account):

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && . "$NVM_DIR/nvm.sh"
nvm use

export AWS_PROFILE=ambercoffer   # optional

cd infrastructure
pnpm build

# Workload stacks (eu-west-1)
cdk bootstrap aws://ACCOUNT_ID/eu-west-1 -c env=prod

# CloudFront certificates (us-east-1)
cdk bootstrap aws://ACCOUNT_ID/us-east-1 -c env=prod
```

## Synth and deploy

```bash
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
4. Seed a **voice channel** mapping (the Discord voice channel ID where the GM runs the Activity — not a DM or text channel). Enable Developer Mode in Discord, right-click the voice channel → Copy channel ID:

```bash
chmod +x infrastructure/scripts/seed-handshake-channel.sh
./infrastructure/scripts/seed-handshake-channel.sh prod DISCORD_VOICE_CHANNEL_ID CAMPAIGN_UUID SESSION_UUID
```

Launch the Activity from that voice channel (rocket icon in VC). **Launch in DM** uses a different channel ID and will return `channel_not_linked` until mapped.

5. **Player Activity deploy** — copy `apps/player-activity/.env.example` → `.env`, then from repo root:
   ```bash
   AWS_PROFILE=ambercoffer ./infrastructure/scripts/deploy-player-activity.sh prod
   ```
   (the script runs `pnpm build` with those `VITE_*` vars baked in, then S3 sync + CloudFront invalidation).
6. **Master app** — copy `apps/master-app/.env.example` → `.env`, then `cd apps/master-app && pnpm tauri build` (or `pnpm tauri dev`). Requires GM Discord OAuth for `POST /session/master/token`.

Print portal mappings:

```bash
chmod +x infrastructure/scripts/print-discord-url-mappings.sh
AWS_PROFILE=ambercoffer ./infrastructure/scripts/print-discord-url-mappings.sh prod
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
