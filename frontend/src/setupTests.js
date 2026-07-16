// Wires jest-dom's matchers (toBeInTheDocument, toHaveTextContent, ...) into
// Vitest's `expect` -- loaded automatically for every test file via
// vite.config.js's `test.setupFiles`.
import '@testing-library/jest-dom/vitest';

// Initializes the real i18next instance (same resources/config the app
// itself uses) once for the whole test run, so any component under test
// that calls useTranslation() gets real translated strings instead of
// missing-key warnings or a crash from an unconfigured instance.
import i18n from './i18n';

beforeEach(() => {
  // Deterministic language for every test regardless of jsdom's default
  // navigator.language or whatever a previous test left in localStorage.
  i18n.changeLanguage('en');
});
