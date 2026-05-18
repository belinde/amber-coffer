import type { PlayLanguage } from '@amber/shared';

export type AnnouncementKind = 'recording-start' | 'recording-stop';

export const RECORDING_ANNOUNCEMENT_COPY: Record<PlayLanguage, Record<AnnouncementKind, string>> = {
  it: {
    'recording-start': 'Comincio a registrare, buona giocata!',
    'recording-stop': 'Ho finito di registrare, ciao a tutti!',
  },
  en: {
    'recording-start': "I'm starting to record, have a great game!",
    'recording-stop': "I've finished recording, goodbye everyone!",
  },
  fr: {
    'recording-start': 'Je commence à enregistrer, bonne partie !',
    'recording-stop': "J'ai fini d'enregistrer, à bientôt !",
  },
  es: {
    'recording-start': 'Empiezo a grabar, ¡buena partida!',
    'recording-stop': 'He terminado de grabar, ¡hasta luego!',
  },
};

/** espeak-ng base voice per play language (combined with +variant in generator). */
export const ESPEAK_BASE_VOICE: Record<PlayLanguage, string> = {
  it: 'it',
  en: 'en-gb',
  fr: 'fr-fr',
  es: 'es',
};
