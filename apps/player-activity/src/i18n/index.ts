import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/common.json';
import es from './locales/es/common.json';
import fr from './locales/fr/common.json';
import it from './locales/it/common.json';

void i18n.use(initReactI18next).init({
  resources: {
    it: { common: it },
    en: { common: en },
    fr: { common: fr },
    es: { common: es },
  },
  lng: 'it',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
