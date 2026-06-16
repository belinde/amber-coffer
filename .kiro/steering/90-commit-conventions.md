# Commit message conventions (commitlint)

Il progetto usa `@commitlint/config-conventional` con scope fissi.

## Formato

```
type(scope): descrizione breve in inglese
```

- **type** (obbligatorio): `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `ci`, `build`, `revert`
- **scope** (obbligatorio, validato): uno dei valori in `commitlint.config.cjs`
- **subject** (obbligatorio): prima lettera minuscola, niente punto finale, max ~72 caratteri

## Scope ammessi

| Scope             | Quando usare                                       |
| ----------------- | -------------------------------------------------- |
| `master-app`      | Tauri + React master app                           |
| `player-activity` | Discord Activity React                             |
| `shared`          | `packages/shared` (tipi, schema)                   |
| `discord-bot`     | `apps/discord-bot`                                 |
| `whisper`         | `tools/sidecars/whisper` (Python pipeline)         |
| `infrastructure`  | AWS CDK, deploy                                    |
| `docs`            | Documentazione (`docs/`, ADR, README)              |
| `deps`            | Aggiornamento dipendenze (Renovate, manual)        |
| `ci`              | CI/CD pipeline                                     |
| `root`            | Config root (ESLint, Turbo, tsconfig, husky, ecc.) |

## Regole

1. Se il commit tocca **un solo scope**, usa quello direttamente.
2. Se tocca **più scope** in una sola feature, scegli lo scope dominante o usa `root` per commit cross-cutting.
3. **Breaking changes**: aggiungi `!` dopo scope, e.g. `feat(shared)!: rename RecordingManifest`
4. **Body** opzionale: separato da riga vuota, wrappato a 100 colonne.
5. **Footer**: `Refs: #issue` o `BREAKING CHANGE: ...` se serve.

## Esempi validi

```
feat(discord-bot): replace Ogg recording with WAV writer
fix(master-app): handle pipeline timeout on stop recording
test(whisper): add property tests for live pipeline utilities
refactor(shared): extend manifest schema with pcm_wav codec
chore(root): add discord-bot and whisper scopes to commitlint
```

## Anti-pattern

- `feat: something` → manca lo scope (rifiutato)
- `feat(bot): ...` → scope non nella lista (rifiutato)
- `Feat(shared): ...` → type deve essere minuscolo (rifiutato)
- `feat(shared): Add something.` → no maiuscola iniziale, no punto finale
