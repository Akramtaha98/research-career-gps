import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function pick(code) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-2 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition flex items-center gap-1"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span aria-hidden>🌐</span> {current.label}
      </button>
      {open && (
        <div
          className="absolute end-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 text-start"
          role="listbox"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => pick(l.code)}
              className={`w-full text-start px-3 py-2 text-sm hover:bg-slate-50 transition ${
                l.code === current.code ? 'font-semibold text-brand-600' : 'text-slate-700'
              }`}
              role="option"
              aria-selected={l.code === current.code}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
