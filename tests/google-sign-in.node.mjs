import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { setTimeout, clearTimeout, setImmediate } from 'node:timers';
import { runInNewContext } from 'node:vm';

const file = readFileSync(new URL('../public/google-sign-in.js', import.meta.url), 'utf8');
const source = file.slice(file.indexOf('export function')).replace('export function', 'function');

function harness(responses = []) {
  const nodes = new Map();
  const calls = [];
  const successes = [];
  let googleConfig;
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: '', value: '', clientWidth: 300, hidden: id === 'google-link-form', listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      replaceChildren() {}, focus() {}, reset() { get('google-link-password').value = ''; },
    });
    return nodes.get(id);
  };
  const context = {
    document: { getElementById: get, documentElement: { lang: 'en' } },
    window: { google: { accounts: { id: { initialize(config) { googleConfig = config; }, renderButton() {} } } } },
    t: (key) => key, onLanguageChange() {}, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const result = responses.shift() || { body: { enabled: true, clientId: 'client', nonce: 'nonce' } };
      if (result.error) throw new Error('Offline');
      return { ok: (result.status || 200) < 400, status: result.status || 200, json: async () => result.body };
    },
  };
  runInNewContext(`${source}\nthis.initGoogleSignIn = initGoogleSignIn;`, context);
  const auth = context.initGoogleSignIn({ onSuccess: (data) => successes.push(data) });
  return { auth, get, calls, successes, google: () => googleConfig };
}

test('Google is primary and a successful credential uses the application session', async () => {
  const h = harness([{ body: { enabled: true, clientId: 'client', nonce: 'nonce' } }, { body: { email: 'user@example.com', accessToken: 'session' } }]);
  await h.auth.refresh();
  assert.equal(h.google().nonce, 'nonce');
  assert.equal(h.google().auto_select, false);
  await h.google().callback({ credential: 'google-token' });
  assert.equal(h.successes[0].accessToken, 'session');
  assert.equal(JSON.parse(h.calls[1].options.body).credential, 'google-token');
  assert.equal(h.get('google-link-form').hidden, true);
});

test('missing configuration and network failures expose the password fallback', async () => {
  for (const response of [{ body: { enabled: false } }, { error: true }]) {
    const h = harness([response]);
    await h.auth.refresh();
    assert.equal(h.get('email-auth').open, true);
    assert.equal(h.get('google-retry').hidden, false);
    assert.equal(h.successes.length, 0);
  }
});

test('linking requires password confirmation and clears credentials on success', async (context) => {
  const h = harness([
    { body: { enabled: true, clientId: 'client', nonce: 'nonce' } },
    { status: 409, body: { code: 'GOOGLE_LINK_REQUIRED', email: 'user@example.com' } },
    { status: 401, body: { error: 'Invalid credentials' } },
    { body: { email: 'user@example.com', accessToken: 'linked-session' } },
  ]);
  context.after(() => h.auth.clearPending());
  await h.auth.refresh();
  await h.google().callback({ credential: 'google-token' });
  assert.equal(h.get('google-link-form').hidden, false);
  assert.equal(h.successes.length, 0);
  h.get('google-link-password').value = 'wrong-password';
  h.get('google-link-form').listeners.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(h.get('google-status').textContent, 'auth.googleLinkFailed');
  assert.equal(h.successes.length, 0);
  h.get('google-link-password').value = 'correct-password';
  h.get('google-link-form').listeners.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(h.successes[0].accessToken, 'linked-session');
  assert.equal(h.get('google-link-password').value, '');
  assert.equal(h.get('google-link-form').hidden, true);
  assert.equal(JSON.parse(h.calls[3].options.body).password, 'correct-password');
});
