const API_BASE = '/api/v1';

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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function setToken(token) {
  accessToken = token;
  if (token) localStorage.setItem('joulesToken', token);
  else localStorage.removeItem('joulesToken');
}

function showDashboard(email) {
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  $('#user-email').textContent = email;
  const today = formatDate(new Date());
  $('#target-date').value = today;
  $('#summary-date').value = today;
  $('#meal-date').value = today;
  loadTarget(today);
  loadSummary(today);
  loadFoods();
  loadMeals(today);
}

function showAuth() {
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
    showDashboard(form.email.value);
    showToast('Logged in');
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
    showToast('Registered');
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
    select.innerHTML = '<option value="">Select food...</option>';
    data.items.forEach((food) => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.innerHTML = `<span>${food.name}</span><span class="muted">${food.caloriesPer100g} kcal/100g</span>`;
      list.appendChild(li);

      const option = document.createElement('option');
      option.value = food.id;
      option.textContent = `${food.name} (${food.caloriesPer100g} kcal/100g)`;
      select.appendChild(option);
    });
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
  };
  try {
    await api('/foods', { method: 'POST', body: JSON.stringify(body) });
    showToast('Food created');
    e.target.reset();
    $('#toggle-food-form').click();
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
      ? `Target for ${date}: ${data.targetCalories} kcal`
      : `No target set for ${date}`;
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
    showToast('Target updated');
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
      text.textContent = `${data.totals.calories.toFixed(1)} / ${target} kcal (${pct.toFixed(0)}%)`;
      fill.className = pct > 100 ? 'over' : '';
    } else {
      fill.style.width = '0%';
      text.textContent = 'Set a daily target to see progress.';
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
      container.innerHTML = '<p class="muted">No meals for selected date.</p>';
      return;
    }
    container.innerHTML = '';
    data.items.forEach((meal) => {
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div>
          <strong>${meal.mealType}</strong>: ${meal.food.name}<br />
          <span class="muted">${meal.quantityGrams} g · ${meal.calculatedCalories.toFixed(1)} kcal</span>
        </div>
        <button class="btn-danger" data-id="${meal.id}">Delete</button>
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
    showToast('Meal deleted');
    loadSummary(date);
    loadMeals(date);
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
    showToast('Meal added');
    e.target.reset();
    $('#meal-date').value = body.mealDate;
    const date = $('#summary-date').value;
    loadSummary(date);
    loadMeals(date);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function init() {
  tabLogin.addEventListener('click', () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));
  loginForm.addEventListener('submit', handleLogin);
  registerForm.addEventListener('submit', handleRegister);
  $('#logout-btn').addEventListener('click', () => {
    showAuth();
    showToast('Logged out');
  });

  $('#target-form').addEventListener('submit', handleSetTarget);
  $('#target-date').addEventListener('change', (e) => loadTarget(e.target.value));

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
  $('#food-form').addEventListener('submit', handleCreateFood);
  $('#toggle-food-form').addEventListener('click', () => $('#food-form').classList.toggle('hidden'));
  $('#food-search').addEventListener('input', (e) => loadFoods(e.target.value));

  if (accessToken) {
    try {
      await api('/auth/logout', { method: 'POST' });
      showDashboard(localStorage.getItem('joulesEmail') || 'User');
    } catch {
      showAuth();
    }
  }
}

init();
