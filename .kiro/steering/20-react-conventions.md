---
inclusion: fileMatch
fileMatchPattern: ['apps/**/*.{ts,tsx}']
---

# Convenzioni React

- Componenti funzionali; hooks per stato ed effetti
- **Nessuna stringa UI hardcoded** — usare `useTranslation()` e chiavi `domain.scope.key`
- Prop drilling max 2 livelli; oltre usare composition o context leggero
- Accessibilità: label, ruoli ARIA, focus keyboard su controlli interattivi
- File `kebab-case.tsx`; componenti `PascalCase`
- Import da `@amber/shared` per tipi dominio, mai duplicare interfacce locali
- Componenti UI conmotion da `@amber/ui`; in master-app i thin wrapper in `components/ui/` sono ammessi solo per i18n — vedi [.cursor/rules/70-ui-design-system.mdc](mdc:.cursor/rules/70-ui-design-system.mdc)
