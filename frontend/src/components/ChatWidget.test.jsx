import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatWidget from './ChatWidget';

const mockUseResearcher = vi.fn();
vi.mock('../context/ResearcherContext', () => ({
  useResearcher: () => mockUseResearcher(),
}));

const PAPERS = [
  { id: 'a', title: 'Paper A', citations: 12, year: 2019 },
  { id: 'b', title: 'Paper B', citations: 8, year: 2020 },
  { id: 'c', title: 'Paper C', citations: 6, year: 2022 },
];

function renderWidget({ papers = PAPERS, name = 'Ada Lovelace', source = 'live' } = {}) {
  mockUseResearcher.mockReturnValue({ researcher: { name }, papers, source });
  return render(<ChatWidget />);
}

describe('ChatWidget', () => {
  beforeEach(() => {
    mockUseResearcher.mockReset();
  });

  it('starts collapsed, showing only the launcher button', () => {
    renderWidget();
    expect(screen.getByRole('button', { name: /ask assistant/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask about your h-index/i)).not.toBeInTheDocument();
  });

  it('opens on click and greets with the real computed H-index', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('button', { name: /ask assistant/i }));

    expect(screen.getByPlaceholderText(/ask about your h-index/i)).toBeInTheDocument();
    // citations [12, 8, 6] -> h = 3, and it should greet by first name.
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/H-index is currently 3/)).toBeInTheDocument();
  });

  it('answers a typed question with a grounded reply', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('button', { name: /ask assistant/i }));

    const input = screen.getByPlaceholderText(/ask about your h-index/i);
    await user.type(input, 'what should I do to improve?{Enter}');

    // The user's own message echoes immediately...
    expect(screen.getByText('what should I do to improve?')).toBeInTheDocument();
    // ...and the grounded reply lands after the short typing delay.
    await waitFor(
      () => expect(screen.getByText(/Here's what would move the needle most/i)).toBeInTheDocument(),
      { timeout: 3000 }
    );
  });

  it('offers clickable suggestion chips so it is usable without typing', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('button', { name: /ask assistant/i }));

    const chip = await screen.findByRole('button', { name: /how's my h-index trending/i });
    await user.click(chip);

    await waitFor(() => expect(screen.getByText(/You're at H-index 3 right now/i)).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('tells the user to load a researcher first when none is tracked', async () => {
    const user = userEvent.setup();
    renderWidget({ papers: [], name: null });
    await user.click(screen.getByRole('button', { name: /ask assistant/i }));

    expect(await screen.findByText(/search for yourself/i)).toBeInTheDocument();
  });

  it('closes again from the panel header', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('button', { name: /ask assistant/i }));
    expect(screen.getByPlaceholderText(/ask about your h-index/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByPlaceholderText(/ask about your h-index/i)).not.toBeInTheDocument();
  });
});
