import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('rcg_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await client.get('/auth/me');
        setUser(data.user);
      } catch {
        localStorage.removeItem('rcg_token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function login(newToken, newUser) {
    localStorage.setItem('rcg_token', newToken);
    setToken(newToken);
    setUser(newUser);
  }

  /**
   * Used by the ORCID callback page, which only has a JWT in hand (ORCID's
   * redirect carries no user object) — sets the token and lets the existing
   * loadUser effect above fetch /auth/me once `token` changes.
   */
  function loginWithToken(newToken) {
    localStorage.setItem('rcg_token', newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem('rcg_token');
    setToken(null);
    setUser(null);
  }

  /** Re-fetches the current user — used after returning from Stripe Checkout. */
  async function refreshUser() {
    if (!token) return;
    try {
      const { data } = await client.get('/auth/me');
      setUser(data.user);
    } catch {
      // ignore — next natural load will retry
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
