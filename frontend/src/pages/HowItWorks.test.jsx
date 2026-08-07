import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HowItWorks from './HowItWorks';

function renderGuide() {
  return render(
    <MemoryRouter>
      <HowItWorks />
    </MemoryRouter>
  );
}

describe('HowItWorks guide', () => {
  it('renders every step of the tour', () => {
    renderGuide();
    // One link per step plus the top call-to-action; the guide is useless if
    // any step silently fails to render.
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(8);
  });

  it('links each step to the page it describes', () => {
    renderGuide();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const path of ['/search', '/dashboard', '/actions', '/predictor', '/timeline', '/verify']) {
      expect(hrefs).toContain(path);
    }
  });

  it('explains both floating widgets so users can find them', () => {
    renderGuide();
    // These two call-outs are the only in-app documentation of the chat and
    // feedback buttons, which are otherwise unlabelled icons in the corners.
    expect(screen.getByText(/bottom-left/i)).toBeInTheDocument();
    expect(screen.getByText(/bottom-right/i)).toBeInTheDocument();
  });

  it('renders a heading and does not throw on a bare render', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
