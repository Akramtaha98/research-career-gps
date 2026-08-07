import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LanguageSwitcher from './LanguageSwitcher';

function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white hover:bg-white/10 transition ${className}`}
      aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 1 0 20.354 15.354z" />
        </svg>
      )}
    </button>
  );
}

const navItem = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
  }`;

const mobileNavItem = ({ isActive }) =>
  `block px-3 py-2.5 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    setOpen(false);
    navigate('/login');
  }

  function closeMenu() {
    setOpen(false);
  }

  // `sticky top-0`: the nav is the only way between the six main sections,
  // so forcing a scroll back to the top of a long Dashboard/paper table just
  // to switch tabs was the biggest piece of friction in the layout. Sits
  // below the modal/chat z-layers (z-50) on purpose.
  return (
    <nav className="bg-brand-gradient shadow-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <Link to="/" onClick={closeMenu} className="flex items-center gap-2 text-white font-bold text-lg shrink-0 min-w-0">
          <span aria-hidden className="shrink-0">🧭</span>
          <span className="truncate">{t('nav.brand')}</span>
        </Link>

        {/* Desktop nav — hidden below md */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <NavLink to="/search" className={navItem}>{t('nav.search')}</NavLink>
          <NavLink to="/how-it-works" className={navItem}>{t('nav.guide')}</NavLink>
          <NavLink to="/dashboard" className={navItem}>{t('nav.dashboard')}</NavLink>
          <NavLink to="/timeline" className={navItem}>{t('nav.timeline')}</NavLink>
          <NavLink to="/predictor" className={navItem}>{t('nav.predictor')}</NavLink>
          <NavLink to="/actions" className={navItem}>{t('nav.actions')}</NavLink>
          <NavLink to="/verify" className={navItem}>{t('nav.verify')}</NavLink>
          <NavLink to="/contact" className={navItem}>{t('nav.contact')}</NavLink>
          {user ? (
            <button onClick={handleLogout} className="ml-2 px-3 py-2 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10 transition">
              {t('nav.logout')}
            </button>
          ) : (
            <NavLink to="/login" className={navItem}>{t('nav.login')}</NavLink>
          )}
          <ThemeToggle />
          <LanguageSwitcher />
        </div>

        {/* Mobile controls — theme toggle + hamburger below md; language switcher stays reachable inside the panel */}
        <div className="md:hidden flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-white hover:bg-white/10 transition"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="md:hidden border-t border-white/10 px-4 sm:px-6 py-3 space-y-1">
          <NavLink to="/search" onClick={closeMenu} className={mobileNavItem}>{t('nav.search')}</NavLink>
          <NavLink to="/how-it-works" onClick={closeMenu} className={mobileNavItem}>{t('nav.guide')}</NavLink>
          <NavLink to="/dashboard" onClick={closeMenu} className={mobileNavItem}>{t('nav.dashboard')}</NavLink>
          <NavLink to="/timeline" onClick={closeMenu} className={mobileNavItem}>{t('nav.timeline')}</NavLink>
          <NavLink to="/predictor" onClick={closeMenu} className={mobileNavItem}>{t('nav.predictor')}</NavLink>
          <NavLink to="/actions" onClick={closeMenu} className={mobileNavItem}>{t('nav.actions')}</NavLink>
          <NavLink to="/verify" onClick={closeMenu} className={mobileNavItem}>{t('nav.verify')}</NavLink>
          <NavLink to="/contact" onClick={closeMenu} className={mobileNavItem}>{t('nav.contact')}</NavLink>
          {user ? (
            <button onClick={handleLogout} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-white/90 hover:bg-white/10 transition">
              {t('nav.logout')}
            </button>
          ) : (
            <NavLink to="/login" onClick={closeMenu} className={mobileNavItem}>{t('nav.login')}</NavLink>
          )}
          <div className="pt-2 mt-2 border-t border-white/10">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </nav>
  );
}
