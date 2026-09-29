import { describe, it, expect } from 'vitest';
import { calculateBmr, calculateTdee } from '../../src/lib/bmr.js';

describe('BMR/TDEE calculator', () => {
  it('calculates BMR for a male', () => {
    const bmr = calculateBmr({ weightKg: 70, heightCm: 175, age: 30, gender: 'male' });
    expect(bmr).toBe(Math.round(10 * 70 + 6.25 * 175 - 5 * 30 + 5));
  });

  it('calculates BMR for a female', () => {
    const bmr = calculateBmr({ weightKg: 60, heightCm: 165, age: 25, gender: 'female' });
    expect(bmr).toBe(Math.round(10 * 60 + 6.25 * 165 - 5 * 25 - 161));
  });

  it('returns null for invalid inputs', () => {
    expect(calculateBmr({ weightKg: 0, heightCm: 170, age: 30, gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 0, age: 30, gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 170, age: 0, gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 170, age: 30, gender: 'unknown' })).toBeNull();
    expect(calculateBmr({ weightKg: null, heightCm: null, age: null, gender: null })).toBeNull();
  });

  it('calculates TDEE using activity multiplier', () => {
    const profile = { weightKg: 70, heightCm: 175, age: 30, gender: 'male', activityLevel: 'moderate' };
    const bmr = calculateBmr(profile);
    expect(calculateTdee(profile)).toBe(Math.round(bmr * 1.55));
  });

  it('returns null for unsupported activity level', () => {
    expect(calculateTdee({ weightKg: 70, heightCm: 175, age: 30, gender: 'male', activityLevel: 'astronaut' })).toBeNull();
  });
});
