import { test } from 'node:test';
import { URL } from 'node:url';
import { TextDecoder } from 'node:util';
import { APP_VERSION, CHANGELOG } from '../public/version.js';
import { recommendedTargets, macroGrams, parseBirthDate, formatBirthDate, initTargetSetup } from '../public/target-setup.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/onboarding.js', import.meta.url), 'utf8')
  .slice(readFileSync(new URL('../public/onboarding.js', import.meta.url), 'utf8').indexOf('export function'))
  .replace('export function', 'function');

function harness() {
  const nodes = new Map();
  const homes = new Map();
  class Element {
    constructor(id = '') {
      this.id = id;
      this.dataset = {};
      this.listeners = new Map();
      this.hiddenClasses = new Set();
      this.classList = {
        add: (value) => this.hiddenClasses.add(value),
        remove: (value) => this.hiddenClasses.delete(value),
        contains: (value) => this.hiddenClasses.has(value),
        toggle: (value, on) => on ? this.hiddenClasses.add(value) : this.hiddenClasses.delete(value),
      };
      this.valid = true;
      this.disabled = false;
      this.textContent = '';
      if (id) nodes.set(id, this);
    }
    setAttribute() {}
    focus() {}
    appendChild() {}
    replaceWith(replacement) {
      if (replacement.dataset.onboardingHome) homes.set(this.id, replacement);
      else homes.delete(replacement.id);
    }
    set innerHTML(html) {
      for (const match of html.matchAll(/id="([^"]+)"/g)) new Element(match[1]);
    }
    querySelector(selector) { return nodes.get(selector.slice(1)); }
    addEventListener(type, callback) {
      this.listeners.set(type, [...(this.listeners.get(type) || []), callback]);
    }
    dispatchEvent(event) {
      return Promise.all((this.listeners.get(event.type) || []).map((callback) => callback(event)));
    }
    click() { if (!this.disabled) return this.dispatchEvent({ type: 'click' }); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    reportValidity() { return this.valid; }
    requestSubmit() {
      this.dispatchEvent({ type: 'submit', preventDefault() {}, stopImmediatePropagation() {} });
    }
  }
  const document = new Element();
  document.body = new Element();
  document.createElement = () => {
    const el = new Element();
    if (!document.dialog) document.dialog = el;
    return el;
  };
  document.getElementById = (id) => nodes.get(id);
  document.querySelector = (selector) => selector.startsWith('#')
    ? nodes.get(selector.slice(1))
    : homes.get(selector.match(/="([^"]+)"/)[1]);
  document.querySelectorAll = () => [];
  for (const id of ['settings-section', 'settings-toggle', 'settings-pane-theme', 'settings-pane-profile', 'settings-pane-target', 'settings-pane-ai', 'profile-form', 'target-form', 'voice-settings-form', 'onboarding-restart', 'target-suggestions']) new Element(id);
  const store = new Map();
  let email = 'first@example.com';
  const factory = runInNewContext(`${source}\ninitOnboarding`, {
    document,
    localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    t: (key) => key,
    onLanguageChange() {},
  });
  let failSave = false;
  const api = async (path, options) => {
    assert.equal(path, '/users/onboarding');
    if (options) {
      if (failSave) throw new Error('offline');
      store.set(email, JSON.parse(options.body).state);
    }
    return { state: store.get(email) ?? '0' };
  };
  const wizard = factory({ api, loadProfile: async () => {}, loadTarget: async () => {}, date: () => '2026-11-03', email: () => email });
  const next = () => nodes.get('onboarding-next').click();
  const saved = (detail) => document.dispatchEvent({ type: 'setup-saved', detail });
  return { wizard, nodes, store, document, homes, next, saved, failSave: (value) => { failSave = value; }, setEmail: (value) => { email = value; } };
}

test('walks through successful saves, completes and does not reopen automatically', async () => {
  const h = harness();
  await h.wizard.open();
  assert.equal(h.homes.size, 3);
  await h.next();
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.profileTitle');
  await h.next();
  assert.equal(h.nodes.get('onboarding-next').disabled, true);
  await h.saved('target');
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.profileTitle');
  await h.saved('profile');
  await h.next(); await h.saved('target');
  await h.next(); await h.saved('ai');
  await h.next();
  assert.equal(h.document.dialog.open, false);
  assert.equal(h.homes.size, 0);
  assert.equal(h.store.get('first@example.com'), 'done');
  await h.wizard.open();
  assert.equal(h.document.dialog.open, false);
});

test('invalid forms and save failures never advance', async () => {
  const h = harness();
  await h.wizard.open(); await h.next();
  h.nodes.get('profile-form').valid = false;
  await h.next();
  assert.equal(h.nodes.get('onboarding-next').disabled, false);
  h.nodes.get('profile-form').valid = true;
  await h.next();
  h.document.dispatchEvent({ type: 'setup-failed' });
  assert.equal(h.nodes.get('onboarding-next').disabled, false);
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.profileTitle');
  assert.equal(h.nodes.get('onboarding-error').textContent, 'onboarding.error');
});

test('supports back, resume, dismissal, restart and separate account state', async () => {
  const h = harness();
  await h.wizard.open(); await h.next(); await h.next(); await h.saved('profile');
  await h.nodes.get('onboarding-back').click();
  h.wizard.close();
  await h.wizard.open();
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.profileTitle');
  await h.nodes.get('onboarding-later').click();
  await h.wizard.open();
  assert.equal(h.document.dialog.open, false);
  await h.wizard.open(true);
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.welcomeTitle');
  h.wizard.close();
  h.setEmail('second@example.com');
  await h.wizard.open();
  assert.equal(h.document.dialog.open, true);
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.welcomeTitle');
});

test('translations contain matching wizard instructions', () => {
  const en = JSON.parse(readFileSync(new URL('../public/locales/en.json', import.meta.url))).onboarding;
  const uk = JSON.parse(readFileSync(new URL('../public/locales/uk.json', import.meta.url))).onboarding;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(uk).sort());
  for (const step of ['welcome', 'profile', 'target', 'ai', 'ready']) {
    assert.ok(en[`${step}Help`].length > 100);
    assert.ok(uk[`${step}Help`].length > 100);
  }
});

test('account progress is loaded on another session and a failed write does not advance', async () => {
  const h = harness();
  h.store.set('first@example.com', '2');
  await h.wizard.open();
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.targetTitle');
  h.failSave(true);
  await h.next(); await h.saved('target');
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.targetTitle');
  assert.equal(h.nodes.get('onboarding-next').disabled, false);
  assert.equal(h.nodes.get('onboarding-error').textContent, 'onboarding.error');
  h.failSave(false);
  await h.next(); await h.saved('target');
  assert.equal(h.store.get('first@example.com'), '3');
  assert.equal(h.nodes.get('onboarding-title').textContent, 'onboarding.aiTitle');
});

test('locales are valid UTF-8 and release notes match the application version', () => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(APP_VERSION, pkg.version);
  assert.equal(lock.version, APP_VERSION);
  assert.equal(lock.packages[''].version, APP_VERSION);
  assert.equal(CHANGELOG[0].version, APP_VERSION);
  for (const lang of ['en', 'uk']) {
    const text = decoder.decode(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url)));
    assert.equal(text.includes(String.fromCharCode(0xfffd)), false);
    const locale = JSON.parse(text);
    for (const release of CHANGELOG) {
      for (const key of release.items) {
        const value = key.split('.').reduce((node, part) => node?.[part], locale);
        assert.equal(typeof value, 'string');
        assert.ok(value.length > 0);
      }
    }
  }
});

test('weight-based recommendations include all tracked targets and total 100%', () => {
  const targets = recommendedTargets(80, 2000);
  assert.equal(targets.proteinPct, 19.2);
  assert.equal(targets.fatPct, 36);
  assert.equal(targets.carbsPct, 44.8);
  assert.equal(targets.proteinPct + targets.fatPct + targets.carbsPct, 100);
  assert.equal(targets.fiber, 25);
  assert.equal(targets.salt, 5);
  assert.equal(targets.sugar, 50);
  assert.equal(targets.saturated, 22.2);
  assert.equal(macroGrams(2000, targets.proteinPct, 4), 96);
  assert.equal(macroGrams(2000, targets.fatPct, 9), 80);
  assert.equal(macroGrams(2500, 20, 4), 125);
  for (const values of [[0, 2000], [80, 0], [80, 500], [Infinity, 2000], [80, Infinity]]) {
    assert.equal(recommendedTargets(...values), null);
  }
  assert.equal(macroGrams(2000, '', 4), null);
  assert.equal(macroGrams(2000, -10, 4), null);
});

test('birthdate entry is day/month/year and rejects impossible or future dates', () => {
  const today = new Date(2026, 10, 4);
  assert.equal(parseBirthDate('28/04/1979', today), '1979-04-28');
  assert.equal(formatBirthDate('1979-04-28'), '28/04/1979');
  assert.equal(parseBirthDate('29/02/2000', today), '2000-02-29');
  for (const value of ['04/28/1979', '31/04/1979', '29/02/2001', '01/01/2999', '', '1979-04-28']) {
    assert.equal(parseBirthDate(value, today), null);
  }
});

test('target prefills preserve existing values, update grams and allow explicit reset', (context) => {
  const nodes = new Map();
  const previous = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } });
      return nodes.get(id);
    },
  };
  context.after(() => { globalThis.document = previous; });
  const setup = initTargetSetup({ t: (key, values = {}) => key + JSON.stringify(values) });
  const get = (id) => globalThis.document.getElementById(id);
  get('target-calories').value = '2500';
  get('target-protein-pct').value = '25';
  get('target-fiber').value = '30';
  setup.setSuggestions({ weightKg: 80, tdee: 2000 }, true);
  assert.equal(get('target-calories').value, '2500');
  assert.equal(get('target-protein-pct').value, '25');
  assert.equal(get('target-fiber').value, '30');
  assert.equal(get('target-fat-pct').value, 28.8);
  assert.equal(get('target-carbs-pct').value, 46.2);
  assert.ok(get('target-protein-grams').textContent.includes('156.3'));
  get('target-use-recommended').listeners.click();
  assert.equal(get('target-calories').value, 2000);
  assert.equal(get('target-protein-pct').value, 19.2);
  assert.equal(get('target-fiber').value, 25);
});
