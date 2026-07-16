import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router doesn't reset scroll position on navigation the way a
 * traditional multi-page site does — without this, following a link from
 * partway down a long page (e.g. Search results, or a long Dashboard) lands
 * on the next page already scrolled down, which reads as broken/janky.
 * Rendered once near the top of App.jsx; no visible UI of its own.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
