import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricCard from './MetricCard';

describe('MetricCard', () => {
  it('renders its label and value', () => {
    render(<MetricCard label="H-index" value={12} accent="brand" />);
    expect(screen.getByText('H-index')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders an optional sublabel and icon', () => {
    render(<MetricCard label="Citations" value="1,204" sublabel="all time" accent="sky" icon="❝" />);
    expect(screen.getByText('all time')).toBeInTheDocument();
    expect(screen.getByText('❝')).toBeInTheDocument();
  });

  it('falls back to the brand accent for an unknown accent name', () => {
    // Guards the ACCENTS lookup: an unrecognised accent used to produce
    // `undefined` in the className string rather than a sane default.
    const { container } = render(<MetricCard label="X" value={1} accent="not-a-real-accent" />);
    expect(container.querySelector('.text-brand-600')).toBeTruthy();
  });

  it('omits the icon chip entirely when no icon is given', () => {
    const { container } = render(<MetricCard label="X" value={1} />);
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBe(1); // the top rule only
  });
});
