import { t, initI18n, onLanguageChange } from './i18n.js';
import { initTheme } from './theme.js';

const API_BASE = '/api/v1';
const SEARCH_DEBOUNCE_MS = 300;
const MIN_EXTERNAL_QUERY = 2;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const authSection = $('#auth-section');
const dashboardSection = $('#dashboard-section');
const loginForm = $('#login-form');
const registerForm = $('#register-form');
const tabLogin = $('#tab-login');
const tabRegister = $('#tab-register');
const toast = $('#toast');

let accessToken = localStorage.getItem('joulesToken');
let currentUserEmail = null;

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || t('errors.requestFailed', { status: res.status }));
    error.status = res.status;
    throw error;
  }
  return data;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function foodLabel(food) {
  return food.brand ? `${food.name} · ${food.brand}` : food.name;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function setToken(token) {
  accessToken = token;
  if (token) localStorage.setItem('joulesToken', token);
  else localStorage.removeItem('joulesToken');
}

function renderCurrentUser() {
  $('#user-email').textContent = currentUserEmail ? t('auth.currentUser', { email: currentUserEmail }) : '';
}

function showDashboard(email) {
  currentUserEmail = email;
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  renderCurrentUser();
  $('#target-date').value = formatDate(new Date());
  $('#summary-date').value = formatDate(new Date());
  $('#meal-date').value = formatDate(new Date());
  loadTarget(formatDate(new Date()));
  loadSummary(formatDate(new Date()));
  loadFoods();
  loadMeals(formatDate(new Date()));
}

function showAuth() {
  currentUserEmail = null;
  authSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  setToken(null);
}

function switchTab(tab) {
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: form.email.value,
        password: form.password.value,
      }),
    });
    setToken(data.accessToken);
    showDashboard(data.email);
    showToast(t('auth.loggedIn'));
    form.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: form.email.value,
        password: form.password.value,
      }),
    });
    setToken(data.accessToken);
    showDashboard(data.email);
    showToast(t('auth.registered'));
    form.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadFoods(query = '') {
  try {
    const data = await api(`/foods?q=${encodeURIComponent(query)}&limit=100`);
    const list = $('#food-list');
    const select = $('#meal-food');
    list.innerHTML = '';
    select.innerHTML = `<option value="">${t('addMeal.select')}</option>`;
    data.items.forEach((food) => {
      const per100g = t('foods.per100g', { calories: food.caloriesPer100g });
      const li = document.createElement('li');
      li.className = 'list-item';
      li.innerHTML = `<span>${escapeHtml(foodLabel(food))}</span><span class="muted">${escapeHtml(per100g)}</span>`;
      list.appendChild(li);

      const option = document.createElement('option');
      option.value = food.id;
      option.textContent = `${foodLabel(food)} (${per100g})`;
      select.appendChild(option);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let externalSearchSeq = 0;

async function loadExternalFoods(query) {
  const list = $('#external-food-list');
  const q = query.trim();
  if (q.length < MIN_EXTERNAL_QUERY) {
    list.innerHTML = `<p class="muted">${t('foods.externalHint')}</p>`;
    return;
  }
  const seq = ++externalSearchSeq;
  list.innerHTML = `<p class="muted">${t('foods.externalLoading')}</p>`;
  try {
    const data = await api(`/foods/external/search?q=${encodeURIComponent(q)}&limit=20`);
    if (seq !== externalSearchSeq) return;
    if (data.items.length === 0) {
      list.innerHTML = `<p class="muted">${t('foods.externalEmpty')}</p>`;
      return;
    }
    list.innerHTML = '';
    data.items.forEach((food) => {
      const li = document.createElement('li');
      li.className = 'list-item';
      const meta = [food.category, t('foods.per100g', { calories: food.caloriesPer100g })].filter(Boolean).join(' · ');
      li.innerHTML = `
        <div>
          ${escapeHtml(foodLabel(food))}<br />
          <span class="muted">${escapeHtml(meta)}</span>
        </div>
        <button type="button" class="btn-secondary">${t('foods.import')}</button>
      `;
      li.querySelector('button').addEventListener('click', () => importExternalFood(food));
      list.appendChild(li);
    });
  } catch (err) {
    if (seq !== externalSearchSeq) return;
    list.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

async function importExternalFood(food) {
  try {
    if (food.barcode) {
      await api('/foods/import', { method: 'POST', body: JSON.stringify({ barcode: food.barcode }) });
    } else {
      await api('/foods', { method: 'POST', body: JSON.stringify(food) });
    }
    showToast(t('foods.imported'));
    loadFoods($('#food-search').value);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setFoodFormVisible(visible) {
  const form = $('#food-form');
  if (!visible) form.reset();
  form.classList.toggle('hidden', !visible);
  if (visible) $('#food-name').focus();
}

function prefillFoodForm(food) {
  $('#food-name').value = food.name || '';
  $('#food-calories').value = food.caloriesPer100g ?? '';
  $('#food-protein').value = food.proteinPer100g ?? 0;
  $('#food-carbs').value = food.carbsPer100g ?? 0;
  $('#food-fat').value = food.fatPer100g ?? 0;
  $('#food-saturated-fat').value = food.saturatedFatPer100g ?? 0;
  $('#food-sugar').value = food.sugarPer100g ?? 0;
  $('#food-fiber').value = food.fiberPer100g ?? 0;
  $('#food-salt').value = food.saltPer100g ?? 0;
  $('#food-brand').value = food.brand || '';
  $('#food-category').value = food.category || '';
  $('#food-barcode').value = food.barcode || '';
  setFoodFormVisible(true);
}

async function handleBarcodeLookup(e) {
  e.preventDefault();
  const barcode = $('#barcode-input').value.trim();
  try {
    const data = await api(`/foods/barcode/${encodeURIComponent(barcode)}`);
    if (data.saved) {
      showToast(t('foods.barcodeFound', { name: data.food.name }));
      $('#food-search').value = data.food.name;
      loadFoods(data.food.name);
      return;
    }
    await importExternalFood(data.food);
  } catch (err) {
    if (err.status === 404) {
      showToast(t('foods.barcodeNotFound'), 'error');
      prefillFoodForm({ barcode });
      return;
    }
    showToast(err.message, 'error');
  }
}

async function loadProfile() {
  try {
    const profile = await api('/users/profile');
    $('#profile-weight').value = profile.weightKg ?? '';
    $('#profile-height').value = profile.heightCm ?? '';
    $('#profile-age').value = profile.age ?? '';
    $('#profile-gender').value = profile.gender ?? 'male';
    $('#profile-activity').value = profile.activityLevel ?? 'sedentary';
    $('#profile-message').textContent = '';
  } catch (err) {
    $('#profile-message').textContent = err.message;
  }
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const body = {
    weightKg: parseFloat($('#profile-weight').value),
    heightCm: parseFloat($('#profile-height').value),
    age: parseInt($('#profile-age').value, 10),
    gender: $('#profile-gender').value,
    activityLevel: $('#profile-activity').value,
  };
  try {
    await api('/users/profile', { method: 'PUT', body: JSON.stringify(body) });
    $('#profile-message').textContent = t('profile.saved');
    await loadTarget($('#target-date').value);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleCreateFood(e) {
  e.preventDefault();
  const body = {
    name: $('#food-name').value,
    caloriesPer100g: parseFloat($('#food-calories').value),
    proteinPer100g: parseFloat($('#food-protein').value) || 0,
    carbsPer100g: parseFloat($('#food-carbs').value) || 0,
    fatPer100g: parseFloat($('#food-fat').value) || 0,
    saturatedFatPer100g: parseFloat($('#food-saturated-fat').value) || 0,
    sugarPer100g: parseFloat($('#food-sugar').value) || 0,
    fiberPer100g: parseFloat($('#food-fiber').value) || 0,
    saltPer100g: parseFloat($('#food-salt').value) || 0,
    brand: $('#food-brand').value.trim() || null,
    category: $('#food-category').value.trim() || null,
    barcode: $('#food-barcode').value.trim() || null,
  };
  try {
    await api('/foods', { method: 'POST', body: JSON.stringify(body) });
    showToast(t('foods.created'));
    setFoodFormVisible(false);
    loadFoods($('#food-search').value);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadTarget(date) {
  try {
    const data = await api(`/daily-target?date=${encodeURIComponent(date)}`);
    $('#target-calories').value = data.targetCalories ?? '';
    $('#target-display').textContent = data.targetCalories
      ? t('target.display', { date, calories: data.targetCalories })
      : t('target.none', { date });
    await loadTargetSuggestions(date);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadTargetSuggestions(date) {
  try {
    const data = await api(`/daily-target/suggest?date=${encodeURIComponent(date)}`);
    const container = $('#target-suggestions');
    container.classList.toggle('hidden', !(data.previousTargetCalories || data.tdee));
    $('#target-use-previous').classList.toggle('hidden', !data.previousTargetCalories);
    $('#target-use-tdee').classList.toggle('hidden', !data.tdee);
    if (!data.targetCalories) {
      $('#target-display').textContent = data.previousTargetCalories
        ? t('target.previousAvailable', { date: data.previousDate, calories: data.previousTargetCalories })
        : t('target.none', { date });
    }
  } catch (err) {
    // suggestions are optional
    $('#target-suggestions').classList.add('hidden');
  }
}

async function usePreviousTarget() {
  const date = $('#target-date').value;
  try {
    const data = await api(`/daily-target/suggest?date=${encodeURIComponent(date)}`);
    if (data.previousTargetCalories) {
      $('#target-calories').value = data.previousTargetCalories;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function useTdeeTarget() {
  const date = $('#target-date').value;
  try {
    const data = await api(`/daily-target/suggest?date=${encodeURIComponent(date)}`);
    if (data.tdee) {
      $('#target-calories').value = data.tdee;
      $('#target-display').textContent = t('target.tdeeAvailable', { calories: data.tdee, bmr: data.bmr });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSetTarget(e) {
  e.preventDefault();
  const date = $('#target-date').value;
  const targetCalories = parseInt($('#target-calories').value, 10);
  try {
    await api('/daily-target', {
      method: 'PUT',
      body: JSON.stringify({ targetDate: date, targetCalories }),
    });
    showToast(t('target.updated'));
    loadTarget(date);
    loadSummary($('#summary-date').value);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadSummary(date) {
  try {
    const data = await api(`/meals?date=${encodeURIComponent(date)}`);
    $('#total-calories').textContent = data.totals.calories.toFixed(1);
    $('#total-protein').textContent = `${data.totals.protein.toFixed(1)} g`;
    $('#total-carbs').textContent = `${data.totals.carbs.toFixed(1)} g`;
    $('#total-fat').textContent = `${data.totals.fat.toFixed(1)} g`;

    const targetData = await api(`/daily-target?date=${encodeURIComponent(date)}`).catch(() => ({ targetCalories: null }));
    const target = targetData.targetCalories;
    const fill = $('#progress-fill');
    const text = $('#progress-text');
    if (target && target > 0) {
      const pct = Math.min((data.totals.calories / target) * 100, 100);
      fill.style.width = `${pct}%`;
      text.textContent = t('summary.progress', {
        calories: data.totals.calories.toFixed(1),
        target,
        pct: pct.toFixed(0),
      });
      fill.className = pct > 100 ? 'over' : '';
    } else {
      fill.style.width = '0%';
      text.textContent = t('summary.noTarget');
      fill.className = '';
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadMeals(date) {
  try {
    const data = await api(`/meals?date=${encodeURIComponent(date)}`);
    const container = $('#meals-list');
    if (data.items.length === 0) {
      container.innerHTML = `<p class="muted">${t('meals.empty')}</p>`;
      return;
    }
    container.innerHTML = '';
    data.items.forEach((meal) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div>
          <strong>${t(`meals.types.${meal.mealType}`)}</strong>: ${meal.food.name}<br />
          <span class="muted">${t('meals.entry', { grams: meal.quantityGrams, calories: meal.calculatedCalories.toFixed(1) })}</span>
        </div>
        <button class="btn-danger" data-id="${meal.id}">${t('meals.delete')}</button>
      `;
      div.querySelector('button').addEventListener('click', () => deleteMeal(meal.id, date));
      container.appendChild(div);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteMeal(id, date) {
  try {
    await api(`/meals/${id}`, { method: 'DELETE' });
    showToast(t('meals.deleted'));
    loadSummary(date);
    loadMeals(date);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function createSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = document.documentElement.lang === 'uk' ? 'uk-UA' : 'en-US';
  return recognition;
}

let voiceRecognition = null;
let lastVoiceResults = [];

function toggleVoiceInput() {
  if (voiceRecognition && voiceRecognition.listening) {
    voiceRecognition.stop();
    return;
  }
  const recognition = createSpeechRecognition();
  if (!recognition) {
    showToast(t('voice.unsupported'), 'error');
    return;
  }
  voiceRecognition = recognition;
  voiceRecognition.listening = true;
  $('#voice-status').textContent = t('voice.listening');
  $('#voice-toggle').classList.add('active');

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    $('#voice-status').textContent = transcript;
    await parseVoiceTranscript(transcript);
  };

  recognition.onerror = (event) => {
    $('#voice-status').textContent = t('voice.error');
    showToast(t('voice.error'), 'error');
    voiceRecognition = null;
    $('#voice-toggle').classList.remove('active');
  };

  recognition.onend = () => {
    voiceRecognition = null;
    $('#voice-toggle').classList.remove('active');
  };

  recognition.start();
}

async function parseVoiceTranscript(transcript) {
  try {
    $('#voice-status').textContent = t('voice.parsing');
    const locale = document.documentElement.lang === 'uk' ? 'uk' : 'en';
    const data = await api('/foods/parse-voice', {
      method: 'POST',
      body: JSON.stringify({ transcript, locale }),
    });
    lastVoiceResults = data.items || [];
    renderVoiceResults();
  } catch (err) {
    $('#voice-status').textContent = err.message;
    showToast(err.message, 'error');
  }
}

function renderVoiceResults() {
  const container = $('#voice-results-form');
  const list = $('#voice-results');
  if (!lastVoiceResults.length) {
    $('#voice-status').textContent = t('voice.empty');
    container.classList.add('hidden');
    return;
  }
  list.innerHTML = '';
  lastVoiceResults.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'list-item voice-result';
    li.innerHTML = `
      <label class="voice-result-label">
        <input type="checkbox" checked data-index="${index}" />
        <span>${escapeHtml(item.name)} — ${item.quantityGrams}g · ${item.calories} kcal</span>
      </label>
    `;
    list.appendChild(li);
  });
  container.classList.remove('hidden');
  $('#voice-status').textContent = t('voice.review');
}

async function confirmVoiceResults() {
  const checkboxes = [...$('#voice-results').querySelectorAll('input[type="checkbox"]:checked')];
  const selected = checkboxes.map((cb) => lastVoiceResults[Number(cb.dataset.index)]).filter(Boolean);
  if (!selected.length) return;

  try {
    for (const item of selected) {
      const body = {
        name: item.name,
        caloriesPer100g: item.quantityGrams > 0 ? Math.round((item.calories / item.quantityGrams) * 100 * 10) / 10 : item.calories,
        proteinPer100g: item.quantityGrams > 0 ? Math.round((item.protein / item.quantityGrams) * 100 * 10) / 10 : 0,
        carbsPer100g: item.quantityGrams > 0 ? Math.round((item.carbs / item.quantityGrams) * 100 * 10) / 10 : 0,
        fatPer100g: item.quantityGrams > 0 ? Math.round((item.fat / item.quantityGrams) * 100 * 10) / 10 : 0,
      };
      await api('/foods', { method: 'POST', body: JSON.stringify(body) });
    }
    showToast(t('voice.added'));
    $('#voice-results-form').classList.add('hidden');
    $('#voice-status').textContent = t('voice.hint');
    loadFoods($('#food-search').value);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleCreateMeal(e) {
  e.preventDefault();
  const body = {
    foodId: $('#meal-food').value,
    quantityGrams: parseFloat($('#meal-quantity').value),
    mealDate: $('#meal-date').value,
    mealType: $('#meal-type').value,
  };
  try {
    await api('/meals', { method: 'POST', body: JSON.stringify(body) });
    showToast(t('meals.added'));
    e.target.reset();
    $('#meal-date').value = body.mealDate;
    const date = $('#summary-date').value;
    loadSummary(date);
    loadMeals(date);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function refreshDashboard() {
  if (dashboardSection.classList.contains('hidden')) return;
  renderCurrentUser();
  const date = $('#summary-date').value;
  loadTarget($('#target-date').value);
  loadSummary(date);
  loadFoods($('#food-search').value);
  loadMeals(date);
}

function initMobileNav() {
  const links = [...document.querySelectorAll('.mobile-nav-link')];
  if (!links.length) return;
  const setActive = (id) => links.forEach((link) => link.classList.toggle('active', link.hash === `#${id}`));

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.querySelector(link.hash);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(target.id);
    });
  });

  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible.length) setActive(visible[0].target.id);
    },
    { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.25, 0.5] },
  );
  links.forEach((link) => {
    const target = document.querySelector(link.hash);
    if (target) observer.observe(target);
  });
}

async function init() {
  initTheme();
  initMobileNav();
  await initI18n();
  onLanguageChange(refreshDashboard);

  tabLogin.addEventListener('click', () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));
  loginForm.addEventListener('submit', handleLogin);
  registerForm.addEventListener('submit', handleRegister);
  $('#logout-btn').addEventListener('click', () => {
    showAuth();
    showToast(t('auth.loggedOut'));
  });

  $('#target-form').addEventListener('submit', handleSetTarget);
  $('#target-date').addEventListener('change', (e) => loadTarget(e.target.value));
  $('#target-use-previous').addEventListener('click', usePreviousTarget);
  $('#target-use-tdee').addEventListener('click', useTdeeTarget);
  $('#profile-form').addEventListener('submit', handleSaveProfile);
  $('#settings-toggle').addEventListener('click', async (event) => {
    const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
    event.currentTarget.setAttribute('aria-expanded', String(!expanded));
    $('#settings-section').classList.toggle('hidden', expanded);
    if (!expanded) await loadProfile();
  });

  $('#summary-date').addEventListener('change', (e) => {
    loadSummary(e.target.value);
    loadMeals(e.target.value);
  });
  $('#refresh-summary').addEventListener('click', () => {
    const date = $('#summary-date').value;
    loadSummary(date);
    loadMeals(date);
  });

  $('#meal-form').addEventListener('submit', handleCreateMeal);
  $('#voice-toggle').addEventListener('click', toggleVoiceInput);
  $('#voice-confirm').addEventListener('click', confirmVoiceResults);
  $('#food-form').addEventListener('submit', handleCreateFood);
  $('#toggle-food-form').addEventListener('click', () => setFoodFormVisible($('#food-form').classList.contains('hidden')));
  $('#cancel-food-form').addEventListener('click', () => setFoodFormVisible(false));
  const searchFoods = debounce((query) => {
    loadFoods(query);
    loadExternalFoods(query);
  }, SEARCH_DEBOUNCE_MS);
  $('#food-search').addEventListener('input', (e) => searchFoods(e.target.value));
  $('#barcode-form').addEventListener('submit', handleBarcodeLookup);

  if (accessToken) {
    try {
      const user = await api('/auth/me');
      showDashboard(user.email);
    } catch {
      showAuth();
    }
  }
}

init();
