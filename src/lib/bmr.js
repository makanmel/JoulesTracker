/**
 * Mifflin-St Jeor BMR and TDEE calculations.
 * Weight in kg, height in cm, age in years.
 */

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateBmr({ weightKg, heightCm, age, gender }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0 || !Number.isFinite(a) || a <= 0) {
    return null;
  }
  if (gender !== 'male' && gender !== 'female') {
    return null;
  }
  // Mifflin-St Jeor equation
  const bmr = 10 * w + 6.25 * h - 5 * a + (gender === 'male' ? 5 : -161);
  return Math.round(bmr);
}

export function calculateTdee({ weightKg, heightCm, age, gender, activityLevel }) {
  const bmr = calculateBmr({ weightKg, heightCm, age, gender });
  if (bmr === null) return null;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!multiplier) return null;
  return Math.round(bmr * multiplier);
}

export function getActivityLevels() {
  return Object.keys(ACTIVITY_MULTIPLIERS);
}
