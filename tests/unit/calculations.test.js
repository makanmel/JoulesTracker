import { describe, it, expect } from 'vitest';
import { calculateCalories } from '../../src/lib/calculations.js';

describe('calculateCalories', () => {
  it('returns 247.5 for 165 kcal/100g and 150g', () => {
    expect(calculateCalories(165, 150)).toBe(247.5);
  });

  it('rounds to one decimal place', () => {
    expect(calculateCalories(123.456, 100)).toBe(123.5);
  });

  it('returns zero for zero quantity', () => {
    expect(calculateCalories(200, 0)).toBe(0);
  });
});
