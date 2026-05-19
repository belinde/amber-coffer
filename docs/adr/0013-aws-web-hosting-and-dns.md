# ADR 0013: Web hosting AWS e convenzioni DNS

**Stato**: Accettato  
**Data**: 2026-05-18

## Contesto

Amber Coffer deve pubblicare:

- **Sito vetrina** (futuro app o generator statico, non ancora nel monorepo)
- **Discord Activity** (`apps/player-activity`) — SPA statica
- **API web** — handshake sessione e endpoint HTTP futuri

Esiste già una hosted zone Route53 `ambercoffer.belinde.click` (`Z06272853TVZ225L4FXR9`). Il CDK in `infrastructure/` aveva solo stack stub (IoT, handshake, canon, Bedrock).

Vincoli: un account AWS; primo deploy solo `prod`; stesso codice CDK per `dev` (`-c env=dev`); costi minimi; log CloudWatch con retention 1 anno.

## Decisione

### Hostname

| Servizio        | prod                              | dev                                   |
| --------------- | --------------------------------- | ------------------------------------- |
| Vetrina apex    | `ambercoffer.belinde.click`       | —                                     |
| Vetrina www     | `www.ambercoffer.belinde.click`   | `www-dev.ambercoffer.belinde.click`   |
| Player Activity | `table.ambercoffer.belinde.click` | `table-dev.ambercoffer.belinde.click` |
| API HTTP        | `api.ambercoffer.belinde.click`   | `api-dev.ambercoffer.belinde.click`   |

Prod vetrina risponde su **apex e www** (stesso contenuto, senza redirect 301 obbligatorio; canonical SEO nel sito quando esiste).

Pattern hostname centralizzato in `infrastructure/lib/config/hosts.ts`. Vietato hardcodare FQDN negli stack.

### Stack CDK

| Stack                             | Regione     | Ruolo                                                          |
| --------------------------------- | ----------- | -------------------------------------------------------------- |
| `AmberCoffer-Cert-{env}`          | `us-east-1` | ACM per CloudFront: apex, `www`, `*.ambercoffer.belinde.click` |
| `AmberCoffer-Web-{env}`           | `eu-west-1` | S3 + CloudFront (vetrina + player-activity) + record Route53   |
| `AmberCoffer-Api-{env}`           | `eu-west-1` | HTTP API + Lambda; certificato ACM regionale per `api*`        |
| IoT / Handshake / Canon / Bedrock | `eu-west-1` | Invariati; DynamoDB handshake nello stack dedicato             |

Due distribution CloudFront (vetrina e table): le cache behavior sono per path, non per host — stesso certificato ACM, PriceClass_100. Certificato API separato in `eu-west-1` (requisito API Gateway).

### Cross-stack

- Parametri SSM `/amber-coffer/{env}/...` (no export CloudFormation fragili).
- Hosted zone **import-only** (`fromHostedZoneAttributes`).

### Costo vs manodopera

- Nessun WAF in MVP.
- Deploy artefatti: script `aws s3 sync` manuale / CI futura.
- S3 Standard, senza versioning sui bucket deploy statici.

### Fase 2 (non in questo ADR)

- Canon pubblico L3 e CDN `models/` ([ADR 0006](./0006-image-storage-strategy.md), [ADR 0010](./0010-local-model-artifacts-and-updates.md)): path su apex o subdomain `{campaign}` / `cdn` quando servono policy cache distinte.

## Conseguenze

### Positive

- Mappa DNS e naming documentati; multi-env senza fork del codice.
- CloudFront ed API allineati al dominio di prodotto.

### Negative

- Due certificati ACM (us-east-1 per CloudFront, eu-west-1 per API).
- Vetrina ancora placeholder finché non esiste l’app marketing.

## Riferimenti

- [ADR 0012](./0012-amber-discord-application.md) — Activity URL → `table*`
- `infrastructure/README.md`
- `.cursor/rules/50-cdk-iac.mdc`
