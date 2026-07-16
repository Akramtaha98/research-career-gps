import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ThemeToggle pulls in useTheme() -- stub it the same way rather than
// wrapping in the real ThemeProvider, keeping this a focused Navbar test.
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

function renderNavbar(user = null) {
  mockUseAuth.mockReturnValue({ user, logout: vi.fn() });
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
}

describe('Navbar', () => {
  it('shows the brand name and a Log in link when signed out', () => {
    renderNavbar(null);
    expect(screen.getAllByText(/research gps/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
  });

  it('shows a Log out control instead of Log in once signed in', () => {
    renderNavbar({ id: '1', name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true });
    expect(screen.getAllByRole('button', { name: /log out/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument();
  });

  it('always links to the core sections regardless of auth state', () => {
    renderNavbar(null);
    for (const name of [/search/i, /dashboard/i, /predictor/i, /contact/i]) {
      expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0);
    }
  });
});
