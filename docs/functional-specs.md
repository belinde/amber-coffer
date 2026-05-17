---
title: Amber Coffer - Functional Specifications & User Experience
source: docs/archive/Amber Coffer - Functional Specifications  User Experience.rtf
converted_at: 2026-05-17
status: canonical
---

# Amber Coffer — Specifiche funzionali ed esperienza utente

## 1. Introduzione e visione

Amber Coffer è un **Narrative OS** che colma il divario tra il gioco di ruolo da tavolo live e la costruzione persistente del mondo. Automatizza le parti noiose del mestiere del GM (registrazione, trascrizione, aggiornamento dello stato del mondo) offrendo ai giocatori un'esperienza tattica integrata dentro Discord.

## 2. Esperienza Master (The Coffer)

L'applicazione Master è l'hub centrale del GM, desktop ad alte prestazioni.

- **Gestione multi-campagna**: creare e passare tra campagne, ciascuna con database SQLite e cartella asset isolati
- **Controllo bot Discord integrato**: interfaccia one-click per convocare il bot della campagna nel canale vocale
- **Registrazione audio multi-track**: cattura ad alta fedeltà per utente, salvata in locale (privacy e zero costi bandwidth cloud)
- **Dashboard tavolo tattico Master**: mappa completa con gestione mappe, token (PG/PNG) e Fog of War
- **World Vault (Lo Scrigno)**: database strutturato di PNG, Luoghi, Fazioni e Oggetti — sostituisce le note tradizionali con un sistema relazionale
- **Suite AI**:
  - **STT offline**: trascrizione batch con modelli Whisper locali
  - **Narrative Refinement**: pulizia LLM delle trascrizioni in prosa leggibile
  - **Entity Extraction**: rilevamento automatico di cambiamenti al mondo (es. "PNG X è morto", "il gruppo si è spostato a Silverton")
- **Interfaccia validazione Canone**: vista "Diff" dove il GM approva gli aggiornamenti suggeriti dall'AI prima che diventino ufficiali
- **One-Click Publishing**: aggiornamento immediato del sito pubblico "Amber" con i dati di sessione validati

## 3. Esperienza Player (The Activity)

Activity leggera, zero install, dentro Discord.

- **Video/voce integrati**: i giocatori restano nella call Discord mentre interagiscono con la mappa
- **Sincronizzazione real-time**: posizioni token e cambi mappa via AWS IoT Core
- **Interazione tattica**: drag-and-drop per i token controllati dal giocatore
- **Fog of War dinamico**: visibilità solo su ciò che il Master rivela
- **Focus di sessione**: niente menu complessi o schede personaggio — puro "monitor condiviso" tattico

## 4. Canon pubblico (The Amber Site)

Il lato pubblico della campagna — fonte di verità narrativa.

- **Living World Atlas**: esplorazione di Luoghi, PNG e stato attuale
- **Relationship Graphs**: rappresentazione visuale di legami tra fazioni e personaggi
- **Session Chronicles**: recap, giornali in-world (es. Deadwood Gazette), timeline storiche
- **Custom Branding**: sub-path o subdomain per campagna (es. `campaign-name.ambercoffer.com`)

## 5. Workflow narrativo

1. **Setup**: il Master apre il Coffer, invita il Bot nella call Discord
2. **Play**: il Master muove i token nel Coffer; i Player li vedono nell'Activity. Audio registrato in locale
3. **Process**: post-sessione, pipeline STT/AI
4. **Validate**: il Master revisiona i finding AI e approva le modifiche al Canone
5. **Publish**: click "Publish" — aggiorna il sito pubblico e lo stato persistente per la prossima sessione

Vedi [blueprint.md](./blueprint.md) per l'architettura tecnica e [glossary.md](./glossary.md) per la nomenclatura EN/IT.
