export function calculateCalories(caloriesPer100g, quantityGrams) {
  return Math.round((caloriesPer100g * quantityGrams) / 10) / 10;
}
