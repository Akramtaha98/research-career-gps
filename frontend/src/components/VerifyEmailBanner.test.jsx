import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerifyEmailBanner from './VerifyEmailBanner';

// Mocked at the module level (not via a real AuthProvider) so each test can
// control exactly what `user` useAuth() returns without needing a real
// login flow or network call — see App.jsx for where this component is
// actually mounted against the real AuthProvider.
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockPost = vi.fn();
vi.mock('../api/client', () => ({
  default: { post: (...args) => mockPost(...args) },
}));

describe('VerifyEmailBanner', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockPost.mockReset();
  });

  it('renders nothing when signed out', () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the account is confirmed', () => {
    mockUseAuth.mockReturnValue({ user: { emailVerified: true } });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the confirmation prompt for an unverified account, and resending posts to /auth/resend-verification', async () => {
    mockUseAuth.mockReturnValue({ user: { emailVerified: false } });
    mockPost.mockResolvedValue({ data: { message: 'Confirmation email sent — check your inbox.' } });

    render(<VerifyEmailBanner />);
    expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/auth/resend-verification'));
    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());
  });

  it('shows the server-provided error message when resending fails', async () => {
    mockUseAuth.mockReturnValue({ user: { emailVerified: false } });
    mockPost.mockRejectedValue({ response: { data: { error: 'Something went wrong' } } });

    render(<VerifyEmailBanner />);
    fireEvent.click(screen.getByRole('button', { name: /resend/i }));

    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });
});
