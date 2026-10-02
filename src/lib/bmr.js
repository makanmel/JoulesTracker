/**
 * Mifflin-St Jeor BMR and TDEE calculations.
 * Weight in kg, height in cm, birthDate as ISO date (YYYY-MM-DD).
 */

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function ageFromBirthDate(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime()) || d > now) return null;
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age > 0 ? age : null;
}

export function calculateBmr({ weightKg, heightCm, birthDate, gender }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = ageFromBirthDate(birthDate);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0 || a === null) {
    return null;
  }
  if (gender !== 'male' && gender !== 'female') {
    return null;
  }
  // Mifflin-St Jeor equation
  const bmr = 10 * w + 6.25 * h - 5 * a + (gender === 'male' ? 5 : -161);
  return Math.round(bmr);
}

export function calculateTdee({ weightKg, heightCm, birthDate, gender, activityLevel }) {
  const bmr = calculateBmr({ weightKg, heightCm, birthDate, gender });
  if (bmr === null) return null;
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!multiplier) return null;
  return Math.round(bmr * multiplier);
}

export function getActivityLevels() {
  return Object.keys(ACTIVITY_MULTIPLIERS);
}
