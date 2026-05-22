---
inclusion: always
---

# Profilo AWS — regola ferrea

Per **qualsiasi** comando AWS CLI, CDK, `aws ssm`, S3 sync, CloudFront, DynamoDB su questo progetto:

```bash
export AWS_PROFILE=ambercoffer
```

- **Mai** usare il profilo `default`, `belinde` o altri profilo personali senza esplicita richiesta dell'utente.
- **Mai** eseguire `cdk deploy`, `cdk bootstrap` o script in `infrastructure/scripts/` senza `AWS_PROFILE=ambercoffer`.
- Regione workload CDK/API: `eu-west-1` (`CDK_DEFAULT_REGION=eu-west-1` se serve).
- Certificati CloudFront: bootstrap anche in `us-east-1` con lo stesso profilo.

Gli script in `infrastructure/scripts/` impostano il profilo automaticamente. Per comandi manuali:

```bash
export AWS_PROFILE=ambercoffer
export CDK_DEFAULT_REGION=eu-west-1
cd infrastructure && pnpm cdk deploy --all -c env=prod
```

Verifica account prima di deploy distruttivi:

```bash
AWS_PROFILE=ambercoffer aws sts get-caller-identity
```
