import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import ar from './locales/ar/translation.json';
import es from './locales/es/translation.json';
import de from './locales/de/translation.json';
import fr from './locales/fr/translation.json';
import ms from './locales/ms/translation.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ms', label: 'Bahasa Melayu', dir: 'ltr' },
];

export const RTL_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code);

// Applies <html dir="rtl|ltr" lang="xx"> — Tailwind's default utilities
// (padding/margin/text-align) are LTR-authored, so RTL layout here is
// "functional" (readable, correctly mirrored text direction) rather than a
// pixel-perfect mirrored layout. Good enough for a beta launch; a dedicated
// RTL pass (logical properties / rtl: variants) can tighten it up later.
function applyDocumentDirection(lng) {
  const code = (lng || 'en').split('-')[0];
  const dir = RTL_LANGUAGES.includes(code) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = code;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
      ms: { translation: ms },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar', 'es', 'de', 'fr', 'ms'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'rcgps_language',
    },
  });

applyDocumentDirection(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
