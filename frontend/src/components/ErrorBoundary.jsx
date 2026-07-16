import { Component } from 'react';

/**
 * Catches render/lifecycle errors anywhere below it in the tree and shows a
 * fallback card instead of an unrecoverable blank white page — mounted once
 * around the whole app in main.jsx. Must be a class component; React error
 * boundaries have no hook equivalent.
 *
 * Deliberately has ZERO dependencies on anything that could itself be
 * broken (i18n, AuthContext, ThemeContext, react-router) — an error
 * boundary's whole job is to still render correctly when something else in
 * the app has already crashed, so it can't assume any of those are working.
 * Plain hardcoded English strings here, same reasoning CLAUDE.md documents
 * for backend error/note strings being English-only by precedent.
 *
 * Hook a real error-tracking service (Sentry or similar) into
 * componentDidCatch below once one is set up — currently just
 * console.error, which only reaches Railway/Vercel's own logs.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error caught by ErrorBoundary:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/search';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div
          style={{
            width: '100%',
            maxWidth: '28rem',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
          }}
        >
          <p style={{ fontSize: '2rem', margin: 0 }}>⚠️</p>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0.75rem 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
            This page hit an unexpected error. Your data is safe — try reloading, or head back to the dashboard.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: '0.6rem',
                background: '#4f46e5',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: '0.6rem',
                background: '#f1f5f9',
                color: '#0f172a',
                fontWeight: 600,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
