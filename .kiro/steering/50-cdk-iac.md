---
inclusion: fileMatch
fileMatchPattern: ['infrastructure/**']
---

# Infrastructure (CDK)

- **Profilo AWS**: sempre `AWS_PROFILE=ambercoffer` (vedi [.cursor/rules/55-aws-profile.mdc](mdc:.cursor/rules/55-aws-profile.mdc))
- Stack separati per dominio (certificati, web, API, IoT, handshake, canon pubblico, AI)
- Tag risorse obbligatori (`Project`, `Environment`, `Component`)
- **Nessun segreto** hardcoded — usare parametri/SSM in fasi future
- Naming AWS: `amber-coffer-{env}-{suffix}`; SSM `/amber-coffer/{env}/...`
- Hostname solo via `infrastructure/lib/config/hosts.ts` ([ADR 0013](mdc:docs/adr/0013-aws-web-hosting-and-dns.md))
- Hosted zone `ambercoffer.belinde.click` import-only (mai crearla in CDK)
- Certificato CloudFront in `us-east-1`; workload e API in `eu-west-1`
- Log groups: retention **365 giorni** (`LogRetentionAspect` su `App`)
- Default CDK context env: `prod`; dev con `-c env=dev`
- Stub stack non-core: `synth()` valido; IoT/Canon/Bedrock restano placeholder fino a implementazione
