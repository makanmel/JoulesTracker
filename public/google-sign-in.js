import { t, onLanguageChange } from './i18n.js';

export function initGoogleSignIn({ onSuccess }) {
  const get = (id) => document.getElementById(`google-${id}`);
  const fallback = document.getElementById('email-auth');
  let config = null;
  let preparing = null;
  let scriptPromise = null;
  let pendingCredential = null;
  let pendingExpiry = null;
  let submitting = false;
  let statusKey = 'auth.googleLoading';
  const status = (key) => {
    statusKey = key;
    get('status').textContent = t(key);
  };
  const clearPending = () => {
    clearTimeout(pendingExpiry);
    pendingCredential = null;
    get('link-form').reset();
    get('link-form').hidden = true;
  };
  const fail = (key) => {
    status(key);
    fallback.open = true;
    get('retry').hidden = false;
  };
  const exchange = async (credential, password) => {
    if (submitting) return;
    submitting = true;
    get('link-submit').disabled = true;
    const result = await fetch('/api/v1/auth/google', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, ...(password ? { password } : {}) }),
    }).then(async (res) => ({ ok: res.ok, status: res.status, body: await res.json() })).catch(() => null);
    submitting = false;
    get('link-submit').disabled = false;
    if (result?.body.code === 'GOOGLE_LINK_REQUIRED') {
      clearPending();
      pendingCredential = credential;
      pendingExpiry = setTimeout(() => { clearPending(); fail('auth.googleExpired'); }, 10 * 60 * 1000);
      get('link-email').textContent = result.body.email;
      get('link-form').hidden = false;
      status('auth.googleLinkRequired');
      get('link-password').focus();
      return;
    }
    if (!result?.ok || !result.body.accessToken) {
      fail(password && result?.status === 401 ? 'auth.googleLinkFailed' : 'auth.googleFailed');
      return;
    }
    clearPending();
    status('auth.googleReady');
    onSuccess(result.body);
  };
  const loadScript = () => {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const timeout = setTimeout(() => reject(new Error('Google script timed out')), 15000);
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Google script unavailable')); };
      document.head.appendChild(script);
    }).catch((error) => { scriptPromise = null; throw error; });
    return scriptPromise;
  };
  const renderButton = () => {
    if (!config?.enabled || !window.google?.accounts?.id) return;
    get('button').replaceChildren();
    window.google.accounts.id.initialize({
      client_id: config.clientId,
      nonce: config.nonce,
      auto_select: false,
      callback: ({ credential }) => exchange(credential),
    });
    window.google.accounts.id.renderButton(get('button'), {
      theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
      width: Math.max(200, Math.min(360, get('button').clientWidth)),
      locale: document.documentElement.lang,
    });
  };
  const refresh = () => {
    if (preparing) return preparing;
    clearPending();
    get('button').replaceChildren();
    get('retry').hidden = true;
    status('auth.googleLoading');
    preparing = fetch('/api/v1/auth/google/config', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => { if (!res.ok) throw new Error('Google configuration unavailable'); return res.json(); })
      .then(async (data) => {
        config = data;
        if (!config.enabled) { fail('auth.googleUnavailable'); return; }
        await loadScript();
        renderButton();
        status('auth.googleReady');
      })
      .catch(() => fail('auth.googleFailed'))
      .finally(() => { preparing = null; });
    return preparing;
  };
  get('link-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (pendingCredential && !submitting) exchange(pendingCredential, get('link-password').value);
  });
  get('retry').addEventListener('click', refresh);
  onLanguageChange(() => { status(statusKey); renderButton(); });
  refresh();
  return { refresh, clearPending };
}
