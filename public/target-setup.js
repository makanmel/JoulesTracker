export function recommendedTargets(weightKg, calories) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(calories) || !(weightKg > 0) || !(calories > 0)) return null;
  const proteinGrams = weightKg * 1.2;
  const fatGrams = weightKg;
  const remaining = calories - proteinGrams * 4 - fatGrams * 9;
  if (remaining <= 0) return null;
  const proteinPct = Math.round(proteinGrams * 4 / calories * 1000) / 10;
  const fatPct = Math.round(fatGrams * 9 / calories * 1000) / 10;
  return {
    calories: Math.round(calories),
    proteinPct,
    fatPct,
    carbsPct: Math.round((100 - proteinPct - fatPct) * 10) / 10,
    fiber: 25,
    salt: 5,
    saturated: Math.round(calories * 0.1 / 9 * 10) / 10,
    sugar: Math.round(calories * 0.1 / 4 * 10) / 10,
  };
}

export function macroGrams(calories, percent, energyPerGram) {
  if (!Number.isFinite(calories) || !(calories > 0) || percent === '' || !Number.isFinite(Number(percent)) || percent < 0 || percent > 100) return null;
  return Math.round(calories * Number(percent) / 100 / energyPerGram * 10) / 10;
}

export function parseBirthDate(value, today = new Date()) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso || Number(year) < 1900) return null;
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso <= current ? iso : null;
}

export function formatBirthDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function initTargetSetup({ t }) {
  const input = (id) => document.getElementById(`target-${id}`);
  const fields = { calories: 'calories', proteinPct: 'protein-pct', fatPct: 'fat-pct', carbsPct: 'carbs-pct', fiber: 'fiber', salt: 'salt', saturated: 'saturated', sugar: 'sugar' };
  let suggestion = null;
  let weight = null;
  let maintenance = null;
  const update = () => {
    const calories = Number(input('calories').value);
    for (const [metric, energy] of [['protein', 4], ['fat', 9], ['carbs', 4]]) {
      const grams = macroGrams(calories, input(`${metric}-pct`).value, energy);
      document.getElementById(`target-${metric}-grams`).textContent = grams === null ? '' : t('target.gramsHint', { grams });
    }
    document.getElementById('target-recommendation').textContent = suggestion
      ? t('target.recommendation', { weight, protein: Math.round(weight * 1.2 * 10) / 10, fat: weight, calories: maintenance })
      : t('target.recommendationMissing');
    document.getElementById('target-use-recommended').disabled = !suggestion;
  };
  const fill = (overwrite = false) => {
    if (!suggestion) return;
    const calories = Number(input('calories').value) || maintenance;
    const defaults = overwrite ? suggestion : recommendedTargets(weight, calories);
    if (!defaults) return;
    for (const [key, id] of Object.entries(fields)) {
      if (overwrite || input(id).value === '') {
        const value = key === 'carbsPct'
          ? Math.round((100 - Number(input('protein-pct').value) - Number(input('fat-pct').value)) * 10) / 10
          : defaults[key];
        if (value >= 0) input(id).value = value;
      }
    }
    update();
  };
  document.getElementById('target-form').addEventListener('input', update);
  document.getElementById('target-use-recommended').addEventListener('click', () => fill(true));
  return {
    update,
    setSuggestions(data, prefill) {
      weight = data.weightKg;
      maintenance = data.tdee;
      suggestion = recommendedTargets(weight, maintenance);
      if (prefill) fill();
      update();
    },
  };
}
