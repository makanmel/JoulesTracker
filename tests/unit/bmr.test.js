import { describe, it, expect } from 'vitest';
import { ageFromBirthDate, calculateBmr, calculateTdee } from '../../src/lib/bmr.js';

function birthDateForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().split('T')[0];
}

describe('BMR/TDEE calculator', () => {
  it('calculates BMR for a male', () => {
    const bmr = calculateBmr({ weightKg: 70, heightCm: 175, birthDate: birthDateForAge(30), gender: 'male' });
    expect(bmr).toBe(Math.round(10 * 70 + 6.25 * 175 - 5 * 30 + 5));
  });

  it('calculates BMR for a female', () => {
    const bmr = calculateBmr({ weightKg: 60, heightCm: 165, birthDate: birthDateForAge(25), gender: 'female' });
    expect(bmr).toBe(Math.round(10 * 60 + 6.25 * 165 - 5 * 25 - 161));
  });

  it('returns null for invalid inputs', () => {
    expect(calculateBmr({ weightKg: 0, heightCm: 170, birthDate: birthDateForAge(30), gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 0, birthDate: birthDateForAge(30), gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 170, birthDate: '2999-01-01', gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 170, birthDate: 'not-a-date', gender: 'male' })).toBeNull();
    expect(calculateBmr({ weightKg: 70, heightCm: 170, birthDate: birthDateForAge(30), gender: 'unknown' })).toBeNull();
    expect(calculateBmr({ weightKg: null, heightCm: null, birthDate: null, gender: null })).toBeNull();
  });

  it('calculates TDEE using activity multiplier', () => {
    const profile = { weightKg: 70, heightCm: 175, birthDate: birthDateForAge(30), gender: 'male', activityLevel: 'moderate' };
    const bmr = calculateBmr(profile);
    expect(calculateTdee(profile)).toBe(Math.round(bmr * 1.55));
  });

  it('returns null for unsupported activity level', () => {
    expect(
      calculateTdee({ weightKg: 70, heightCm: 175, birthDate: birthDateForAge(30), gender: 'male', activityLevel: 'astronaut' }),
    ).toBeNull();
  });

  it('derives age from birthDate', () => {
    expect(ageFromBirthDate(birthDateForAge(30))).toBe(30);
    expect(ageFromBirthDate('2999-01-01')).toBeNull();
    expect(ageFromBirthDate('garbage')).toBeNull();
    expect(ageFromBirthDate(null)).toBeNull();
  });
});
