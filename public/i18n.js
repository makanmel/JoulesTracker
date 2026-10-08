const SUPPORTED_LANGUAGES = ['en', 'uk'];
const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'joulesLang';

const messages = {};
let currentLanguage = DEFAULT_LANGUAGE;
const listeners = new Set();

function normalizeLanguage(value) {
  if (!value) return null;
  const base = String(value).toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

function detectLanguage() {
  const stored = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;
  const candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const lang = normalizeLanguage(candidate);
    if (lang) return lang;
  }
  return DEFAULT_LANGUAGE;
}

async function loadMessages(lang, optional = false) {
  if (messages[lang]) return messages[lang];
  const res = await fetch(`locales/${lang}.json`).then(
    (response) => response,
    () => null,
  );
  if (!res || !res.ok) {
    if (optional) return null;
    throw new Error(`Failed to load locale "${lang}"`);
  }
  const loaded = await res.json().then(
    (data) => data,
    () => null,
  );
  if (!loaded) {
    if (optional) return null;
    throw new Error(`Failed to parse locale "${lang}"`);
  }
  messages[lang] = loaded;
  return messages[lang];
}

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dict);
}

function interpolate(template, params) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : ''));
}

export function t(key, params = {}) {
  const value = lookup(messages[currentLanguage], key) ?? lookup(messages[DEFAULT_LANGUAGE], key);
  if (typeof value !== 'string') return key;
  return interpolate(value, params);
}

export function getLanguage() {
  return currentLanguage;
}

export function applyTranslations(root = document) {
  document.documentElement.lang = currentLanguage;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  root.querySelectorAll('[data-lang]').forEach((el) => {
    el.classList.toggle('active', el.dataset.lang === currentLanguage);
    el.setAttribute('aria-pressed', String(el.dataset.lang === currentLanguage));
  });
}

export async function setLanguage(lang) {
  const next = normalizeLanguage(lang) ?? DEFAULT_LANGUAGE;
  await loadMessages(next);
  currentLanguage = next;
  localStorage.setItem(STORAGE_KEY, next);
  applyTranslations();
  listeners.forEach((fn) => fn(next));
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function initI18n() {
  await loadMessages(DEFAULT_LANGUAGE);
  const lang = detectLanguage();
  const preferredMessages = lang === DEFAULT_LANGUAGE ? messages[DEFAULT_LANGUAGE] : await loadMessages(lang, true);
  currentLanguage = preferredMessages ? lang : DEFAULT_LANGUAGE;
  applyTranslations();
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });
}
