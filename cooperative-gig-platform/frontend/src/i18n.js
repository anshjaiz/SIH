import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en/translation.json';
import hi from './locales/hi/translation.json';
import hinglish from './locales/hinglish/translation.json';
import bn from './locales/bn/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      hinglish: { translation: hinglish },
      bn: { translation: bn },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi', 'hinglish', 'bn'],
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'appLanguage',
    },
    react: { useSuspense: false },
  });

export default i18n;