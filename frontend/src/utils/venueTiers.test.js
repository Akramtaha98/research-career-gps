import { describe, it, expect } from 'vitest';
import { getMultiplier, getTierForVenue, TIERS } from './venueTiers';

describe('venueTiers', () => {
  it('getMultiplier falls back to 1x for unknown or average tiers', () => {
    expect(getMultiplier('average')).toBe(1.0);
    expect(getMultiplier('nonexistent')).toBe(1.0);
  });

  it('getMultiplier ranks top above strong above average above emerging', () => {
    expect(TIERS.top.multiplier).toBeGreaterThan(TIERS.strong.multiplier);
    expect(TIERS.strong.multiplier).toBeGreaterThan(TIERS.average.multiplier);
    expect(TIERS.average.multiplier).toBeGreaterThan(TIERS.emerging.multiplier);
  });

  it('getTierForVenue matches known venue name patterns', () => {
    expect(getTierForVenue('Nature Communications')).toBe('top');
    expect(getTierForVenue('NeurIPS')).toBe('top');
    expect(getTierForVenue('KDD')).toBe('strong');
    expect(getTierForVenue('Some Random Workshop')).toBe('emerging');
  });

  it('getTierForVenue returns null for an unrecognized or empty venue', () => {
    expect(getTierForVenue('Totally Unknown Venue')).toBeNull();
    expect(getTierForVenue('')).toBeNull();
    expect(getTierForVenue(null)).toBeNull();
  });
});
